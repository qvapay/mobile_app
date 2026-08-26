import { useEffect, useEffectEvent, useMemo, useRef, useState, useReducer } from 'react'
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
import { isCryptoCoin } from './withdrawDestination'
import type { WithdrawDestination } from './withdrawDestination'
import { calculateFee, grossFromNet, getSelectFeePct, keyFromFieldName } from './withdrawFees'
import type { WorkingForm } from './withdrawFees'
import useCoins from '../../hooks/useCoins'
import usePinEntry from '../../hooks/usePinEntry'

// Gate de KYC (retiros > $1000)
import useKycGate, { KYC_WITHDRAW_THRESHOLD } from '../../hooks/useKycGate'
import KycGateModal from '../../ui/KycGateModal'

// API
import { withdrawApi } from '../../api/withdrawApi'
import type { LightningDecodePayload } from '../../api/withdrawApi'

// Idempotencia: clave estable por intento — un reintento tras timeout no duplica el débito
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, safeRetryHint } from '../../helpers/idempotency'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Toast
import { toast } from 'sonner-native'

// Types
import type { ScrollView } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { Coin, CoinWorkingField } from '../../types/domain'

// Quick coin pills for withdraw
const DEFAULT_WITHDRAW_COINS = [
	{ tick: 'BANK_CUP', label: 'CUP' },
	{ tick: 'BANK_MLC', label: 'MLC' },
	{ tick: 'CLASICA', label: 'Clásica' },
	{ tick: 'ETECSA', label: 'ETECSA' },
]
const RECENT_WITHDRAW_KEY = 'qp_recent_withdraw_coins'

// Mínimo de sats por redención (espejo de MIN_SATS_REDEEM en el backend)
const MIN_SATS_REDEEM = 100

// USD (neto) -> cantidad en coin
const usdToCoin = (usdNet: number, coin: Coin | null | undefined): number => {
	if (!coin) return 0
	const price = Number(coin.price)
	if (!coin.stable && price > 0) return usdNet / price
	return usdNet
}

// Cantidad en coin -> USD (neto)
const coinToUsd = (coinAmount: number, coin: Coin | null | undefined): number => {
	if (!coin) return 0
	const price = Number(coin.price)
	if (!coin.stable && price > 0) return coinAmount * price
	return coinAmount
}

/** Acción del reducer genérico: `field` y `value` correlacionados por clave. */
type SetFieldAction<S> = { [K in keyof S]: { type: 'set', field: K, value: S[K] } }[keyof S]

/** Slices de estado relacionados que comparten el reducer de abajo. */
type AmountState = { amountQUSD: string, amountCoin: string }
type CoinState = { availableCoins: Coin[], selectedCoin: Coin | null, showCoinPicker: boolean }
type PinFlowState = { showPinStep: boolean, sendingPin: boolean, sendingWithdraw: boolean }

// Generic field setter for the related-state slices below
function setFieldReducer<S extends object>(state: S, action: SetFieldAction<S>): S {
	switch (action.type) {
		case 'set':
			// La clave computada ensancha el tipo del literal: se reafirma S
			return { ...state, [action.field]: action.value } as S
		default:
			return state
	}
}
const initialPinFlow: PinFlowState = { showPinStep: false, sendingPin: false, sendingWithdraw: false }

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
 */
const Withdraw = ({ navigation, route }: WithdrawProps) => {

	// Contexts
	const { user, updateUser } = useAuth()
	const { coins: coinCatalog, isLoading: loadingCoins } = useCoins('out')
	const { t } = useTranslation()

	// GOLD paga fee_out_gold en el servidor — la vista previa debe usar la misma tarifa
	const isGold = !!user?.golden_check

	// Gate de KYC — intercepta antes del paso de PIN
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Scroll del form — el paso de PIN aparece debajo del fold y hay que llevarlo a la vista
	const scrollViewRef = useRef<ScrollView>(null)

	// Clave de idempotencia del intento: sobrevive a timeouts, 5xx y toques
	// repetidos — solo rota tras éxito confirmado. Si un intento falla por
	// validación (PIN malo, saldo), el servidor libera la clave y reintentar
	// con datos corregidos procede normal.
	const idempotencyKeyRef = useRef(makeIdempotencyKey())

	// Amount swap (same-named setters keep every call site unchanged)
	const [amountState, dispatchAmount] = useReducer(setFieldReducer<AmountState>, { amountQUSD: '', amountCoin: '' })
	const { amountQUSD, amountCoin } = amountState
	const setAmountQUSD = (value: string) => dispatchAmount({ type: 'set', field: 'amountQUSD', value })
	const setAmountCoin = (value: string) => dispatchAmount({ type: 'set', field: 'amountCoin', value })

	// Coin selection
	const [coinState, dispatchCoin] = useReducer(setFieldReducer<CoinState>, { availableCoins: [], selectedCoin: null, showCoinPicker: false })
	const { availableCoins, selectedCoin, showCoinPicker } = coinState
	const setAvailableCoins = (value: Coin[]) => dispatchCoin({ type: 'set', field: 'availableCoins', value })
	const setSelectedCoin = (value: Coin | null) => dispatchCoin({ type: 'set', field: 'selectedCoin', value })
	const setShowCoinPicker = (value: boolean) => dispatchCoin({ type: 'set', field: 'showCoinPicker', value })

	const [workingForm, setWorkingForm] = useState<WorkingForm>({})
	const [balance] = useState(user?.balance || 0)
	const currency = 'QUSD'

	// PIN/OTP step flags
	const [pinFlow, dispatchPin] = useReducer(setFieldReducer<PinFlowState>, initialPinFlow)
	const { showPinStep, sendingPin, sendingWithdraw } = pinFlow
	const setShowPinStep = (value: boolean) => dispatchPin({ type: 'set', field: 'showPinStep', value })
	const setSendingPin = (value: boolean) => dispatchPin({ type: 'set', field: 'sendingPin', value })
	const setSendingWithdraw = (value: boolean) => dispatchPin({ type: 'set', field: 'sendingWithdraw', value })

	// PIN/OTP state (entered code, method toggle, code length) — box mechanics live in QPCodeInput
	const { pin, setPin, twoFactorMethod, codeLength, codeInputRef, handleMethodToggle } = usePinEntry()

	const hasOTP = !!user?.two_factor_secret

	// Pre-selected coin from navigation params (e.g., USDCASH from CashDeliveryCard)
	const preselectedCoin = route?.params?.preselectedCoin

	// Lightning params from the QR scanner (Scan → parseLightningQR)
	const lnInvoice = route?.params?.lnInvoice
	const lnAmountSats = Number(route?.params?.lnAmountSats) || 0

	// Origen de fondos para BTCLN: balance USD o redención de sats de cashback
	const [source, setSource] = useState<'balance' | 'satoshis'>('balance')
	const [amountSats, setAmountSats] = useState(lnAmountSats > 0 ? String(lnAmountSats) : '')
	const [lnInfo, setLnInfo] = useState<LightningDecodePayload | null>(null)

	// Crypto destination gate (own wallet vs third parties)
	const [destination, setDestination] = useState<WithdrawDestination | null>(null)
	const isCrypto = isCryptoCoin(selectedCoin)

	const isBTCLN = selectedCoin?.tick === 'BTCLN'
	const sourceSats = isBTCLN && source === 'satoshis'
	const availableSats = Number(user?.satoshis) || 0
	// Una factura con monto fijo manda: ambos modos quedan bloqueados en ese monto
	const amountLocked = isBTCLN && lnAmountSats > 0

	// Fetch available coins enabled_out
	// El catálogo llega de useCoins (caché compartida): la lista se pinta al
	// instante en vez de esperar un viaje a la red cada vez que se entra
	// La preselección se aplica UNA vez: el catálogo cambia de identidad al
	// hidratar desde disco y otra vez al llegar el de red, y sin esta guarda el
	// segundo pase revertía la moneda que el usuario ya hubiera elegido
	const didPreselectRef = useRef(false)
	useEffect(() => {
		if (!coinCatalog.length) return
		setAvailableCoins(coinCatalog)

		if (preselectedCoin && !didPreselectRef.current) {
			const coin = coinCatalog.find(c => c.tick === preselectedCoin)
			if (coin) {
				didPreselectRef.current = true
				setSelectedCoin(coin)
				return
			}
		}

	}, [coinCatalog, preselectedCoin])

	// La moneda elegida es un objeto capturado: al llegar el catálogo fresco el
	// selector mostraba el precio nuevo mientras el formulario seguía
	// calculando comisión y conversión con el viejo. Se refresca en su sitio,
	// sin tocar la elección del usuario, y solo cuando el precio cambió (si no,
	// cada revalidación provocaría un render de más)
	useEffect(() => {
		if (!selectedCoin || !coinCatalog.length) return
		const fresh = coinCatalog.find(c => c.tick === selectedCoin.tick)
		if (fresh && fresh.price !== selectedCoin.price) { setSelectedCoin(fresh) }
	}, [coinCatalog, selectedCoin]) // eslint-disable-line react-hooks/exhaustive-deps

	// Decimals to render for the coin amount input
	const coinDecimals = useMemo(() => {
		const d = Number(selectedCoin?.decimals)
		return Number.isFinite(d) && d >= 0 ? d : 2
	}, [selectedCoin])

	// Prefill de la factura escaneada una vez que BTCLN resuelve del fetch de coins:
	// destino al campo `wallet` del working_data, monto derivado de la factura (si trae),
	// y decode informativo (descripción/expiración) con fallo silencioso.
	const applyLnPrefill = useEffectEvent(() => {
		// Los casts de `lnInvoice`: el efecto de abajo solo dispara este evento con la factura presente
		const walletField = workingFields.find((field) => (field.name || '').toLowerCase() === 'wallet')
		if (walletField) { setWorkingForm((prev) => ({ ...prev, [keyFromFieldName(walletField.name)]: lnInvoice as string })) }
		if (lnAmountSats > 0) { handleChangeAmountCoin((lnAmountSats / 1e8).toFixed(8)) }
		withdrawApi.decodeLightning(lnInvoice as string).then((res) => { if (res.success) { setLnInfo(res.data as LightningDecodePayload) } }).catch(() => { })
	})
	useEffect(() => {
		if (lnInvoice && selectedCoin?.tick === 'BTCLN') { applyLnPrefill() }
	}, [lnInvoice, selectedCoin])

	// QUSD bruto -> cantidad en coin (descontando fee)
	const handleChangeQUSD = (value: string) => {
		setAmountQUSD(value)
		const num = Number(value)
		if (selectedCoin && !isNaN(num) && num > 0) {
			const totalFee = calculateFee(num, selectedCoin, { isGold, selectFeePct })
			const netUsd = num - totalFee
			const netInCoin = usdToCoin(netUsd, selectedCoin)
			setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(coinDecimals) : '')
		} else {
			setAmountCoin('')
		}
	}

	// Cantidad en coin -> QUSD bruto requerido (sumando fee)
	const handleChangeAmountCoin = (value: string) => {
		setAmountCoin(value)
		const coinAmt = Number(value)
		if (selectedCoin && !isNaN(coinAmt) && coinAmt > 0) {
			const netUsd = coinToUsd(coinAmt, selectedCoin)
			const requiredQUSD = grossFromNet(netUsd, selectedCoin, { isGold, selectFeePct })
			setAmountQUSD(requiredQUSD > 0 ? String(Math.round(requiredQUSD * 100) / 100) : '')
		} else {
			setAmountQUSD('')
		}
	}

	// Working data parsing
	const workingFields = useMemo<CoinWorkingField[]>(() => {
		if (!selectedCoin || !selectedCoin.working_data) { return [] }
		try {
			// La columna Json puede llegar ya parseada o como string JSON
			const raw: unknown = typeof selectedCoin.working_data === 'string' ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
			return Array.isArray(raw) ? raw as CoinWorkingField[] : []
		} catch (e) {
			return []
		}
	}, [selectedCoin])

	// Recargo % por opción elegida en campos `select` (p. ej. logística por
	// provincia de USDCASH) — el servidor lo suma al fee, la vista previa también
	const selectFeePct = useMemo(() => getSelectFeePct(workingFields, workingForm), [workingFields, workingForm])

	// Fee total de la vista previa (para el desglose bajo la tarjeta de monto)
	const previewFee = useMemo(() => {
		const num = Number(amountQUSD)
		if (!selectedCoin || isNaN(num) || num <= 0) return 0
		return calculateFee(num, selectedCoin, { isGold, selectFeePct })
	}, [amountQUSD, selectedCoin, isGold, selectFeePct])

	// Elegir provincia (o refrescar el precio de la coin) cambia el fee después
	// de tecleado el monto: se re-deriva el lado "Recibir" desde el bruto vigente
	const resyncReceiveAmount = useEffectEvent(() => {
		const num = Number(amountQUSD)
		if (!selectedCoin || isNaN(num) || num <= 0) return
		const totalFee = calculateFee(num, selectedCoin, { isGold, selectFeePct })
		const netInCoin = usdToCoin(num - totalFee, selectedCoin)
		setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(coinDecimals) : '')
	})
	useEffect(() => { resyncReceiveAmount() }, [selectFeePct, selectedCoin])

	const isFormValid = useMemo(() => {
		if (!selectedCoin) { return false }
		if (isCrypto && destination !== 'personal') { return false }
		if (sourceSats) {
			const sats = Number(amountSats)
			if (!Number.isInteger(sats) || sats < MIN_SATS_REDEEM || sats > availableSats) { return false }
		} else {
			const amount = Number(amountQUSD)
			if (!amount || isNaN(amount)) { return false }
		}
		return workingFields.every((field) => {
			const key = keyFromFieldName(field.name)
			const value = (workingForm[key] ?? '').toString().trim()
			return value.length > 0
		})
	}, [selectedCoin, isCrypto, destination, sourceSats, amountSats, availableSats, amountQUSD, workingFields, workingForm])

	const handleCoinSelect = (coin: Coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		setDestination(null)
		if (coin?.tick !== 'BTCLN') { setSource('balance') }
		if (amountQUSD) {
			const num = Number(amountQUSD)
			if (!isNaN(num) && num > 0) {
				// El form se resetea con la moneda nueva — sin recargo de select aún
				const totalFee = calculateFee(num, coin, { isGold })
				const netUsd = num - totalFee
				const netInCoin = usdToCoin(netUsd, coin)
				const decimals = Number.isFinite(Number(coin?.decimals)) && Number(coin?.decimals) >= 0 ? Number(coin.decimals) : 2
				setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(decimals) : '')
			}
		}
		setWorkingForm({})
	}

	// Request PIN via email
	const handleRequestPin = async () => {
		try {
			setSendingPin(true)
			const result = await withdrawApi.requestPin()
			if (result.success) {
				toast.success(t('withdraw.index.toasts.pinSent.title'), { description: t('withdraw.index.toasts.pinSent.description') })
			} else {
				toast.error(result.error || t('withdraw.index.toasts.pinSendFailed'))
			}
		} catch (err) {
			toast.error(t('withdraw.index.toasts.pinRequestError'))
		} finally { setSendingPin(false) }
	}

	// Submit withdraw with PIN
	const handleWithdraw = async () => {
		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? t('withdraw.index.toasts.enterPin') : t('withdraw.index.toasts.enterOtp'))
			return
		}

		try {
			setSendingWithdraw(true)
			// Build details with original field names from working_data
			const details: Record<string, string> = {}
			for (const field of workingFields) {
				const key = keyFromFieldName(field.name)
				details[field.name] = workingForm[key] || ''
			}
			// Ante el 409 "en proceso" se espera y reintenta una vez con la MISMA clave
			const result = await callWithDuplicateRetry(() => withdrawApi.withdraw({
				amount: amountQUSD,
				// El botón que abre el paso de PIN exige isFormValid ⇒ hay moneda
				coin: selectedCoin!.tick,
				details,
				pin,
				...(sourceSats && { source: 'satoshis', amountSats: Number(amountSats) }),
				idempotencyKey: idempotencyKeyRef.current,
			}))

			if (result.success) {
				idempotencyKeyRef.current = makeIdempotencyKey()
				if (sourceSats) {
					toast.success(t('withdraw.index.toasts.redeemed.title'), { description: t('withdraw.index.toasts.redeemed.description', { sats: Number(amountSats).toLocaleString() }) })
					// El backend devuelve los sats restantes fresh — reflejarlos sin refetch
					// (`data` del ApiResult es `unknown`: se estrecha a la forma que se lee)
					const satoshisLeft = (result.data as { data?: { satoshis?: number } } | undefined)?.data?.satoshis
					if (typeof satoshisLeft === 'number') { updateUser({ satoshis: satoshisLeft }) }
				} else {
					toast.success(t('withdraw.index.toasts.withdrawn.title'), { description: t('withdraw.index.toasts.withdrawn.description', { amount: amountQUSD }) })
					updateUser({ balance: Number(user?.balance || 0) - Number(amountQUSD) })
				}
				setShowPinStep(false)
				setPin('')
				setAmountQUSD('')
				setAmountCoin('')
				setAmountSats('')
				setWorkingForm({})
				navigation.goBack()
			} else if (isNetworkFailure(result)) {
				toast.error(t('withdraw.index.toasts.networkErrorTitle'), { description: `${result.error || t('errors.network')}. ${safeRetryHint()}` })
			} else {
				toast.error(result.error || t('withdraw.index.toasts.withdrawFailed'))
			}
		} catch (err) {
			toast.error(t('withdraw.index.toasts.processError'))
		} finally { setSendingWithdraw(false) }
	}

	// Auto-submit when all digits entered (Effect Event: reads the latest
	// handler/flags without re-running the effect on every state change)
	const onPinComplete = useEffectEvent(() => { if (pin.length === codeLength && !sendingWithdraw) { handleWithdraw() } })
	useEffect(() => { onPinComplete() }, [pin])

	// Auto-scroll to PIN section when it appears (mismo patrón que SendConfirm —
	// sin esto el paso de PIN queda bajo el fold y el usuario no sabe que existe)
	useEffect(() => {
		if (!showPinStep) return
		const timer = setTimeout(() => {
			scrollViewRef.current?.scrollToEnd({ animated: true })
			codeInputRef.current?.focus(0)
		}, 100)
		return () => clearTimeout(timer)
	}, [showPinStep, codeInputRef])

	// Re-scroll al enfocar una cajita: el teclado encoge el viewport y taparía el input
	const handlePinBoxFocus = () => {
		setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
	}

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
