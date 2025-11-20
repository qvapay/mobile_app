import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { SafeAreaView } from 'react-native-safe-area-context'

// Helpers
import { getFirstChunk } from '../../helpers'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Context
import { useAuth } from '../../auth/AuthContext'

// UI
import QPCoin from '../../ui/particles/QPCoin'
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'
import AmountInput from '../../ui/AmountInput'

// API
import apiClient from '../../api/client'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// Add money into the platform
const Add = ({ navigation }) => {

	// User Context
	const { user } = useAuth()

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

	// Get Available Coins for enabled_in
	useEffect(() => {
		const fetchAvailableCoins = async () => {
			try {
				setIsLoading(true)
				const response = await apiClient.get('/coins/v2?enabled_in=true')
				setAvailableCoins(response.data)
			} catch (error) {
				console.error('Error fetching coins:', error)
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

	// Copy to clipboard
	const copyToClipboard = (text) => {
		Clipboard.setString(text)
		Toast.show({ type: 'success', text1: 'Dirección copiada al portapapeles' })
	}

	return (
		<KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={{ flex: 1 }}>

					<View style={{ flex: 1 }}>

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

							<Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.surface }]} onPress={() => setShowCoinPicker(true)} disabled={isLoading} >
								{selectedCoin ? (
									<View style={styles.selectedCoin}>
										<QPCoin coin={selectedCoin.logo} size={40} />
										<View style={{ marginLeft: 12, flex: 1 }}>
											<Text style={textStyles.h4}>{selectedCoin.name}</Text>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
												Mín: {selectedCoin.min_in} | Fee: {selectedCoin.fee_in}
											</Text>
										</View>
										{selectedCoin.network && (
											<View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
												<Text style={[textStyles.caption, { color: theme.colors.buttonText }]}>
													{selectedCoin.network}
												</Text>
											</View>
										)}
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
					</View>

					{/* Action Buttons */}
					<View style={containerStyles.bottomButtonContainer}>
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
					</View>

					{/* Deposit Details Modal */}
					<Modal visible={showDepositModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDepositModal(false)}>
						<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

							{/* Modal Header */}
							<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
								<Text style={textStyles.h4}>Depositar ${amount} en {topupData?.coin}</Text>
								<Pressable onPress={() => setShowDepositModal(false)} style={styles.closeButton}>
									<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
								</Pressable>
							</View>

							<ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>

								{/* QR Code Section */}
								<View style={styles.qrSection}>
									<View style={styles.qrContainer}>
										<QRCodeStyled
											data={topupData?.wallet}
											size={250}
											pieceScale={0.5}
											style={{ backgroundColor: theme.colors.background, borderRadius: 10 }}
											padding={10}
											pieceSize={4}
											backgroundColor={'transparent'}
											color={theme.colors.primaryText}
										/>
									</View>
								</View>

								{/* Amount Information */}
								<View style={styles.amountSection}>
									<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 8 }]}>
										1 {topupData?.coin} ≈ ${Number(topupData?.price).toFixed(2)}
									</Text>
									<Text style={[textStyles.h1, { color: theme.colors.primaryText, textAlign: 'center', fontWeight: 'bold', marginBottom: 4 }]}>
										{Number(topupData?.value).toFixed(6)} {topupData?.coin}
									</Text>
								</View>

								{/* Deposit Details Card */}
								<View style={[styles.depositDetailsCard, { backgroundColor: theme.colors.surface }]}>

									{/* Network */}
									<View style={styles.detailRow}>
										<View style={styles.detailLeft}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Red:</Text>
										</View>
										<View style={[styles.detailRight]}>
											<QPCoin coin={topupData?.coin} size={16} />
											<Text style={[textStyles.h6, { color: theme.colors.primaryText }]}>{topupData?.coin}</Text>
										</View>
									</View>

									{/* Bank Account Options */}
									{topupData?.account_name && (
										<View style={styles.detailRow}>
											<View style={styles.detailLeft}>
												<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Nombre del titular:</Text>
											</View>
											<View style={styles.detailRight}>
												<Text style={[textStyles.caption, { color: theme.colors.secondaryText, flex: 1, marginRight: 8 }]} numberOfLines={1}>
													{topupData?.account_name}
												</Text>
												<Pressable onPress={() => copyToClipboard(topupData?.account_name)}>
													<FontAwesome6 name="copy" size={14} color={theme.colors.primary} />
												</Pressable>
											</View>
										</View>
									)}

									{/* Bank Account Options */}
									{topupData?.routing_number && (
										<View style={styles.detailRow}>
											<View style={styles.detailLeft}>
												<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Número de ruta:</Text>
											</View>
											<View style={styles.detailRight}>
												<Text style={[textStyles.caption, { color: theme.colors.secondaryText, flex: 1, marginRight: 8 }]} numberOfLines={1}>
													{topupData?.routing_number}
												</Text>
												<Pressable onPress={() => copyToClipboard(topupData?.routing_number)}>
													<FontAwesome6 name="copy" size={14} color={theme.colors.primary} />
												</Pressable>
											</View>
										</View>
									)}

									{/* Bank Account Options */}
									{topupData?.account_number && (
										<View style={styles.detailRow}>
											<View style={styles.detailLeft}>
												<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Número de cuenta:</Text>
											</View>
											<View style={styles.detailRight}>
												<Text style={[textStyles.caption, { color: theme.colors.secondaryText, flex: 1, marginRight: 8 }]} numberOfLines={1}>
													{topupData?.account_number}
												</Text>
												<Pressable onPress={() => copyToClipboard(topupData?.account_number)}>
													<FontAwesome6 name="copy" size={14} color={theme.colors.primary} />
												</Pressable>
											</View>
										</View>
									)}

									{/* Deposit Address */}
									<View style={styles.detailRow}>
										<View style={styles.detailLeft}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Dirección:</Text>
										</View>
										<View style={styles.detailRight}>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText, flex: 1, marginRight: 8 }]} numberOfLines={1}>
												{topupData?.wallet}
											</Text>
											<Pressable onPress={() => copyToClipboard(topupData?.wallet)}>
												<FontAwesome6 name="copy" size={14} color={theme.colors.primary} />
											</Pressable>
										</View>
									</View>

									{/* If MEMO is not empty */}
									{topupData?.memo && (
										<View style={styles.detailRow}>
											<View style={styles.detailLeft}>
												<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>MEMO:</Text>
											</View>
											<View style={styles.detailRight}>
												<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
													{topupData?.memo}
												</Text>
												<Pressable onPress={() => copyToClipboard(topupData?.memo)}>
													<FontAwesome6 name="copy" size={14} color={theme.colors.primary} />
												</Pressable>
											</View>
										</View>
									)}

									{/* Transaction ID */}
									<View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
										<View style={styles.detailLeft}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Transacción:</Text>
										</View>
										<View style={styles.detailRight}>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
												{getFirstChunk(topupData?.transaction_uuid)}
											</Text>
											<Pressable onPress={() => copyToClipboard(topupData?.transaction_uuid)}>
												<FontAwesome6 name="copy" size={14} color={theme.colors.primary} />
											</Pressable>
										</View>
									</View>

									{/* Expires in */}
									<View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
										<View style={styles.detailLeft}>
											<Text style={[textStyles.h6, { color: theme.colors.primaryText, marginLeft: 8 }]}>Expira en:</Text>
										</View>
										<View style={styles.detailRight}>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]} numberOfLines={1}>
												30:00
											</Text>
										</View>
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
										<Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => handleCoinSelect(coin)} >
											<QPCoin coin={coin.logo} size={40} />
											<View style={{ marginLeft: 12, flex: 1 }}>
												<Text style={textStyles.h4}>{coin.name}</Text>
												<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
													Mín: ${coin.min_in} | Precio: ${Number(coin.price).toFixed(6)}
												</Text>
											</View>
											{coin.network && (
												<View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
													<Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>
														{coin.network}
													</Text>
												</View>
											)}
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

				</View>
			</TouchableWithoutFeedback>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	coinSelector: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 15,
		borderRadius: 16,
		borderWidth: 0.5,
		borderColor: 'rgba(255, 255, 255, 0.2)',
	},
	coinSelectorPlaceholder: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		flex: 1,
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
		padding: 15,
		borderRadius: 10,
		marginBottom: 10,
		borderWidth: 0.5,
		borderColor: 'rgba(255, 255, 255, 0.2)',
	},
	networkBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		marginLeft: 8,
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
	qrSection: {
		alignItems: 'center',
		marginVertical: 20,
	},
	qrContainer: {
		padding: 20,
		borderRadius: 16,
		backgroundColor: 'rgba(255, 255, 255, 0.05)',
	},
	amountSection: {
		alignItems: 'center',
		marginVertical: 20,
	},
	actionButtonsContainer: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		marginVertical: 30,
		paddingHorizontal: 20,
	},
	actionButton: {
		alignItems: 'center',
		padding: 15,
	},
	depositDetailsCard: {
		borderRadius: 16,
		padding: 20,
		marginTop: 20,
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
		flex: 1,
	},
	detailRight: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
		justifyContent: 'flex-end',
		gap: 4,
	}
})

export default Add
