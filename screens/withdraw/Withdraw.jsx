import { useEffect, useEffectEvent, useMemo, useRef, useState, useReducer } from 'react'
import { View, Text } from 'react-native'

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
import usePinEntry from '../../hooks/usePinEntry'

// Gate de KYC (retiros > $1000)
import useKycGate, { KYC_WITHDRAW_THRESHOLD } from '../../hooks/useKycGate'
import KycGateModal from '../../ui/KycGateModal'

// API
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'

// Idempotencia: clave estable por intento — un reintento tras timeout no duplica el débito
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, SAFE_RETRY_HINT } from '../../helpers/idempotency'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Toast
import { toast } from 'sonner-native'

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

const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// USD (neto) -> cantidad en coin
const usdToCoin = (usdNet, coin) => {
	if (!coin) return 0
	const price = Number(coin.price)
	if (!coin.stable && price > 0) return usdNet / price
	return usdNet
}

// Cantidad en coin -> USD (neto)
const coinToUsd = (coinAmount, coin) => {
	if (!coin) return 0
	const price = Number(coin.price)
	if (!coin.stable && price > 0) return coinAmount * price
	return coinAmount
}

// Fee for a gross USD amount on a coin
const calculateFee = (amount, coin) => {
	if (!coin) return 0
	const feePercent = Number(coin.fee_out) || 0
	if (Array.isArray(coin.fee_out_fixed) && coin.fee_out_fixed.length >= 2) {
		const threshold = Number(coin.fee_out_fixed[0]) || 0
		const fixedAmount = Number(coin.fee_out_fixed[1]) || 0
		if (amount < threshold) { return fixedAmount }
		const percentageFee = (amount * feePercent) / 100
		return Math.round(percentageFee * 100) / 100
	}
	const feeFixed = Number(coin.fee_out_fixed) || 0
	const percentageFee = (amount * feePercent) / 100
	return Math.round((percentageFee + feeFixed) * 100) / 100
}

// Generic field setter for the related-state slices below
function setFieldReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}
const initialPinFlow = { showPinStep: false, sendingPin: false, sendingWithdraw: false }

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
const Withdraw = ({ navigation, route }) => {

	// Contexts
	const { user, updateUser } = useAuth()

	// Gate de KYC — intercepta antes del paso de PIN
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Scroll del form — el paso de PIN aparece debajo del fold y hay que llevarlo a la vista
	const scrollViewRef = useRef(null)

	// Clave de idempotencia del intento: sobrevive a timeouts, 5xx y toques
	// repetidos — solo rota tras éxito confirmado. Si un intento falla por
	// validación (PIN malo, saldo), el servidor libera la clave y reintentar
	// con datos corregidos procede normal.
	const idempotencyKeyRef = useRef(makeIdempotencyKey())

	// Amount swap (same-named setters keep every call site unchanged)
	const [amountState, dispatchAmount] = useReducer(setFieldReducer, { amountQUSD: '', amountCoin: '' })
	const { amountQUSD, amountCoin } = amountState
	const setAmountQUSD = (value) => dispatchAmount({ type: 'set', field: 'amountQUSD', value })
	const setAmountCoin = (value) => dispatchAmount({ type: 'set', field: 'amountCoin', value })

	// Coin selection
	const [coinState, dispatchCoin] = useReducer(setFieldReducer, { availableCoins: [], selectedCoin: null, showCoinPicker: false })
	const { availableCoins, selectedCoin, showCoinPicker } = coinState
	const setAvailableCoins = (value) => dispatchCoin({ type: 'set', field: 'availableCoins', value })
	const setSelectedCoin = (value) => dispatchCoin({ type: 'set', field: 'selectedCoin', value })
	const setShowCoinPicker = (value) => dispatchCoin({ type: 'set', field: 'showCoinPicker', value })

	const [isLoading, setIsLoading] = useState(false)
	const [workingForm, setWorkingForm] = useState({})
	const [balance] = useState(user?.balance || 0)
	const currency = 'QUSD'

	// PIN/OTP step flags
	const [pinFlow, dispatchPin] = useReducer(setFieldReducer, initialPinFlow)
	const { showPinStep, sendingPin, sendingWithdraw } = pinFlow
	const setShowPinStep = (value) => dispatchPin({ type: 'set', field: 'showPinStep', value })
	const setSendingPin = (value) => dispatchPin({ type: 'set', field: 'sendingPin', value })
	const setSendingWithdraw = (value) => dispatchPin({ type: 'set', field: 'sendingWithdraw', value })

	// PIN/OTP state (entered code, method toggle, code length) — box mechanics live in QPCodeInput
	const { pin, setPin, twoFactorMethod, codeLength, codeInputRef, handleMethodToggle } = usePinEntry()

	const hasOTP = !!user?.two_factor_secret

	// Pre-selected coin from navigation params (e.g., USDCASH from CashDeliveryCard)
	const preselectedCoin = route?.params?.preselectedCoin

	// Lightning params from the QR scanner (Scan → parseLightningQR)
	const lnInvoice = route?.params?.lnInvoice
	const lnAmountSats = Number(route?.params?.lnAmountSats) || 0

	// Origen de fondos para BTCLN: balance USD o redención de sats de cashback
	const [source, setSource] = useState('balance')
	const [amountSats, setAmountSats] = useState(lnAmountSats > 0 ? String(lnAmountSats) : '')
	const [lnInfo, setLnInfo] = useState(null)

	// Crypto destination gate (own wallet vs third parties)
	const [destination, setDestination] = useState(null)
	const isCrypto = isCryptoCoin(selectedCoin)

	const isBTCLN = selectedCoin?.tick === 'BTCLN'
	const sourceSats = isBTCLN && source === 'satoshis'
	const availableSats = Number(user?.satoshis) || 0
	// Una factura con monto fijo manda: ambos modos quedan bloqueados en ese monto
	const amountLocked = isBTCLN && lnAmountSats > 0

	// Fetch available coins enabled_out
	useEffect(() => {
		let cancelled = false
		const fetchCoins = async () => {
			try {
				setIsLoading(true)
				const response = await apiClient.get('/coins/v2?enabled_out=true')
				if (cancelled) return
				setAvailableCoins(response.data)
				if (preselectedCoin) {
					const coin = response.data.find(c => c.tick === preselectedCoin)
					if (coin) setSelectedCoin(coin)
				}
			} catch (err) { /* error fetching coins */ }
			finally { if (!cancelled) setIsLoading(false) }
		}
		fetchCoins()
		return () => { cancelled = true }
	}, [preselectedCoin])

	// Decimals to render for the coin amount input
	const coinDecimals = useMemo(() => {
		const d = Number(selectedCoin?.decimals)
		return Number.isFinite(d) && d >= 0 ? d : 2
	}, [selectedCoin])

	// Prefill de la factura escaneada una vez que BTCLN resuelve del fetch de coins:
	// destino al campo `wallet` del working_data, monto derivado de la factura (si trae),
	// y decode informativo (descripción/expiración) con fallo silencioso.
	const applyLnPrefill = useEffectEvent(() => {
		const walletField = workingFields.find((field) => (field.name || '').toLowerCase() === 'wallet')
		if (walletField) { setWorkingForm((prev) => ({ ...prev, [keyFromFieldName(walletField.name)]: lnInvoice })) }
		if (lnAmountSats > 0) { handleChangeAmountCoin((lnAmountSats / 1e8).toFixed(8)) }
		withdrawApi.decodeLightning(lnInvoice).then((res) => { if (res.success) { setLnInfo(res.data) } }).catch(() => { })
	})
	useEffect(() => {
		if (lnInvoice && selectedCoin?.tick === 'BTCLN') { applyLnPrefill() }
	}, [lnInvoice, selectedCoin])

	// QUSD bruto -> cantidad en coin (descontando fee)
	const handleChangeQUSD = (value) => {
		setAmountQUSD(value)
		const num = Number(value)
		if (selectedCoin && !isNaN(num) && num > 0) {
			const totalFee = calculateFee(num, selectedCoin)
			const netUsd = num - totalFee
			const netInCoin = usdToCoin(netUsd, selectedCoin)
			setAmountCoin(netInCoin > 0 ? netInCoin.toFixed(coinDecimals) : '')
		} else {
			setAmountCoin('')
		}
	}

	// Cantidad en coin -> QUSD bruto requerido (sumando fee)
	const handleChangeAmountCoin = (value) => {
		setAmountCoin(value)
		const coinAmt = Number(value)
		if (selectedCoin && !isNaN(coinAmt) && coinAmt > 0) {
			const netUsd = coinToUsd(coinAmt, selectedCoin)
			const feePercent = Number(selectedCoin?.fee_out) || 0
			let requiredQUSD

			if (Array.isArray(selectedCoin?.fee_out_fixed) && selectedCoin.fee_out_fixed.length >= 2) {
				const threshold = Number(selectedCoin.fee_out_fixed[0]) || 0
				const fixedAmount = Number(selectedCoin.fee_out_fixed[1]) || 0
				const withPercentageFee = feePercent > 0 ? netUsd / (1 - feePercent / 100) : netUsd
				if (withPercentageFee >= threshold) { requiredQUSD = withPercentageFee }
				else { requiredQUSD = netUsd + fixedAmount }
			} else {
				const feeFixed = Number(selectedCoin?.fee_out_fixed) || 0
				if (feePercent > 0) { requiredQUSD = (netUsd + feeFixed) / (1 - feePercent / 100) }
				else { requiredQUSD = netUsd + feeFixed }
			}

			setAmountQUSD(requiredQUSD > 0 ? String(Math.round(requiredQUSD * 100) / 100) : '')
		} else {
			setAmountQUSD('')
		}
	}

	// Working data parsing
	const workingFields = useMemo(() => {
		if (!selectedCoin || !selectedCoin.working_data) { return [] }
		try {
			const raw = typeof selectedCoin.working_data === 'string' ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
			return Array.isArray(raw) ? raw : []
		} catch (e) {
			return []
		}
	}, [selectedCoin])

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

	const handleCoinSelect = (coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		setDestination(null)
		if (coin?.tick !== 'BTCLN') { setSource('balance') }
		if (amountQUSD) {
			const num = Number(amountQUSD)
			if (!isNaN(num) && num > 0) {
				const totalFee = calculateFee(num, coin)
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
				toast.success('PIN enviado', { description: 'Revisa tu correo electrónico' })
			} else {
				toast.error(result.error || 'No se pudo enviar el PIN')
			}
		} catch (err) {
			toast.error('Error al solicitar el PIN')
		} finally { setSendingPin(false) }
	}

	// Submit withdraw with PIN
	const handleWithdraw = async () => {
		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? 'Ingresa un PIN de 4 dígitos' : 'Ingresa un código OTP de 6 dígitos')
			return
		}

		try {
			setSendingWithdraw(true)
			// Build details with original field names from working_data
			const details = {}
			for (const field of workingFields) {
				const key = keyFromFieldName(field.name)
				details[field.name] = workingForm[key] || ''
			}
			// Ante el 409 "en proceso" se espera y reintenta una vez con la MISMA clave
			const result = await callWithDuplicateRetry(() => withdrawApi.withdraw({
				amount: amountQUSD,
				coin: selectedCoin.tick,
				details,
				pin,
				...(sourceSats && { source: 'satoshis', amountSats: Number(amountSats) }),
				idempotencyKey: idempotencyKeyRef.current,
			}))

			if (result.success) {
				idempotencyKeyRef.current = makeIdempotencyKey()
				if (sourceSats) {
					toast.success('Redención procesada', { description: `Se han redimido ${Number(amountSats).toLocaleString()} sats` })
					// El backend devuelve los sats restantes fresh — reflejarlos sin refetch
					const satoshisLeft = result.data?.data?.satoshis
					if (typeof satoshisLeft === 'number') { updateUser({ satoshis: satoshisLeft }) }
				} else {
					toast.success('Extracción procesada', { description: `Se han extraído $${amountQUSD} QUSD` })
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
				toast.error('Error de red', { description: `${result.error || 'No se ha podido conectar con el servidor'}. ${SAFE_RETRY_HINT}` })
			} else {
				toast.error(result.error || 'No se pudo completar la extracción')
			}
		} catch (err) {
			toast.error('Error al procesar la extracción')
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
							title={sourceSats ? `Redimir ${(Number(amountSats) || 0).toLocaleString()} sats` : `Extraer $${amountQUSD} ${currency}`}
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
							title="Continuar"
							onPress={() => {
								// Gate preventivo: el backend rechaza retiros > $1000 sin KYC
								if (!requireKyc({
									gated: Number(amountQUSD) > KYC_WITHDRAW_THRESHOLD,
									message: `Los retiros de más de $${KYC_WITHDRAW_THRESHOLD} requieren tener tu identidad verificada. Es rápido y solo se hace una vez.`,
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
							leftText="Saldo"
							rightText={`⚡ ${availableSats.toLocaleString()} sats`}
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
							lockedCaption={`Monto fijado por la factura ⚡ ${lnAmountSats.toLocaleString()} sats`}
							theme={theme}
							textStyles={textStyles}
						/>
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
							{lnInfo.description ? `“${lnInfo.description}”` : 'Factura Lightning'}
							{lnInfo.expires_at ? ` · expira en ${Math.max(0, Math.round((lnInfo.expires_at - Date.now()) / 60000))} min` : ''}
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
				isLoading={isLoading}
				amount={amountQUSD}
				direction="out"
				recentKey={RECENT_WITHDRAW_KEY}
				defaultCoins={DEFAULT_WITHDRAW_COINS}
			/>

			<KycGateModal visible={gateVisible} message={gateMessage} onClose={closeGate} />
		</>
	)
}

export default Withdraw
