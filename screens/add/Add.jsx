import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { StyleSheet, Text, View, Pressable, Linking } from 'react-native'

// Helpers
import { detectInstalledWallets } from '../../helpers/walletDeeplinks'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Context
import { useAuth } from '../../auth/AuthContext'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPButton from '../../ui/particles/QPButton'
import AmountInput from '../../ui/AmountInput'
import QPCoinRow from '../../ui/QPCoinRow'
import QPCoinPicker from '../../ui/QPCoinPicker'
import WalletPickerSheet from '../../ui/WalletPickerSheet'
import DepositDetailsModal from './DepositDetailsModal'

// API
import apiClient from '../../api/client'

// Hooks
import useTransactionSSE from '../../hooks/useTransactionSSE'

// In-app review
import { maybeRequestReview } from '../../helpers/inAppReview'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Generic field setter for the related-state slices below
function setFieldReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

// Quick coin pills for deposit
const DEFAULT_DEPOSIT_COINS = [
	{ tick: 'USDT', label: 'USDT' },
	{ tick: 'BTC', label: 'BTC' },
	{ tick: 'USDTBSC', label: 'USDT BSC' },
]
const RECENT_DEPOSIT_KEY = 'qp_recent_deposit_coins'

/**
 * Deposit ("Add money") screen: pick a coin, enter an amount, get a payment address.
 * Coins come from `GET /coins/v2?enabled_in=true`; the deposit is created via
 * `POST /topup`. The resulting invoice modal follows the transaction in real time
 * over SSE (`useTransactionSSE`) for paid/expired/failed status and refreshes the
 * balance (and may request an in-app review) once confirmed.
 * Crypto deposits detect installed wallets (Trust Wallet & co.) and can open them
 * pre-filled via universal links (`helpers/walletDeeplinks`).
 */
const Add = ({ navigation }) => {

	// User Context
	const { user, updateUser } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	// Coin/amount form (same-named setters keep every call site unchanged)
	const [form, dispatchForm] = useReducer(setFieldReducer, { availableCoins: [], selectedCoin: null, amount: '' })
	const { availableCoins, selectedCoin, amount } = form
	const setAvailableCoins = (value) => dispatchForm({ type: 'set', field: 'availableCoins', value })
	const setSelectedCoin = (value) => dispatchForm({ type: 'set', field: 'selectedCoin', value })
	const setAmount = (value) => dispatchForm({ type: 'set', field: 'amount', value })

	// Deposit flow
	const [deposit, dispatchDeposit] = useReducer(setFieldReducer, { showDepositModal: false, topupData: null, depositStatus: 'pending' })
	const { showDepositModal, topupData, depositStatus } = deposit
	const setShowDepositModal = (value) => dispatchDeposit({ type: 'set', field: 'showDepositModal', value })
	const setTopupData = (value) => dispatchDeposit({ type: 'set', field: 'topupData', value })
	const setDepositStatus = (value) => dispatchDeposit({ type: 'set', field: 'depositStatus', value })

	// Wallet picker
	const [wallet, dispatchWallet] = useReducer(setFieldReducer, { installedWallets: [], showWalletPicker: false })
	const { installedWallets, showWalletPicker } = wallet
	const setInstalledWallets = (value) => dispatchWallet({ type: 'set', field: 'installedWallets', value })
	const setShowWalletPicker = (value) => dispatchWallet({ type: 'set', field: 'showWalletPicker', value })

	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)
	const [showCoinPicker, setShowCoinPicker] = useState(false)

	// SSE connection for real-time deposit status updates
	const handleDepositStatusChange = useCallback((newStatus) => {
		setDepositStatus(newStatus)
		if (newStatus === 'paid') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			toast.success('Pago confirmado', { description: 'Tu depósito ha sido procesado exitosamente' })
			// Close modal and refresh balance after a brief delay
			setTimeout(() => {
				setShowDepositModal(false)
				updateUser()
			}, 2000)
			// Ask for app review after modal closes
			setTimeout(() => { maybeRequestReview() }, 3500)
		} else if (newStatus === 'expired') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			setCountdown(0)
		} else if (newStatus === 'failed') { if (countdownRef.current) clearInterval(countdownRef.current) }
	}, [updateUser])

	const { isConnected: sseConnected } = useTransactionSSE(
		showDepositModal ? topupData?.transaction_uuid : null,
		handleDepositStatusChange
	)

	// Reset deposit status when modal opens
	useEffect(() => {
		if (showDepositModal) setDepositStatus('pending')
	}, [showDepositModal])

	// Detect installed wallets compatible with the issued deposit address.
	// Only relevant for the crypto flow (no redirect_url like PayPal).
	useEffect(() => {
		if (!topupData?.wallet || topupData?.redirect_url) { setInstalledWallets([]); return }
		let cancelled = false
			; (async () => {
				const wallets = await detectInstalledWallets(topupData.coin, topupData.network || selectedCoin?.network)
				if (!cancelled) setInstalledWallets(wallets)
			})()
		return () => { cancelled = true }
	}, [topupData?.wallet, topupData?.coin, topupData?.network, topupData?.redirect_url, selectedCoin?.network])

	// Get Available Coins for enabled_in
	useEffect(() => {
		const fetchAvailableCoins = async () => {
			try {
				setIsLoading(true)
				const response = await apiClient.get('/coins/v2?enabled_in=true')
				setAvailableCoins(response.data)
			} catch (err) {
				setError('Error al cargar las monedas disponibles')
			} finally { setIsLoading(false) }
		}
		fetchAvailableCoins()
	}, [])

	// Handle coin selection
	const handleCoinSelect = (coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
	}

	// Handle topup request
	const handleTopup = async () => {
		const amountValue = parseFloat(amount)
		if (isNaN(amountValue) || amountValue <= 0) { toast.error('Por favor ingresa un monto válido'); return }
		if (!selectedCoin || !amount) { toast.error('Por favor selecciona una moneda e ingresa un monto'); return }
		if (amountValue < parseFloat(selectedCoin.min_in)) { toast.error(`El monto mínimo para ${selectedCoin.name} es ${selectedCoin.min_in}`); return }
		try {
			setIsLoading(true)
			setError(null)
			const response = await apiClient.post('/topup', { pay_method: selectedCoin.tick, amount: Number(amount) })
			if (response.data && response.status === 200) {
				const data = response.data.data
				setTopupData(data)
				setShowDepositModal(true)
				if (data?.redirect_url) {
					Linking.openURL(data.redirect_url)
				}
			} else { toast.error('Error al crear la solicitud de depósito') }
		} catch (err) { setError('Error al crear la solicitud de depósito, intente nuevamente en unos minutos') }
		finally { setIsLoading(false) }
	}

	// Countdown timer state
	const [countdown, setCountdown] = useState(1800)
	const countdownRef = useRef(null)

	// Start countdown when deposit modal opens
	useEffect(() => {
		if (showDepositModal) {
			setCountdown(1800)
			countdownRef.current = setInterval(() => {
				setCountdown(prev => {
					if (prev <= 1) {
						clearInterval(countdownRef.current)
						return 0
					}
					return prev - 1
				})
			}, 1000)
		} else { if (countdownRef.current) { clearInterval(countdownRef.current) } }
		return () => { if (countdownRef.current) { clearInterval(countdownRef.current) } }
	}, [showDepositModal])

	return (
		<>
			<QPKeyboardView
				actions={
					<QPButton
						title="Generar Depósito"
						onPress={handleTopup}
						disabled={!selectedCoin || !amount}
						loading={isLoading}
						icon="plus"
						iconStyle="solid"
						iconColor={theme.colors.almostWhite}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				}

			>

				{/* Amount Input Component */}
				<AmountInput
					amount={amount}
					onAmountChange={setAmount}
					placeholder="Monto a depositar"
					style={{ marginTop: 0 }}
					balance={user.balance}
				/>

				{/* Coin Selection */}
				<View style={{ marginVertical: 20 }}>

					{selectedCoin && (
						<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 12 }]}>
							Seleccionar moneda:
						</Text>
					)}

					<Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.surface, borderColor: selectedCoin ? theme.colors.primary : theme.colors.elevation }]} onPress={() => setShowCoinPicker(true)} disabled={isLoading} >
						{selectedCoin ? (
							<View style={styles.selectedCoin}>
								<QPCoinRow coin={selectedCoin} amount={amount} direction="in" />
								<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" style={{ marginLeft: 8 }} />
							</View>
						) : (
							<View style={styles.coinSelectorPlaceholder}>
								<Text style={[textStyles.subtitle, { color: theme.colors.tertiaryText }]}>
									{isLoading ? "Cargando monedas..." : "Seleccionar moneda"}
								</Text>
								<FontAwesome6 name="chevron-down" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
							</View>
						)}
					</Pressable>
				</View>

				{/* Error/Success Messages */}
				{error && (
					<View style={[containerStyles.card, { backgroundColor: theme.colors.danger + '20', marginVertical: 10 }]}>
						<Text style={[textStyles.caption, { color: theme.colors.danger }]}>{error}</Text>
					</View>
				)}


			</QPKeyboardView>

			{/* Deposit Details Modal */}
			<DepositDetailsModal
				visible={showDepositModal}
				onClose={() => setShowDepositModal(false)}
				amount={amount}
				selectedCoin={selectedCoin}
				topupData={topupData}
				depositStatus={depositStatus}
				countdown={countdown}
				sseConnected={sseConnected}
				installedWallets={installedWallets}
				onOpenWalletPicker={() => setShowWalletPicker(true)}
				theme={theme}
				textStyles={textStyles}
			/>

			{/* Coin Picker Modal */}
			<QPCoinPicker
				visible={showCoinPicker}
				onClose={() => setShowCoinPicker(false)}
				onSelect={handleCoinSelect}
				coins={availableCoins}
				selectedCoin={selectedCoin}
				isLoading={isLoading}
				amount={amount}
				direction="in"
				recentKey={RECENT_DEPOSIT_KEY}
				defaultCoins={DEFAULT_DEPOSIT_COINS}
			/>

			{/* Wallet Picker Sheet — opens installed wallet pre-filled */}
			<WalletPickerSheet
				visible={showWalletPicker}
				wallets={installedWallets}
				ctx={{
					address: topupData?.wallet,
					amount: topupData?.value,
					memo: topupData?.memo,
					coin: topupData?.coin,
					network: topupData?.network || selectedCoin?.network,
				}}
				onClose={() => setShowWalletPicker(false)}
			/>

		</>
	)
}

const styles = StyleSheet.create({
	coinSelector: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 16,
		borderWidth: 1,
	},
	coinSelectorPlaceholder: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		flex: 1,
		paddingVertical: 4,
	},
	selectedCoin: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
})

export default Add
