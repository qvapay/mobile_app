import { useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, type ScrollViewInstance } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

// Helpers
import { percentAmount } from '../../helpers/amountInput'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'
import QPCoinPicker from '../../ui/QPCoinPicker'
import WithdrawAmountCard from './WithdrawAmountCard'
import WithdrawSatsCard from './WithdrawSatsCard'
import WithdrawAccountFields from './WithdrawAccountFields'
import CashZoneFields from './CashZoneFields'
import WithdrawDestinationSelector from './WithdrawDestinationSelector'
import SavedMethodsModal from '../../ui/SavedMethodsModal'
import PinConfirmStep from '../transaction/PinConfirmStep'

// Formulario (monedas, montos, campos dinámicos, fees) y paso de PIN/OTP
import useWithdrawForm, { MIN_SATS_REDEEM } from './useWithdrawForm'
import useWithdrawSubmit from './useWithdrawSubmit'

// Gate de KYC (retiros > $1000)
import useKycGate, { KYC_WITHDRAW_THRESHOLD } from '../../hooks/useKycGate'
import KycGateModal from '../../ui/KycGateModal'

// Atestación OFAC: CACR con destino Cuba, W-1 en retiros cripto
import useOfacGate from '../../hooks/useOfacGate'
import OfacAttestationModal from '../../ui/OfacAttestationModal'
import { withdrawAttestationScope } from '../../helpers/ofacCompliance'
import type { WithdrawAttestation } from './useWithdrawSubmit'

// Cuenta de Cuba por un método de EE. UU. (a quién paga + propósito + declaraciones) y factura en PDF
import UsRailPurposeCard from './UsRailPurposeCard'
import WithdrawInvoiceField from './WithdrawInvoiceField'
import { US_RAIL_QUERY, useUsRailQuery } from './withdrawQueries'
import { buildUsRailPayload, emptyUsRailValue, invoiceRequiredFor, isUsRailComplete, missingFromError, usRailApplies } from './usRail'
import type { InvoiceFile, UsRailValue } from './usRail'
import { keyFromFieldName } from './withdrawFees'

// Routes
import { ROUTES } from '../../routes'

// Types
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'

// Quick coin pills for withdraw
const DEFAULT_WITHDRAW_COINS = [
	{ tick: 'BANK_CUP', label: 'CUP' },
	{ tick: 'BANK_MLC', label: 'MLC' },
	{ tick: 'CLASICA', label: 'Clásica' },
	{ tick: 'ETECSA', label: 'ETECSA' },
]
const RECENT_WITHDRAW_KEY = 'qp_recent_withdraw_coins'

const PERCENT_CHIPS = [25, 50, 100] as const

type WithdrawProps = NativeStackScreenProps<RootStackParamList, 'Withdraw'>

/**
 * Withdraw balance into a payout coin/method — two steps: form, then PIN/OTP confirm.
 * Coins come from `GET /coins/v2?enabled_out=true`; each coin's `working_data` JSON
 * drives the dynamic account fields, and fees (`fee_out` / `fee_out_fixed`) are
 * computed client-side alongside a live USD↔coin amount converter.
 * Accepts `route.params.preselectedCoin` (e.g. USDCASH from CashDeliveryCard).
 * Crypto coins gate the account fields behind a destination selector (own
 * wallet vs third parties — third-party payouts are blocked), mirroring the
 * web wizard's DestinationStep.
 * Lightning (BTCLN): `route.params.lnInvoice` / `lnAmountSats` (from the QR scanner)
 * prefill the destination and lock the amount to the invoice; a "Saldo | Satoshis"
 * toggle lets the user redeem their cashback sats instead of debiting USD balance
 * (`source: 'satoshis'`, no fee, minimum MIN_SATS_REDEEM).
 * Confirmation uses an emailed PIN (`withdrawApi.requestPin`) or a 6-digit TOTP,
 * then submits `POST /withdraw`.
 *
 * La aritmética del formulario vive en `useWithdrawForm` y el paso de
 * confirmación en `useWithdrawSubmit`; aquí queda solo la composición.
 */
const Withdraw = ({ navigation, route }: WithdrawProps) => {

	const { t, i18n } = useTranslation()

	// Gate de KYC — intercepta antes del paso de PIN
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()

	// Gate OFAC — tras el de KYC; la atestación vale para ESTE intento (ref, ligada al tick)
	const { requireAttestation, modalProps: ofacModalProps } = useOfacGate()
	const attestationRef = useRef<WithdrawAttestation | null>(null)

	// Requisitos de los métodos de EE. UU. para una cuenta de Cuba (los textos los sirve el servidor)
	const queryClient = useQueryClient()
	const { requirements: usRailReq, refetch: refetchUsRail } = useUsRailQuery(true)
	const [usRailValue, setUsRailValue] = useState<UsRailValue | null>(null)
	const [usRailLanguage, setUsRailLanguage] = useState<'es' | 'en'>(() => (String(i18n.language || '').startsWith('en') ? 'en' : 'es'))
	const [usRailHighlight, setUsRailHighlight] = useState<string[]>([])
	const [invoice, setInvoice] = useState<InvoiceFile | null>(null)

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Scroll del form — el paso de PIN aparece debajo del fold y hay que llevarlo a la vista
	const scrollViewRef = useRef<ScrollViewInstance>(null)

	const currency = 'QUSD'

	// Lightning params from the QR scanner (Scan → parseLightningQR)
	const lnAmountSats = Number(route?.params?.lnAmountSats) || 0

	const {
		availableCoins, selectedCoin, showCoinPicker, setShowCoinPicker, handleCoinSelect, loadingCoins,
		amountQUSD, amountCoin, handleChangeQUSD, handleChangeAmountCoin, balance, amountLocked, amountLimit,
		source, setSource, amountSats, setAmountSats, sourceSats, availableSats, canRedeemSats, isBTCLN, lnInfo, lnError,
		isCrypto, destination, setDestination,
		workingFields, workingForm, setWorkingForm, selectFeePct, previewFee,
		cashMode, cashZone, provinceKey, municipalityKey, feeBreakdown, receiveUsd, belowZoneMin, cashZonesStatus, retryCashZones,
		savedForCoin, applySavedMethod,
		isFormValid, resetAmounts,
	} = useWithdrawForm({
		preselectedCoin: route?.params?.preselectedCoin,
		prefillAddress: route?.params?.prefillAddress,
		lnInvoice: route?.params?.lnInvoice,
		lnAmountSats,
		prefillAmount: route?.params?.amount,
	})

	// Cambiar de método vacía el formulario de EE. UU. y la factura: eran para otro destino
	// (patrón "ajustar estado al cambiar una prop", sin efecto)
	const coinTick = selectedCoin?.tick ?? null
	const [usRailTick, setUsRailTick] = useState(coinTick)
	if (usRailTick !== coinTick) {
		setUsRailTick(coinTick)
		setUsRailValue(null)
		setUsRailHighlight([])
		setInvoice(null)
	}
	const usRailOn = !sourceSats && usRailApplies(usRailReq, coinTick)
	const usRailForm = usRailValue ?? emptyUsRailValue((usRailReq?.declarations || []).map(d => d.key))
	const invoiceRequired = !sourceSats && invoiceRequiredFor({ tick: coinTick, amount: amountQUSD, usRailOn, payee: usRailForm.payee })
	const usRailReady = !usRailOn || isUsRailComplete(usRailForm, usRailReq)
	const invoiceReady = !invoiceRequired || !!invoice
	const usPayment = usRailOn && usRailReq ? buildUsRailPayload(usRailForm, usRailReq, usRailLanguage) : null
	// Sugerencia de destinatario: el nombre del beneficiario del formulario del método
	const payeeField = workingFields.find(field => /nombre/i.test(String(field.name)))
	const payeeHint = payeeField ? (workingForm[keyFromFieldName(payeeField.name)] || '') : ''
	const changeUsRail = (next: UsRailValue) => { setUsRailValue(next); if (usRailHighlight.length) setUsRailHighlight([]) }
	const changeInvoice = (file: InvoiceFile | null) => { setInvoice(file); if (usRailHighlight.includes('invoice')) setUsRailHighlight(usRailHighlight.filter(k => k !== 'invoice')) }

	// El «librito» de métodos guardados (misma hoja que P2PCreate)
	const [showSavedMethods, setShowSavedMethods] = useState(false)
	const openPaymentMethodsSettings = () => {
		setShowSavedMethods(false)
		navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.PAYMENT_METHODS, initial: false })
	}


	/**
	 * Chips de porcentaje sobre el saldo, como en el swap de la wallet.
	 *
	 * Con el importe congelado por una factura escaneada no salen: no hay nada que elegir,
	 * y un chip que no responde se lee como una pantalla rota.
	 */
	const percentChips = useMemo(() => {
		const max = Number(balance) || 0
		if (amountLocked || max <= 0) { return undefined }
		return PERCENT_CHIPS.map(percent => ({
			key: String(percent),
			label: percent === 100 ? t('withdraw.amountCard.max') : `${percent}%`,
			onPress: () => handleChangeQUSD(percentAmount(max, percent)),
		}))
	}, [balance, amountLocked, t, handleChangeQUSD])
	const {
		pin, setPin, codeLength, twoFactorMethod, codeInputRef, handleMethodToggle, hasOTP,
		showPinStep, setShowPinStep, sendingPin, sendingWithdraw,
		handleRequestPin, handleWithdraw, handlePinBoxFocus,
	} = useWithdrawSubmit({
		amountQUSD, amountSats, sourceSats, selectedCoin, workingFields, workingForm, scrollViewRef, attestationRef,
		isFormValid: isFormValid && usRailReady && invoiceReady,
		usPayment: usRailOn ? usPayment : null,
		invoice: invoiceRequired ? invoice : null,
		onUsRailError: (kind, details) => {
			// El servidor manda: se releen los requisitos y se marca lo que faltó
			refetchUsRail()
			if (kind === 'purpose') setUsRailHighlight(missingFromError(details))
			if (kind === 'invoice') {
				const code = (details as { code?: unknown } | null)?.code
				// Un PDF rechazado por su contenido no sirve para reintentar
				if (code === 'INVOICE_INVALID' || code === 'INVOICE_HAS_PAN') setInvoice(null)
				setUsRailHighlight(['invoice'])
			}
		},
		onSuccess: () => { setUsRailValue(null); setInvoice(null); resetAmounts(); navigation.goBack() },
	})

	return (
		<>
			<QPKeyboardView
				scrollViewRef={scrollViewRef}
				actions={
					showPinStep ? (
						<QPButton
							title={sourceSats ? t('withdraw.index.redeemButton', { sats: (Number(amountSats) || 0).toLocaleString() }) : t('withdraw.index.withdrawButton', { amount: amountQUSD, currency })}
							onPress={handleWithdraw}
							disabled={!isFormValid || !usRailReady || !invoiceReady || !pin || pin.length < codeLength}
							loading={sendingWithdraw}
							icon="arrow-right"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					) : (
						<QPButton
							title={t('common.actions.continue')}
							onPress={async () => {
								// Cuenta de Cuba por un método de EE. UU.: se resuelve EN EL TOQUE (la query pudo no
								// haber llegado). Si falla, el servidor lo exige igual y su 400 trae el formulario.
								if (!sourceSats && selectedCoin) {
									const req = await queryClient.fetchQuery(US_RAIL_QUERY).catch(() => usRailReq)
									if (usRailApplies(req, selectedCoin.tick) && !isUsRailComplete(usRailForm, req)) {
										toast.error(req?.messages?.required || t('withdraw.usRail.required'))
										return
									}
								}
								// Gate preventivo: el backend rechaza retiros > $1000 sin KYC
								if (!requireKyc({
									gated: Number(amountQUSD) > KYC_WITHDRAW_THRESHOLD,
									message: t('withdraw.index.kycGate', { amount: KYC_WITHDRAW_THRESHOLD }),
								})) return
								const openPinStep = () => { setShowPinStep(true); setPin('') }
								// Destino Cuba ⇒ CACR (propósito + 4 casillas); salida cripto ⇒ W-1
								const scope = withdrawAttestationScope(selectedCoin)
								const tick = selectedCoin?.tick ?? null
								attestationRef.current = null
								if (!requireAttestation(
									{ required: !!scope, scope: scope ?? 'cuba_value', context: scope === 'crypto_out' ? 'crypto' : 'withdraw', tick },
									payload => { attestationRef.current = { payload, tick }; openPinStep() },
								)) return
								openPinStep()
							}}
							disabled={!isFormValid || !usRailReady || !invoiceReady}
							icon="arrow-right"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					)
				}
			>
				<View style={{ flex: 1 }}>

					{/* Origen de fondos: balance USD o redención de sats. Con cualquier moneda si hay sats redimibles; elegir sats fija BTCLN */}
					{canRedeemSats && (
						<QPSwitch
							value={source === 'satoshis' ? 'right' : 'left'}
							leftText={t('withdraw.index.sourceBalance')}
							rightText={t('withdraw.index.sourceSats', { sats: availableSats.toLocaleString() })}
							rightIcon="bolt"
							leftColor={theme.colors.primary}
							rightColor="#F7931A"
							onChange={(side) => setSource(side === 'right' ? 'satoshis' : 'balance')}
							style={{ marginBottom: 12 }}
						/>
					)}

					{sourceSats ? (
						<WithdrawSatsCard
							amountSats={amountSats}
							onChangeAmountSats={(text) => setAmountSats(text.replace(/[^0-9]/g, ''))}
							availableSats={availableSats}
							btcPrice={Number(selectedCoin?.price) || 0}
							minSats={MIN_SATS_REDEEM}
							locked={amountLocked}
							theme={theme}
							textStyles={textStyles}
						/>
					) : (
						<WithdrawAmountCard
							chips={percentChips}
							amountQUSD={amountQUSD}
							amountCoin={amountCoin}
							onChangeQUSD={handleChangeQUSD}
							onChangeAmountCoin={handleChangeAmountCoin}
							selectedCoin={selectedCoin}
							balance={balance}
							currency={currency}
							onOpenCoinPicker={() => setShowCoinPicker(true)}
							locked={amountLocked}
							lockedCaption={t('withdraw.index.lockedByInvoice', { sats: lnAmountSats.toLocaleString() })}
							theme={theme}
							textStyles={textStyles}
						/>
					)}

					{/* Fuera del mínimo/máximo de la moneda: el servidor lo rechazaría después del PIN */}
					{!sourceSats && amountLimit && selectedCoin && (
						<Text testID="withdraw-amount-limit" style={[textStyles.caption, styles.limitHint, { color: theme.colors.dangerText }]}>
							{amountLimit.kind === 'belowMin'
								? t('withdraw.index.belowCoinMin', { coin: selectedCoin.name, amount: amountLimit.limit })
								: t('withdraw.index.aboveCoinMax', { coin: selectedCoin.name, amount: amountLimit.limit })}
						</Text>
					)}

					{/* Desglose del fee — misma cifra que cobrará el servidor (sin la tarifa de zonas aún, ninguna) */}
					{!sourceSats && previewFee > 0 && !cashZone && (cashZonesStatus === 'off' || cashZonesStatus === 'ready') && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 6 }]}>
							{selectFeePct > 0
								? t('withdraw.index.feeWithLogistics', { fee: previewFee.toFixed(2), pct: selectFeePct })
								: t('withdraw.index.fee', { fee: previewFee.toFixed(2) })}
						</Text>
					)}

					{/* Destino de fondos (solo crypto): wallet propia o terceros (bloqueado) */}
					{selectedCoin && isCrypto && (
						<WithdrawDestinationSelector
							destination={destination}
							onSelect={setDestination}
							theme={theme}
							textStyles={textStyles}
						/>
					)}

					{/* Dynamic Working Data Inputs */}
					{selectedCoin && workingFields.length > 0 && (!isCrypto || destination === 'personal') && (
						<WithdrawAccountFields
							workingFields={workingFields}
							workingForm={workingForm}
							onChangeField={(key, text) => setWorkingForm((prev) => ({ ...prev, [key]: text }))}
							multilineKeys={isBTCLN ? ['wallet'] : []}
							onOpenSaved={() => setShowSavedMethods(true)}
							slot={cashMode && provinceKey && municipalityKey ? {
								keys: [provinceKey, municipalityKey],
								node: (
									<CashZoneFields
										mode={cashMode}
										province={workingForm[provinceKey] || ''}
										municipality={workingForm[municipalityKey] || ''}
										zone={cashZone}
										charge={feeBreakdown?.zone ?? null}
										belowMin={belowZoneMin}
										// Cambiar de provincia invalida el municipio elegido
										onChangeProvince={(value) => setWorkingForm((prev) => ({ ...prev, [provinceKey]: value, [municipalityKey]: '' }))}
										onChangeMunicipality={(value) => setWorkingForm((prev) => ({ ...prev, [municipalityKey]: value }))}
										theme={theme}
										textStyles={textStyles}
									/>
								),
							} : null}
							theme={theme}
							textStyles={textStyles}
						/>
					)}

					{/* Sin la tarifa de zonas no se cotiza ni se continúa: el servidor cobraría por zona */}
					{selectedCoin && cashZonesStatus === 'error' && (
						<View testID="cash-zones-error" style={[styles.cashCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('withdraw.cashZones.loadError')}</Text>
							<Pressable onPress={() => retryCashZones()} hitSlop={8} accessibilityRole="button" style={styles.cashRetry}>
								<Text style={[textStyles.caption, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('common.actions.retry')}</Text>
							</Pressable>
						</View>
					)}

					{/* Cuenta de Cuba por un método de EE. UU.: a quién paga, propósito, declaraciones y factura */}
					{selectedCoin && usRailOn && usRailReq && (
						<UsRailPurposeCard
							req={usRailReq}
							value={usRailForm}
							onChange={changeUsRail}
							language={usRailLanguage}
							onChangeLanguage={setUsRailLanguage}
							amount={amountQUSD}
							payeeHint={payeeHint}
							highlight={usRailHighlight}
							invoice={invoice}
							invoiceRequired={invoiceRequired}
							onChangeInvoice={changeInvoice}
							theme={theme}
							textStyles={textStyles}
						/>
					)}

					{/* Retiro bancario de $3,000 o más: factura obligatoria para cualquier cuenta */}
					{selectedCoin && !usRailOn && invoiceRequired && (
						<WithdrawInvoiceField reason="large_bank" file={invoice} onChange={changeInvoice} highlighted={usRailHighlight.includes('invoice')} theme={theme} textStyles={textStyles} />
					)}

					{/* Resumen de la entrega de efectivo: comisión base + cargo de entrega = total, y lo que se recibe */}
					{!sourceSats && cashZone && feeBreakdown && (
						<View style={[styles.cashCard, { backgroundColor: theme.colors.surface, gap: 4 }, !theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }]}>
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginBottom: 2 }]}>{t('withdraw.cashZones.summary.title')}</Text>
							{[
								{ key: 'base', label: t('withdraw.cashZones.summary.baseFee'), value: feeBreakdown.base },
								{ key: 'zone', label: t('withdraw.cashZones.summary.deliveryCharge'), value: feeBreakdown.zone.total },
								{ key: 'total', label: t('withdraw.cashZones.summary.totalFee'), value: feeBreakdown.total },
								{ key: 'receive', label: t('withdraw.cashZones.summary.received'), value: Math.max(0, receiveUsd) },
							].map((row) => (
								<View key={row.key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
									<Text style={[textStyles.caption, { color: row.key === 'receive' ? theme.colors.primaryText : theme.colors.secondaryText }]}>{row.label}</Text>
									<Text style={[textStyles.caption, { color: row.key === 'receive' && belowZoneMin ? theme.colors.dangerText : theme.colors.primaryText }]}>${row.value.toFixed(2)}</Text>
								</View>
							))}
						</View>
					)}

					{/* Info autoritativa de la factura escaneada (decode del backend, no crítico) */}
					{isBTCLN && lnInfo?.kind === 'bolt11' && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 6 }]}>
							{lnInfo.description ? t('withdraw.index.lightningDescription', { description: lnInfo.description }) : t('withdraw.index.lightningInvoice')}
							{/* `expires_at` viaja declarado como string en el payload del decode
							    pero la resta lo trata como epoch ms — se preserva el cálculo tal cual */}
							{lnInfo.expires_at ? t('withdraw.index.lightningExpires', { minutes: Math.max(0, Math.round(((lnInfo.expires_at as unknown as number) - Date.now()) / 60000)) }) : ''}
						</Text>
					)}

					{/* Lightning Address ajena: a quién se paga y entre qué montos acepta */}
					{isBTCLN && lnInfo?.kind === 'lnaddress' && (
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 6 }]}>
							{t('withdraw.index.lnAddressPreview', { address: lnInfo.address ?? '', min: Number(lnInfo.min_sat || 0).toLocaleString(), max: Number(lnInfo.max_sat || 0).toLocaleString() })}
						</Text>
					)}

					{/* Destino rechazado por el decode; una dirección de QvaPay se TRANSFIERE (gratis e instantáneo) */}
					{isBTCLN && lnError && (
						<View style={{ marginTop: 8, gap: 10 }}>
							<Text style={[textStyles.caption, { color: theme.colors.danger }]}>
								{lnError.code === 'LN_SELF_PAY' ? t('withdraw.index.lnSelfPay') : lnError.message}
							</Text>
							{lnError.code === 'LN_SELF_PAY' && (
								<QPButton title={t('withdraw.index.transferInstead')} icon="paper-plane" onPress={() => navigation.navigate(ROUTES.SEND)} outlined />
							)}
						</View>
					)}

					{/* PIN/OTP Step — mismo card de confirmación que SendConfirm */}
					{showPinStep && (
						<View style={{ marginTop: 20 }}>
							<PinConfirmStep
								pin={pin}
								onChangePin={setPin}
								codeLength={codeLength}
								twoFactorMethod={twoFactorMethod}
								hasOTP={hasOTP}
								sendingPin={sendingPin}
								onMethodToggle={handleMethodToggle}
								onRequestPin={handleRequestPin}
								onBoxFocus={handlePinBoxFocus}
								codeInputRef={codeInputRef}
								theme={theme}
								textStyles={textStyles}
								containerStyles={containerStyles}
							/>
						</View>
					)}
				</View>
			</QPKeyboardView>

			<QPCoinPicker
				visible={showCoinPicker}
				onClose={() => setShowCoinPicker(false)}
				onSelect={handleCoinSelect}
				coins={availableCoins}
				selectedCoin={selectedCoin}
				isLoading={loadingCoins}
				amount={amountQUSD}
				direction="out"
				recentKey={RECENT_WITHDRAW_KEY}
				defaultCoins={DEFAULT_WITHDRAW_COINS}
			/>

			<SavedMethodsModal
				visible={showSavedMethods}
				onClose={() => setShowSavedMethods(false)}
				methods={savedForCoin}
				onSelect={(method) => { applySavedMethod(method); setShowSavedMethods(false) }}
				onManage={openPaymentMethodsSettings}
				theme={theme}
				textStyles={textStyles}
			/>

			{/* useKycGate expone `string | null` y el modal declara `string | undefined` */}
			<KycGateModal visible={gateVisible} message={gateMessage as string} onClose={closeGate} />
			<OfacAttestationModal {...ofacModalProps} />
		</>
	)
}

const styles = StyleSheet.create({
	cashCard: { marginTop: 12, padding: 12, borderRadius: 12 },
	cashRetry: { alignSelf: 'flex-start', marginTop: 8 },
	limitHint: { marginTop: 6 },
})

export default Withdraw
