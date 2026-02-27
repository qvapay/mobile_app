import { useState, useEffect, useRef, useCallback } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Helpers
import { getFirstChunk, truncateWalletAddress, copyTextToClipboard } from '../../helpers'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Context
import { useAuth } from '../../auth/AuthContext'

// UI
import QPKeyboardView from '../../ui/QPKeyboardView'
import QPCoin from '../../ui/particles/QPCoin'
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'
import AmountInput from '../../ui/AmountInput'
import QPCoinRow from '../../ui/QPCoinRow'

// API
import apiClient from '../../api/client'

// Hooks
import useTransactionSSE from '../../hooks/useTransactionSSE'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// Add money into the platform
const Add = ({ navigation }) => {

	// User Context
	const { user, updateUser } = useAuth()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	// States
	const [availableCoins, setAvailableCoins] = useState([])
	const [selectedCoin, setSelectedCoin] = useState(null)
	const [amount, setAmount] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)
	const [success, setSuccess] = useState(null)
	const [showInstructions, setShowInstructions] = useState(false)
	const [showCoinPicker, setShowCoinPicker] = useState(false)
	const [showDepositModal, setShowDepositModal] = useState(false)
	const [topupData, setTopupData] = useState(null)
	const [coinSearch, setCoinSearch] = useState('')
	const [showCoinSearch, setShowCoinSearch] = useState(false)
	const [depositStatus, setDepositStatus] = useState('pending')

	// SSE connection for real-time deposit status updates
	const handleDepositStatusChange = useCallback((newStatus) => {
		setDepositStatus(newStatus)
		if (newStatus === 'paid') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			Toast.show({ type: 'success', text1: 'Pago confirmado', text2: 'Tu depósito ha sido procesado exitosamente' })
			// Close modal and refresh balance after a brief delay
			setTimeout(() => {
				setShowDepositModal(false)
				updateUser()
			}, 2000)
		} else if (newStatus === 'expired') {
			if (countdownRef.current) clearInterval(countdownRef.current)
			setCountdown(0)
		} else if (newStatus === 'failed') {
			if (countdownRef.current) clearInterval(countdownRef.current)
		}
	}, [])

	const { isConnected: sseConnected } = useTransactionSSE(
		showDepositModal ? topupData?.transaction_uuid : null,
		handleDepositStatusChange
	)

	// Reset deposit status when modal opens
	useEffect(() => {
		if (showDepositModal) setDepositStatus('pending')
	}, [showDepositModal])

	// Get Available Coins for enabled_in
	useEffect(() => {
		const fetchAvailableCoins = async () => {
			try {
				setIsLoading(true)
				const response = await apiClient.get('/coins/v2?enabled_in=true')
				setAvailableCoins(response.data)
			} catch (error) {
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
		if (isNaN(amountValue) || amountValue <= 0) { Toast.show({ type: 'error', text1: 'Por favor ingresa un monto válido' }); return }
		if (!selectedCoin || !amount) { Toast.show({ type: 'error', text1: 'Por favor selecciona una moneda e ingresa un monto' }); return }
		if (amountValue < parseFloat(selectedCoin.min_in)) { Toast.show({ type: 'error', text1: `El monto mínimo para ${selectedCoin.name} es ${selectedCoin.min_in}` }); return }
		try {
			setIsLoading(true)
			setError(null)
			const response = await apiClient.post('/topup', { pay_method: selectedCoin.tick, amount: Number(amount) })
			if (response.data && response.status === 200) {
				setTopupData(response.data.data)
				setShowDepositModal(true)
			} else { Toast.show({ type: 'error', text1: 'Error al crear la solicitud de depósito' }) }
		} catch (error) { setError('Error al crear la solicitud de depósito, intente nuevamente en unos minutos') }
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

	// Format countdown as MM:SS
	const formatCountdown = useCallback((seconds) => {
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
	}, [])

	// Get countdown color based on remaining time
	const getCountdownColor = useCallback((seconds) => {
		if (seconds <= 0) return theme.colors.danger
		if (seconds < 60) return theme.colors.danger
		if (seconds < 300) return theme.colors.warning
		return theme.colors.primary
	}, [theme])

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
					currency={selectedCoin?.tick}
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

				{success && (
					<View style={[containerStyles.card, { backgroundColor: theme.colors.success + '20', marginVertical: 10 }]}>
						<Text style={[textStyles.caption, { color: theme.colors.success }]}>{success}</Text>
					</View>
				)}

			</QPKeyboardView>

			{/* Deposit Details Modal */}
			<Modal visible={showDepositModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDepositModal(false)}>
				<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

					{/* Modal Header */}
					<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
						<View style={{ flex: 1 }}>
							<Text style={textStyles.h4}>Depositar ${amount} QUSD</Text>
						</View>
						{/* Countdown Badge + SSE indicator */}
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
							<View style={[styles.sseDot, { backgroundColor: sseConnected ? theme.colors.success : theme.colors.danger }]} />
							<View style={[styles.countdownBadge, { backgroundColor: getCountdownColor(countdown) + '20', borderColor: getCountdownColor(countdown) }]}>
								<FontAwesome6 name="clock" size={12} color={getCountdownColor(countdown)} iconStyle="solid" />
								<Text style={[textStyles.caption, { color: getCountdownColor(countdown), fontFamily: 'Rubik-Medium', marginLeft: 4, fontVariant: ['tabular-nums'], minWidth: 42 }]}>
									{countdown > 0 ? formatCountdown(countdown) : 'Expirado'}
								</Text>
							</View>
						</View>
						<Pressable onPress={() => setShowDepositModal(false)} style={[styles.closeButton, { marginLeft: 12 }]}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>

					<ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>

						{/* Deposit Status Banner */}
						{depositStatus === 'processing' && (
							<View style={[styles.statusBanner, { backgroundColor: theme.colors.warning + '15', borderColor: theme.colors.warning }]}>
								<FontAwesome6 name="spinner" size={14} color={theme.colors.warning} iconStyle="solid" />
								<Text style={[textStyles.subtitle, { color: theme.colors.warning, marginLeft: 8, flex: 1 }]}>
									Pago detectado, procesando...
								</Text>
							</View>
						)}
						{depositStatus === 'paid' && (
							<View style={[styles.statusBanner, { backgroundColor: theme.colors.success + '15', borderColor: theme.colors.success }]}>
								<FontAwesome6 name="circle-check" size={14} color={theme.colors.success} iconStyle="solid" />
								<Text style={[textStyles.subtitle, { color: theme.colors.success, marginLeft: 8, flex: 1 }]}>
									Pago confirmado
								</Text>
							</View>
						)}
						{depositStatus === 'expired' && (
							<View style={[styles.statusBanner, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger }]}>
								<FontAwesome6 name="clock" size={14} color={theme.colors.danger} iconStyle="solid" />
								<Text style={[textStyles.subtitle, { color: theme.colors.danger, marginLeft: 8, flex: 1 }]}>
									Depósito expirado
								</Text>
							</View>
						)}
						{depositStatus === 'failed' && (
							<View style={[styles.statusBanner, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger }]}>
								<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.danger} iconStyle="solid" />
								<Text style={[textStyles.subtitle, { color: theme.colors.danger, marginLeft: 8, flex: 1 }]}>
									Error en el pago
								</Text>
							</View>
						)}

						{/* Countdown expiration fallback */}
						{countdown <= 0 && depositStatus === 'pending' && (
							<View style={[styles.warningBanner, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger }]}>
								<FontAwesome6 name="triangle-exclamation" size={16} color={theme.colors.danger} iconStyle="solid" />
								<Text style={[textStyles.subtitle, { color: theme.colors.danger, marginLeft: 8, flex: 1 }]}>
									Este depósito ha expirado. Por favor genera uno nuevo.
								</Text>
							</View>
						)}

						{/* Coin + Network Badge */}
						<View style={styles.coinNetworkBadge}>
							<View style={[styles.coinNetworkInner, { backgroundColor: theme.colors.primary + '10' }]}>
								<QPCoin coin={selectedCoin?.logo || topupData?.coin} size={24} />
								<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginLeft: 8 }]}>
									{topupData?.coin}
								</Text>
								{(topupData?.network || selectedCoin?.network) && (
									<View style={[styles.networkBadgeSmall, { backgroundColor: theme.colors.primary }]}>
										<Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>
											{topupData?.network || selectedCoin?.network}
										</Text>
									</View>
								)}
							</View>
						</View>

						{/* QR Code Section */}
						<View style={styles.qrSection}>
							<View style={[styles.qrCard, { backgroundColor: theme.colors.surface }]}>
								<QRCodeStyled
									data={topupData?.wallet}
									style={{ backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden' }}
									size={280}
									padding={12}
									pieceSize={8}
									isPiecesGlued
									pieceBorderRadius={2}
									pieceCornerType={'cut'}
									errorCorrectionLevel={'H'}
									preserveAspectRatio="none"
									backgroundColor={'#FFFFFF'}
									color={'#000000'}
									outerEyesOptions={{
										borderRadius: 2,
										color: theme.colors.primary,
									}}
								/>
							</View>
						</View>

						{/* Crypto Amount - Prominent */}
						<View style={styles.amountSection}>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>
								Total a pagar
							</Text>
							<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
								<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontFamily: 'Rubik-Bold' }]}>
									{Number(topupData?.value).toFixed(8)}
								</Text>
								<Text style={[textStyles.h3, { color: theme.colors.primary, marginLeft: 8 }]}>
									{topupData?.coin}
								</Text>
							</View>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 4 }]}>
								1 {topupData?.coin} ≈ ${Number(topupData?.price).toFixed(6)}
							</Text>
						</View>

						{/* Deposit Details Card */}
						<View style={[styles.depositDetailsCard, { backgroundColor: theme.colors.surface }]}>

							{/* Deposit Address */}
							<View style={styles.detailRow}>
								<View style={styles.detailLeft}>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Dirección</Text>
								</View>
								<View style={styles.detailRight}>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1, marginRight: 8, textAlign: 'right' }]} numberOfLines={1}>
										{truncateWalletAddress(topupData?.wallet || '')}
									</Text>
									<Pressable onPress={() => copyTextToClipboard(topupData?.wallet)} hitSlop={8}>
										<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
									</Pressable>
								</View>
							</View>

							{/* Deposit Amount in QUSD */}
							<View style={styles.detailRow}>
								<View style={styles.detailLeft}>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Monto a depositar</Text>
								</View>
								<View style={styles.detailRight}>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>
										${amount} QUSD
									</Text>
								</View>
							</View>

							{/* Bank Account Options */}
							{topupData?.account_name && (
								<View style={styles.detailRow}>
									<View style={styles.detailLeft}>
										<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Nombre del titular</Text>
									</View>
									<View style={styles.detailRight}>
										<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1, marginRight: 8, textAlign: 'right' }]} numberOfLines={1}>
											{topupData?.account_name}
										</Text>
										<Pressable onPress={() => copyTextToClipboard(topupData?.account_name)} hitSlop={8}>
											<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
										</Pressable>
									</View>
								</View>
							)}

							{topupData?.routing_number && (
								<View style={styles.detailRow}>
									<View style={styles.detailLeft}>
										<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Número de ruta</Text>
									</View>
									<View style={styles.detailRight}>
										<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1, marginRight: 8, textAlign: 'right' }]} numberOfLines={1}>
											{topupData?.routing_number}
										</Text>
										<Pressable onPress={() => copyTextToClipboard(topupData?.routing_number)} hitSlop={8}>
											<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
										</Pressable>
									</View>
								</View>
							)}

							{topupData?.account_number && (
								<View style={styles.detailRow}>
									<View style={styles.detailLeft}>
										<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Número de cuenta</Text>
									</View>
									<View style={styles.detailRight}>
										<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1, marginRight: 8, textAlign: 'right' }]} numberOfLines={1}>
											{topupData?.account_number}
										</Text>
										<Pressable onPress={() => copyTextToClipboard(topupData?.account_number)} hitSlop={8}>
											<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
										</Pressable>
									</View>
								</View>
							)}

							{/* Memo - only if exists */}
							{topupData?.memo && (
								<View style={styles.detailRow}>
									<View style={styles.detailLeft}>
										<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Memo</Text>
									</View>
									<View style={styles.detailRight}>
										<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1, marginRight: 8, textAlign: 'right' }]} numberOfLines={1}>
											{topupData?.memo}
										</Text>
										<Pressable onPress={() => copyTextToClipboard(topupData?.memo)} hitSlop={8}>
											<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
										</Pressable>
									</View>
								</View>
							)}

							{/* Exchange Rate */}
							<View style={styles.detailRow}>
								<View style={styles.detailLeft}>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Tasa de cambio</Text>
								</View>
								<View style={styles.detailRight}>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>
										${Number(topupData?.price).toFixed(6)}
									</Text>
								</View>
							</View>

							{/* Total to Pay */}
							<View style={styles.detailRow}>
								<View style={styles.detailLeft}>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Total a pagar</Text>
								</View>
								<View style={styles.detailRight}>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText, fontFamily: 'Rubik-Medium', flex: 1, marginRight: 8, textAlign: 'right' }]} numberOfLines={1}>
										{Number(topupData?.value).toFixed(8)} {topupData?.coin}
									</Text>
									<Pressable onPress={() => copyTextToClipboard(Number(topupData?.value).toFixed(8))} hitSlop={8}>
										<FontAwesome6 name="copy" size={14} color={theme.colors.primary} iconStyle="solid" />
									</Pressable>
								</View>
							</View>

							{/* Transaction ID */}
							<View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
								<View style={styles.detailLeft}>
									<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Transacción</Text>
								</View>
								<View style={styles.detailRight}>
									<Text style={[textStyles.caption, { color: theme.colors.primaryText }]} numberOfLines={1}>
										{getFirstChunk(topupData?.transaction_uuid)}
									</Text>
								</View>
							</View>

						</View>

						{/* Warnings Section */}
						<View style={[styles.warningsCard, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger + '30' }]}>
							<View style={styles.warningsHeader}>
								<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.danger} iconStyle="solid" />
								<Text style={[textStyles.h6, { color: theme.colors.danger, marginLeft: 8 }]}>Importante</Text>
							</View>
							<View style={styles.warningsList}>
								<Text style={[textStyles.caption, styles.warningItem, { color: theme.colors.danger }]}>
									{'\u2022'} No envíe cripto a otra dirección
								</Text>
								<Text style={[textStyles.caption, styles.warningItem, { color: theme.colors.danger }]}>
									{'\u2022'} Complete el pago en 30 minutos
								</Text>
								<Text style={[textStyles.caption, styles.warningItem, { color: theme.colors.danger }]}>
									{'\u2022'} Envíe exactamente la cantidad indicada
								</Text>
								<Text style={[textStyles.caption, styles.warningItem, { color: theme.colors.danger }]}>
									{'\u2022'} No use una red/token diferente
								</Text>
							</View>
						</View>

					</ScrollView>
				</SafeAreaView>
			</Modal>

			{/* Coin Picker Modal */}
			<Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCoinPicker(false)}>
				<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

					<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
						<Text style={textStyles.h4}>Seleccionar Moneda</Text>
						<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
							<Pressable onPress={() => setShowCoinSearch(!showCoinSearch)}>
								<FontAwesome6 name="magnifying-glass" size={18} color={showCoinSearch ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
							<Pressable onPress={() => setShowCoinPicker(false)} style={styles.closeButton}>
								<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						</View>
					</View>

					{showCoinSearch && (
						<View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
							<QPInput
								value={coinSearch}
								onChangeText={setCoinSearch}
								placeholder="Buscar moneda..."
								prefixIconName="magnifying-glass"
								style={styles.searchInput}
							/>
						</View>
					)}

					<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>

						{isLoading ? (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando monedas...</Text>
							</View>
						) : availableCoins.length > 0 ? (availableCoins
							.filter((coin) =>
								coin.name.toLowerCase().includes(coinSearch.toLowerCase()) ||
								coin.tick.toLowerCase().includes(coinSearch.toLowerCase())
							)
							.map((coin) => (
								<Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.elevation }]} onPress={() => handleCoinSelect(coin)} >
									<QPCoinRow coin={coin} amount={amount} direction="in" />
								</Pressable>
							))
						) : (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>
									No hay monedas disponibles
								</Text>
							</View>
						)}

					</ScrollView>
				</SafeAreaView>
			</Modal>

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
	modalContainer: {
		flex: 1,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5
	},
	closeButton: {
		padding: 5,
	},
	countdownBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 20,
		borderWidth: 1,
	},
	sseDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	statusBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 16,
	},
	coinList: {
		flex: 1,
	},
	coinListContent: {
		padding: 20,
		paddingBottom: 40,
	},
	coinItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		marginBottom: 10,
		borderWidth: 1,
	},
	networkBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		marginLeft: 8,
	},
	networkBadgeSmall: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 10,
		marginLeft: 10,
	},
	loadingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 40,
	},
	// Deposit Modal Styles
	modalContent: {
		flex: 1,
	},
	modalContentContainer: {
		padding: 20,
		paddingBottom: 40,
	},
	warningBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 16,
	},
	coinNetworkBadge: {
		alignItems: 'center',
		marginBottom: 8,
	},
	coinNetworkInner: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
	},
	qrSection: {
		alignItems: 'center',
		marginVertical: 16,
	},
	qrCard: {
		padding: 16,
		borderRadius: 20,
		alignItems: 'center',
	},
	amountSection: {
		alignItems: 'center',
		marginVertical: 16,
	},
	depositDetailsCard: {
		borderRadius: 16,
		padding: 16,
		marginTop: 8,
	},
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255, 255, 255, 0.1)',
	},
	detailLeft: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	detailRight: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
		justifyContent: 'flex-end',
		gap: 4,
	},
	warningsCard: {
		borderRadius: 12,
		padding: 16,
		marginTop: 20,
		borderWidth: 1,
	},
	warningsHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 10,
	},
	warningsList: {
		gap: 6,
	},
	warningItem: {
		paddingLeft: 4,
	},
})

export default Add
