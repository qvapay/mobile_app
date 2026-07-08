import { useEffect, useMemo, useState, useReducer } from 'react'
import { View } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import QPCoinPicker from '../../ui/QPCoinPicker'
import WithdrawAmountCard from './WithdrawAmountCard'
import WithdrawAccountFields from './WithdrawAccountFields'
import WithdrawPinStep from './WithdrawPinStep'
import usePinEntry from '../../hooks/usePinEntry'

// API
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'

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
 * Confirmation uses an emailed PIN (`withdrawApi.requestPin`) or a 6-digit TOTP,
 * then submits `POST /withdraw`.
 */
const Withdraw = ({ navigation, route }) => {

	// Contexts
	const { user } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

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

	// PIN/OTP input mechanics (entered code, focus, method toggle, handlers)
	const { pin, setPin, twoFactorMethod, codeLength, focusedInputIndex, pinInputsRef, handlePinChange, handleKeyPress, handleFocus, handleBlur, handleMethodToggle } = usePinEntry()

	const hasOTP = !!user?.two_factor_secret

	// Pre-selected coin from navigation params (e.g., USDCASH from CashDeliveryCard)
	const preselectedCoin = route?.params?.preselectedCoin

	// Fetch available coins enabled_out
	useEffect(() => {
		const fetchCoins = async () => {
			try {
				setIsLoading(true)
				const response = await apiClient.get('/coins/v2?enabled_out=true')
				setAvailableCoins(response.data)
				if (preselectedCoin) {
					const coin = response.data.find(c => c.tick === preselectedCoin)
					if (coin) setSelectedCoin(coin)
				}
			} catch (err) { /* error fetching coins */ }
			finally { setIsLoading(false) }
		}
		fetchCoins()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [preselectedCoin])

	// Decimals to render for the coin amount input
	const coinDecimals = useMemo(() => {
		const d = Number(selectedCoin?.decimals)
		return Number.isFinite(d) && d >= 0 ? d : 2
	}, [selectedCoin])

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
		const amount = Number(amountQUSD)
		if (!amount || isNaN(amount)) { return false }
		return workingFields.every((field) => {
			const key = keyFromFieldName(field.name)
			const value = (workingForm[key] ?? '').toString().trim()
			return value.length > 0
		})
	}, [selectedCoin, amountQUSD, workingFields, workingForm])

	const handleCoinSelect = (coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
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
			const result = await withdrawApi.withdraw(amountQUSD, selectedCoin.tick, details, pin)

			if (result.success) {
				toast.success('Extracción procesada', { description: `Se han extraído $${amountQUSD} QUSD` })
				setShowPinStep(false)
				setPin('')
				setAmountQUSD('')
				setAmountCoin('')
				setWorkingForm({})
				navigation.goBack()
			} else {
				toast.error(result.error || 'No se pudo completar la extracción')
			}
		} catch (err) {
			toast.error('Error al procesar la extracción')
		} finally { setSendingWithdraw(false) }
	}

	// Auto-submit when all digits entered
	useEffect(() => {
		if (pin.length === codeLength && !sendingWithdraw) {
			handleWithdraw()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin])

	return (
		<>
			<QPKeyboardView
				actions={
					showPinStep ? (
						<QPButton
							title={`Extraer $${amountQUSD} ${currency}`}
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
							onPress={() => { setShowPinStep(true); setPin('') }}
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

					<WithdrawAmountCard
						amountQUSD={amountQUSD}
						amountCoin={amountCoin}
						onChangeQUSD={handleChangeQUSD}
						onChangeAmountCoin={handleChangeAmountCoin}
						selectedCoin={selectedCoin}
						balance={balance}
						currency={currency}
						onOpenCoinPicker={() => setShowCoinPicker(true)}
						theme={theme}
						textStyles={textStyles}
					/>

					{/* Dynamic Working Data Inputs */}
					{selectedCoin && workingFields.length > 0 && (
						<WithdrawAccountFields
							workingFields={workingFields}
							workingForm={workingForm}
							onChangeField={(key, text) => setWorkingForm((prev) => ({ ...prev, [key]: text }))}
							theme={theme}
							textStyles={textStyles}
						/>
					)}

					{/* PIN/OTP Step */}
					{showPinStep && (
						<WithdrawPinStep
							pin={pin}
							codeLength={codeLength}
							twoFactorMethod={twoFactorMethod}
							hasOTP={hasOTP}
							sendingPin={sendingPin}
							focusedInputIndex={focusedInputIndex}
							pinInputsRef={pinInputsRef}
							onPinChange={handlePinChange}
							onKeyPress={handleKeyPress}
							onFocus={handleFocus}
							onBlur={handleBlur}
							onMethodToggle={handleMethodToggle}
							onRequestPin={handleRequestPin}
							theme={theme}
							textStyles={textStyles}
						/>
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
		</>
	)
}

export default Withdraw
