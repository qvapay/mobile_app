import { useState, useEffect, useMemo, useReducer } from "react"

// Theme
import { useTheme } from "../../theme/ThemeContext"
import { createTextStyles, createContainerStyles } from "../../theme/themeUtils"

// UI
import QPKeyboardView from "../../ui/QPKeyboardView"
import QPButton from "../../ui/particles/QPButton"
import QPCoinPicker from "../../ui/QPCoinPicker"
import P2PCreateForm from "./P2PCreateForm"
import SavedMethodsModal from "./SavedMethodsModal"
import P2PRequirementsGate from "./P2PRequirementsGate"

// Toast
import { toast } from "sonner-native"

// API & Helpers
import coinsApi from "../../api/coinsApi"
import p2pApi from "../../api/p2pApi"
import { userApi } from "../../api/userApi"

// User context
import { useAuth } from "../../auth/AuthContext"

// Routes
import { ROUTES } from "../../routes"

const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
const normalizeNumber = (val) => val.replace(",", ".")

// Generic field setter for the related-state slices below
function setFieldReducer(state, action) {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Form to publish a new P2P buy/sell offer (`POST /p2p/create`).
 * Coins come from `coinsApi.index({ enabled_p2p: true })`; the selected coin's
 * `working_data` JSON drives the dynamic payment-details fields (same pattern as
 * Withdraw), which can be pre-filled from saved payment methods
 * (`GET /user/payment-methods`). Gated by `user.p2p_enabled` (P2PRequirementsGate);
 * on 201 it navigates straight to the created offer (P2POffer).
 */
const P2PCreate = ({ navigation }) => {

	// User context
	const { user } = useAuth()

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Offer form
	const [form, dispatchForm] = useReducer(setFieldReducer, { type: "buy", amount: "", receive: "", message: "", advancedOpen: false, onlyVIP: false, privateOffer: false })
	const { type, amount, receive, message, onlyVIP, privateOffer } = form
	const setFormField = (field, value) => dispatchForm({ type: "set", field, value })

	// Coins selector (same-named setters keep call sites unchanged)
	const [coin, dispatchCoin] = useReducer(setFieldReducer, { availableCoins: [], selectedCoin: null, showCoinPicker: false })
	const { availableCoins, selectedCoin, showCoinPicker } = coin
	const setAvailableCoins = (value) => dispatchCoin({ type: "set", field: "availableCoins", value })
	const setSelectedCoin = (value) => dispatchCoin({ type: "set", field: "selectedCoin", value })
	const setShowCoinPicker = (value) => dispatchCoin({ type: "set", field: "showCoinPicker", value })

	// Saved payment methods picker
	const [saved, dispatchSaved] = useReducer(setFieldReducer, { showSavedMethods: false, savedMethods: [], savedMethodsLoading: false })
	const { showSavedMethods, savedMethods, savedMethodsLoading } = saved
	const setShowSavedMethods = (value) => dispatchSaved({ type: "set", field: "showSavedMethods", value })
	const setSavedMethods = (value) => dispatchSaved({ type: "set", field: "savedMethods", value })
	const setSavedMethodsLoading = (value) => dispatchSaved({ type: "set", field: "savedMethodsLoading", value })

	const [isLoading, setIsLoading] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [workingForm, setWorkingForm] = useState({})
	const [p2pEnabled] = useState(user.p2p_enabled)

	// Button label derived from type + amount
	const buttonText = type === "buy" ? `Comprar ${amount > 0 ? "$" + amount : ""}` : `Vender ${amount > 0 ? "$" + amount : ""}`

	// Fetch available coins (enabled_p2p like Withdraw)
	useEffect(() => {
		const fetchCoins = async () => {
			try {
				setIsLoading(true)
				const response = await coinsApi.index({ enabled_p2p: true })
				setAvailableCoins(response.data)
			} catch (err) {
				// error fetching coins
			} finally { setIsLoading(false) }
		}
		fetchCoins()
	}, [])

	// Handle coin selection
	const handleCoinSelect = (selected) => {
		setSelectedCoin(selected)
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

	// Handle publish
	const handlePublish = async () => {

		if (type !== "buy" && type !== "sell") {
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

		} catch (err) {
			toast.error("Error al crear la oferta", { description: err.message })
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
		return <P2PRequirementsGate user={user} navigation={navigation} theme={theme} textStyles={textStyles} containerStyles={containerStyles} />
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
						style={{ backgroundColor: type === "buy" ? theme.colors.success : theme.colors.danger }}
						textStyle={{ color: type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite }}
						iconColor={type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite}
						loadingColor={type === "buy" ? theme.colors.almostBlack : theme.colors.almostWhite}
					/>
				}
			>
				<P2PCreateForm
					form={form}
					onField={setFormField}
					selectedCoin={selectedCoin}
					workingFields={workingFields}
					workingForm={workingForm}
					onChangeWorkingField={(key, value) => setWorkingForm((prev) => ({ ...prev, [key]: value }))}
					onOpenCoinPicker={() => setShowCoinPicker(true)}
					onLaunchSavedMethods={lauchSavedPaymentMethods}
					user={user}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
				/>
			</QPKeyboardView>

			{/* Coin Picker Modal */}
			<QPCoinPicker
				visible={showCoinPicker}
				onClose={() => setShowCoinPicker(false)}
				onSelect={handleCoinSelect}
				coins={availableCoins}
				selectedCoin={selectedCoin}
				isLoading={isLoading}
				showFees={false}
				recentKey="qp_recent_p2p_create_coins"
				defaultCoins={[
					{ tick: 'BANK_CUP', label: 'CUP' },
					{ tick: 'BANK_MLC', label: 'MLC' },
					{ tick: 'CLASICA', label: 'Clásica' },
				]}
			/>

			{/* Saved Payment Methods Modal */}
			<SavedMethodsModal
				visible={showSavedMethods}
				onClose={() => setShowSavedMethods(false)}
				loading={savedMethodsLoading}
				methods={savedMethods}
				onSelect={handleSelectSavedMethod}
				theme={theme}
				textStyles={textStyles}
			/>
		</>
	)
}

export default P2PCreate
