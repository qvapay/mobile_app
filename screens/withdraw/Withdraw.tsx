import { useRef } from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'

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
import WithdrawDestinationSelector from './WithdrawDestinationSelector'
import PinConfirmStep from '../transaction/PinConfirmStep'

// Formulario (monedas, montos, campos dinámicos, fees) y paso de PIN/OTP
import useWithdrawForm, { MIN_SATS_REDEEM } from './useWithdrawForm'
import useWithdrawSubmit from './useWithdrawSubmit'

// Gate de KYC (retiros > $1000)
import useKycGate, { KYC_WITHDRAW_THRESHOLD } from '../../hooks/useKycGate'
import KycGateModal from '../../ui/KycGateModal'

// Types
import type { ScrollView } from 'react-native'
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

	const { t } = useTranslation()

	// Gate de KYC — intercepta antes del paso de PIN
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Scroll del form — el paso de PIN aparece debajo del fold y hay que llevarlo a la vista
	const scrollViewRef = useRef<ScrollView>(null)

	const currency = 'QUSD'

	// Lightning params from the QR scanner (Scan → parseLightningQR)
	const lnAmountSats = Number(route?.params?.lnAmountSats) || 0

	const {
		availableCoins, selectedCoin, showCoinPicker, setShowCoinPicker, handleCoinSelect, loadingCoins,
		amountQUSD, amountCoin, handleChangeQUSD, handleChangeAmountCoin, balance, amountLocked,
		source, setSource, amountSats, setAmountSats, sourceSats, availableSats, isBTCLN, lnInfo,
		isCrypto, destination, setDestination,
		workingFields, workingForm, setWorkingForm, selectFeePct, previewFee,
		isFormValid, resetAmounts,
	} = useWithdrawForm({
		preselectedCoin: route?.params?.preselectedCoin,
		lnInvoice: route?.params?.lnInvoice,
		lnAmountSats,
	})

	const {
		pin, setPin, codeLength, twoFactorMethod, codeInputRef, handleMethodToggle, hasOTP,
		showPinStep, setShowPinStep, sendingPin, sendingWithdraw,
		handleRequestPin, handleWithdraw, handlePinBoxFocus,
	} = useWithdrawSubmit({
		amountQUSD, amountSats, sourceSats, selectedCoin, workingFields, workingForm, scrollViewRef,
		onSuccess: () => { resetAmounts(); navigation.goBack() },
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
							disabled={!isFormValid || !pin || pin.length < codeLength}
							loading={sendingWithdraw}
							icon="arrow-right"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					) : (
						<QPButton
							title={t('common.actions.continue')}
							onPress={() => {
								// Gate preventivo: el backend rechaza retiros > $1000 sin KYC
								if (!requireKyc({
									gated: Number(amountQUSD) > KYC_WITHDRAW_THRESHOLD,
									message: t('withdraw.index.kycGate', { amount: KYC_WITHDRAW_THRESHOLD }),
								})) return
								setShowPinStep(true); setPin('')
							}}
							disabled={!isFormValid}
							icon="arrow-right"
							iconStyle="solid"
							iconColor={theme.colors.almostWhite}
							textStyle={{ color: theme.colors.almostWhite }}
						/>
					)
				}
			>
				<View style={{ flex: 1 }}>

					{/* Origen de fondos (solo BTCLN): balance USD o redención de sats */}
					{isBTCLN && availableSats > 0 && (
						<QPSwitch
							value={source === 'satoshis' ? 'right' : 'left'}
							leftText={t('withdraw.index.sourceBalance')}
							rightText={t('withdraw.index.sourceSats', { sats: availableSats.toLocaleString() })}
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

					{/* Desglose del fee — misma cifra que cobrará el servidor */}
					{!sourceSats && previewFee > 0 && (
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
							theme={theme}
							textStyles={textStyles}
						/>
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

			{/* useKycGate expone `string | null` y el modal declara `string | undefined` */}
			<KycGateModal visible={gateVisible} message={gateMessage as string} onClose={closeGate} />
		</>
	)
}

export default Withdraw
