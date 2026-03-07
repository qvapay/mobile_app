import { useState, useEffect, useMemo } from "react"
import {
	View,
	Text,
	ScrollView,
	Pressable,
	TextInput,
	StyleSheet,
	Switch,
	Modal,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles, createContainerStyles } from "../../theme/themeUtils"

// UI
import QPKeyboardView from "../../ui/QPKeyboardView"
import QPCoin from "../../ui/particles/QPCoin"
import QPInput from "../../ui/particles/QPInput"
import QPButton from "../../ui/particles/QPButton"
import QPSwitch from "../../ui/particles/QPSwitch"

// Icons
import FontAwesome6 from "@react-native-vector-icons/fontawesome6"

// Toast
import { toast } from "sonner-native"

// API & Helpers
import coinsApi from "../../api/coinsApi"
import p2pApi from "../../api/p2pApi"
import { adjustNumber } from "../../helpers"
import { userApi } from "../../api/userApi"

// User context
import { useAuth } from "../../auth/AuthContext"

// Routes
import { ROUTES } from "../../routes"

// Lottie
import LottieView from "lottie-react-native"

// P2P Create component
const P2PCreate = ({ navigation }) => {

	// User context
	const { user } = useAuth()

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// Form State
	const [type, setType] = useState("buy") // 'buy' | 'sell'
	const [amount, setAmount] = useState("")
	const [receive, setReceive] = useState("")
	const [details, setDetails] = useState("")
	const [message, setMessage] = useState("")
	const [advancedOpen, setAdvancedOpen] = useState(false)

	// Advanced P2P Settings
	const [onlyVIP, setOnlyVIP] = useState(false)
	const [privateOffer, setPrivateOffer] = useState(false)

	// Coins selector state (mirrors Withdraw)
	const [availableCoins, setAvailableCoins] = useState([])
	const [selectedCoin, setSelectedCoin] = useState(null)
	const [showCoinPicker, setShowCoinPicker] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [coinSearch, setCoinSearch] = useState("")
	const [showCoinSearch, setShowCoinSearch] = useState(false)
	const [workingForm, setWorkingForm] = useState({})
	const [showSavedMethods, setShowSavedMethods] = useState(false)
	const [savedMethods, setSavedMethods] = useState([])
	const [savedMethodsLoading, setSavedMethodsLoading] = useState(false)
	const [p2pEnabled, setP2pEnabled] = useState(user.p2p_enabled)

	// Button Text State with Type and Amount values
	const [buttonText, setButtonText] = useState("")
	useEffect(() => {
		type === "buy" ? setButtonText(`Comprar ${amount > 0 ? "$" + amount : ""}`) : setButtonText(`Vender ${amount > 0 ? "$" + amount : ""}`)
	}, [type, amount])

	// Fetch available coins (enabled_p2p like Withdraw)
	useEffect(() => {
		const fetchCoins = async () => {
			try {
				setIsLoading(true)
				const response = await coinsApi.index({ enabled_p2p: true })
				setAvailableCoins(response.data)
			} catch (error) {
				// error fetching coins
			} finally { setIsLoading(false) }
		}
		fetchCoins()
	}, [])

	// Handle coin selection
	const handleCoinSelect = (coin) => {
		setSelectedCoin(coin)
		setShowCoinPicker(false)
		setWorkingForm({})
	}

	// Working data parsing (same logic as Withdraw)
	const workingFields = useMemo(() => {
		if (!selectedCoin || !selectedCoin.working_data) { return [] }
		try {
			const raw = typeof selectedCoin.working_data === "string" ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
			if (Array.isArray(raw)) { return raw }
			return []
		} catch (e) { return [] }
	}, [selectedCoin])

	// Helpers
	const keyFromFieldName = (name) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_|_$/g, "")
	const isNumber = (val) => /^\d*(?:[.,]?\d*)$/.test(val)
	const normalizeNumber = (val) => val.replace(",", ".")

	// Handle publish
	const handlePublish = async () => {

		if (type != "buy" && type != "sell") {
			toast.error("Datos incompletos", { description: "Debes seleccionar una opción" })
			return
		}

		if (!selectedCoin) {
			toast.error("Datos incompletos", { description: "Debes seleccionar una moneda" })
			return
		}

		// Basic validation
		if (!amount || !receive) {
			toast.error("Datos incompletos", { description: "Debes completar los montos de comprar y vender" })
			return
		}
		const amt = parseFloat(normalizeNumber(amount))
		const rcv = parseFloat(normalizeNumber(receive))
		if (isNaN(amt) || isNaN(rcv) || amt <= 0 || rcv <= 0) {
			toast.error("Montos inválidos", { description: "Introduce valores numéricos mayores que 0 para comprar y vender" })
			return
		}
		// Working data required if coin has fields
		if (selectedCoin && workingFields.length > 0) {
			const allFilled = workingFields.every((field) => {
				const key = keyFromFieldName(field.name)
				const value = (workingForm[key] ?? "").toString().trim()
				return value.length > 0
			})
			if (!allFilled) {
				toast.error("Faltan datos", { description: "Completa los datos de su cuenta para la moneda seleccionada para comprar y vender" })
				return
			}
		}

		try {

			setIsSending(true)

			const detailsArray = workingFields.length > 0 ? workingFields.map((field) => ({ name: field.name, value: (workingForm[keyFromFieldName(field.name)] ?? "").toString().trim() })) : []
			const payload = {
				type,
				coin: selectedCoin?.tick,
				amount: amt,
				receive: rcv,
				details: detailsArray,
				only_vip: onlyVIP ? 1 : 0,
				private: privateOffer ? 1 : 0,
				message: message,
			}
			const res = await p2pApi.create(payload)

			if (res.status === 201) {
				toast.success("Listo", { description: "Tu oferta se ha creado correctamente" })
				navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: res.data.p2p.uuid })
			} else {
				const errMsg = res?.error || "No se pudo crear la oferta P2P"
				toast.error("Error al crear la oferta", { description: errMsg })
			}

		} catch (error) {
			toast.error("Error al crear la oferta", { description: error.message })
		} finally { setIsSending(false) }
	}

	// Handle launch saved payment methods
	const lauchSavedPaymentMethods = () => {
		if (!selectedCoin) {
			toast.error("Selecciona una moneda")
			return
		}
		setSavedMethodsLoading(true)
		userApi.getPaymentMethods()
			.then((res) => {
				if (res.success) {
					const raw = Array.isArray(res.data) ? res.data : (res.data?.methods || [])
					const filtered = raw.filter((m) => {
						const tick = m?.coin?.tick || m?.tick || m?.coin || m?.ticker
						return String(tick || "").toLowerCase() === String(selectedCoin?.tick || "").toLowerCase()
					})
					setSavedMethods(filtered)
					setShowSavedMethods(true)
				} else { toast.error(res.error || "No se pudieron cargar los métodos") }
			})
			.catch((e) => { toast.error(e.message || "Error de red") })
			.finally(() => setSavedMethodsLoading(false))
	}

	// Apply saved method into working form
	const handleSelectSavedMethod = (method) => {
		try {
			const rawDetails = (method && (method.details || method.Details)) || null
			let detailsArray = []
			if (Array.isArray(rawDetails)) {
				detailsArray = rawDetails.map((d) => ({ name: d.name || d.key, value: String(d.value ?? d.val ?? "") }))
			} else if (rawDetails && typeof rawDetails === "object") { detailsArray = Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? "") })) }
			const nextForm = {}
			workingFields.forEach((field) => {
				const key = keyFromFieldName(field.name)
				const found = detailsArray.find((d) => String(d.name).toLowerCase() === String(field.name).toLowerCase())
				nextForm[key] = found ? found.value : ""
			})
			setWorkingForm(nextForm)
			setShowSavedMethods(false)
		} catch (e) { toast.error(e.message || "No se pudo aplicar el método") }
	}

	if (!p2pEnabled) {
		return (
			<View style={[containerStyles.subContainer, { flex: 1 }]}>
				<View style={styles.emptyContainer}>
					<LottieView source={require("../../assets/lotties/cancelled.json")} autoPlay loop={false} style={{ width: 250, height: 250 }} />
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: "center" }]}>P2P no está habilitado</Text>
				</View>
			</View>
		)
	}

	return (
		<>
			<QPKeyboardView
				actions={
					<QPButton
						title={buttonText}
						onPress={handlePublish}
						disabled={selectedCoin === null || amount === "" || receive === "" || isSending}
						loading={isSending}
						style={{
							backgroundColor: type === "buy" ? theme.colors.success : theme.colors.danger,
						}}
						textStyle={{
							color: type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite,
						}}
						iconColor={type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite}
						loadingColor={type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite}
					/>
				}
	
			>

				{/* Type Selector */}
				<QPSwitch
					value={type === "buy" ? "left" : "right"}
					onChange={(side) => setType(side === "left" ? "buy" : "sell")}
					leftText="Comprar"
					rightText="Vender"
					leftColor={theme.colors.danger}
					rightColor={theme.colors.success}
					rightTextColor={theme.colors.almostBlack}
				/>

				{/* Swap Card (Vender / Recibir) */}
				<View style={{ backgroundColor: theme.colors.elevation, borderRadius: 16, padding: 16, marginTop: 10, marginBottom: 6, borderWidth: 2, borderColor: theme.colors.primary }} >

					{/* Vender amount input */}
					<View style={{ paddingVertical: 2 }}>

						<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>
								{type === "buy" ? "Comprar" : "Vender"}
							</Text>
							<Pressable onPress={() => { if (type === "sell") setAmount(String(user?.balance || 0)) }}>
								<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>
									Balance: <Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: "600" }]}>${user?.balance || 0}</Text>
								</Text>
							</Pressable>
						</View>

						{/* Single row container */}
						<View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>

							{/* Left side - Amount input */}
							<View style={{ flex: 1 }}>
								<TextInput
									value={amount}
									onChangeText={(v) => { if (isNumber(v)) setAmount(v) }}
									placeholder="0.00"
									placeholderTextColor={theme.colors.placeholder}
									keyboardType="decimal-pad"
									style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontWeight: "600", padding: 0, margin: 0 }]}
								/>
							</View>

							{/* Right side - Static QUSD pill */}
							<View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
								<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
									<QPCoin coin="qusd" size={20} />
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600" }]}>QUSD</Text>
								</View>
							</View>
						</View>
					</View>

					{/* Recibir amount input */}
					<View style={{ paddingTop: 2 }}>

						<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>
							{type === "buy" ? "Enviar" : "Recibir"}
						</Text>

						{/* Single row container */}
						<View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>

							{/* Left side - Amount input */}
							<View style={{ flex: 1 }}>
								<TextInput
									value={receive}
									onChangeText={(v) => { if (isNumber(v)) setReceive(v) }}
									placeholder="0.00"
									placeholderTextColor={theme.colors.placeholder}
									keyboardType="decimal-pad"
									style={[
										textStyles.h2,
										{
											color: theme.colors.primaryText,
											fontSize: theme.typography.fontSize.xxxl,
											fontWeight: "600",
											padding: 0,
											margin: 0,
										},
									]}
								/>
							</View>
							{/* Right side - Currency selector button */}
							<Pressable style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border, }]} onPress={() => setShowCoinPicker(true)}>
								{selectedCoin ? (
									<View
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 8,
										}}
									>
										<QPCoin coin={selectedCoin.logo} size={20} />
										<Text
											style={[
												textStyles.h6,
												{
													color: theme.colors.primaryText,
													fontWeight: "600",
												},
											]}
										>
											{selectedCoin.tick}
										</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								) : (
									<View
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 8,
										}}
									>
										<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Moneda</Text>
										<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
									</View>
								)}
							</Pressable>
						</View>
					</View>
				</View>

				{/* Live Ratio Display */}
				{selectedCoin && parseFloat(amount) > 0 && parseFloat(receive) > 0 && (
					<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 }}>
						<FontAwesome6 name="money-bill-transfer" size={14} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.h6, { color: theme.colors.primary, fontWeight: "600" }]}>
							1 QUSD = {(parseFloat(receive) / parseFloat(amount)).toFixed(4)} {selectedCoin.tick}
						</Text>
					</View>
				)}

				{/* Details: Coin working data (same UX as Withdraw) */}
				{selectedCoin && workingFields.length > 0 && (
					<View style={{ marginTop: 12, marginBottom: 6 }}>
						<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} >
							<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 6 }]}>Detalles adicionales:</Text>
							<Pressable onPress={() => { lauchSavedPaymentMethods() }}>
								<FontAwesome6 name="book" size={16} color={theme.colors.primary} iconStyle="solid" />
							</Pressable>
						</View>

						{workingFields.map((field) => {
							const key = keyFromFieldName(field.name)
							return (
								<QPInput
									key={key}
									value={workingForm[key] || ""}
									onChangeText={(text) => setWorkingForm((prev) => ({ ...prev, [key]: text }))}
									placeholder={field.name}
									keyboardType={field.type === "number" ? "numeric" : "default"}
									style={{ marginVertical: 6 }}
								/>
							)
						})}
					</View>
				)}

				{/* Advanced */}
				<View style={containerStyles.card}>
					<Pressable onPress={() => setAdvancedOpen(!advancedOpen)} style={[styles.advancedHeader]}>
						<View style={{ flexDirection: "row", alignItems: "center" }}>
							<FontAwesome6 name="sliders" size={16} color={theme.colors.primaryText} iconStyle="solid" />
							<Text style={[textStyles.h5, { marginLeft: 8 }]}>Opciones avanzadas</Text>
						</View>
						<FontAwesome6 name={advancedOpen ? "angle-up" : "angle-down"} size={18} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>

					{advancedOpen && (
						<View style={{ marginTop: 10, gap: 10 }}>
							<View style={[styles.switchRow, { marginTop: 12 }]}>
								<Text style={[textStyles.h6]}>Solo usuarios VIP</Text>
								<Switch value={onlyVIP} onValueChange={setOnlyVIP} trackColor={{ true: theme.colors.primary }} />
							</View>
							<View style={styles.switchRow}>
								<Text style={[textStyles.h6]}>Oferta Privada</Text>
								<Switch value={privateOffer} onValueChange={setPrivateOffer} trackColor={{ true: theme.colors.primary }} />
							</View>
						</View>
					)}
				</View>

				{
					user.golden_check && (
						<QPInput
							value={message}
							onChangeText={setMessage}
							placeholder="Mensaje personalizado"
							keyboardType="default"
							style={{ marginVertical: 6 }}
						/>
					)
				}

			</QPKeyboardView>

			{/* Coin Picker Modal (same UX as Withdraw) */}
			<Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCoinPicker(false)}>
				<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
					<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
						<Text style={textStyles.h4}>Seleccionar Moneda</Text>
						<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
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
						) : availableCoins.length > 0 ? (
							availableCoins
								.filter(
									(coin) =>
										coin.name.toLowerCase().includes(coinSearch.toLowerCase()) ||
										coin.tick.toLowerCase().includes(coinSearch.toLowerCase())
								)
								.map((coin) => (
									<Pressable
										key={coin.id}
										style={[
											styles.coinItem,
											{
												backgroundColor: theme.colors.surface,
												borderColor: theme.colors.primary,
											},
										]}
										onPress={() => handleCoinSelect(coin)}
									>
										<QPCoin coin={coin.logo} size={40} />
										<View style={{ marginLeft: 12, flex: 1 }}>
											<Text style={textStyles.h4}>{coin.name}</Text>
											<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
												Mín: ${adjustNumber(coin.min_out)} | Precio: ${adjustNumber(coin.price)}
											</Text>
										</View>
										<View style={{ alignItems: "flex-end", gap: 4 }}>
											{coin.network && (
												<View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
													<Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>{coin.network}</Text>
												</View>
											)}
										</View>
									</Pressable>
								))
						) : (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay monedas disponibles</Text>
							</View>
						)}
					</ScrollView>
				</SafeAreaView>
			</Modal>

			{/* Saved Payment Methods Modal */}
			<Modal visible={showSavedMethods} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSavedMethods(false)}>
				<SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
					<View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
						<Text style={textStyles.h4}>Seleccionar método guardado</Text>
						<Pressable onPress={() => setShowSavedMethods(false)} style={styles.closeButton}>
							<FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>

					<ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
						{savedMethodsLoading ? (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando métodos...</Text>
							</View>
						) : (savedMethods || []).length > 0 ? (
							(savedMethods || []).map((method) => {
								const name = method?.name || method?.coin?.name || "Método"
								const rawDetails = (method && (method.details || method.Details)) || null
								const details = Array.isArray(rawDetails)
									? rawDetails
									: rawDetails && typeof rawDetails === "object"
										? Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? "") }))
										: []
								return (
									<Pressable key={method.id || method.uuid || JSON.stringify(method)} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => handleSelectSavedMethod(method)}>
										<View style={{ flex: 1 }}>
											<Text style={textStyles.h4}>{name}</Text>
											{details.length > 0 && (
												<View style={{ marginTop: 6, gap: 4 }}>
													{details.slice(0, 4).map((d, idx) => (
														<View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
															<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{d.name || d.key}</Text>
															<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: "600", marginLeft: 8 }]} numberOfLines={1} ellipsizeMode="middle">{d.value || d.val}</Text>
														</View>
													))}
												</View>
											)}
										</View>
									</Pressable>
								)
							})
						) : (
							<View style={styles.loadingContainer}>
								<Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay métodos guardados para esta moneda</Text>
							</View>
						)}
					</ScrollView>
				</SafeAreaView>
			</Modal>
		</>
	)
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		padding: 12,
		marginVertical: 6,
	},
	// Modal styles (mirroring Withdraw)
	modalContainer: { flex: 1 },
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingVertical: 15,
		borderBottomWidth: 0.5,
	},
	closeButton: { padding: 5 },
	coinList: { flex: 1 },
	coinListContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
	coinItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		borderRadius: 10,
		marginBottom: 10,
		borderWidth: 0.5,
		borderColor: "rgba(255, 255, 255, 0.2)",
	},
	networkBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		marginLeft: 8,
	},
	loadingContainer: {
		alignItems: "center",
		justifyContent: "center",
		padding: 40,
	},
	currencyButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 0.5,
	},
	segmentedContainer: {
		position: "relative",
		height: 44,
		borderRadius: 22,
		borderWidth: 1,
		overflow: "hidden",
		flexDirection: "row",
		alignItems: "center",
	},
	segmentedPill: {
		position: "absolute",
		left: 0,
		top: 2,
		bottom: 2,
		borderRadius: 20,
	},
	segmentedOption: {
		flex: 1,
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	segment: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 1,
	},
	inputRow: {
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	rightPill: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 20,
		backgroundColor: "transparent",
	},
	coinChip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
	},
	advancedHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	switchRow: {
		paddingVertical: 4,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 40,
	},
})

export default P2PCreate
