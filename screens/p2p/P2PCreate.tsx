import { useState, useEffect, useMemo, useReducer, useRef } from "react"
import { useTranslation } from "react-i18next"

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
import useCoins from "../../hooks/useCoins"
import p2pApi from "../../api/p2pApi"
import { userApi } from "../../api/userApi"

// Idempotencia: clave estable por intento — un reintento tras timeout no duplica la oferta
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, safeRetryHint } from "../../helpers/idempotency"

// User context
import { useAuth } from "../../auth/AuthContext"

// Routes
import { ROUTES } from "../../routes"

import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../../types/navigation"
import type { Coin, CoinWorkingField, P2POffer } from "../../types/domain"
import type { SavedPaymentMethod, SavedMethodDetail } from "./SavedMethodsModal"

/** Estado del formulario de creación (montos como string: son inputs). */
export type P2PCreateFormState = {
	type: "buy" | "sell"
	amount: string
	receive: string
	message: string
	advancedOpen: boolean
	onlyVIP: boolean
	privateOffer: boolean
}

/** Setter por campo del formulario, atado al tipo de cada uno. */
export type SetP2PCreateField = <K extends keyof P2PCreateFormState>(field: K, value: P2PCreateFormState[K]) => void

/** Slice del selector de moneda. */
type CoinState = { availableCoins: Coin[], selectedCoin: Coin | null, showCoinPicker: boolean }

/** Slice del picker de métodos guardados. */
type SavedState = { showSavedMethods: boolean, savedMethods: SavedPaymentMethod[], savedMethodsLoading: boolean }

/** Acción genérica del reducer de campo, atada a las claves del slice que gobierna. */
type SetFieldAction<S> = { [K in keyof S]: { type: "set", field: K, value: S[K] } }[keyof S]

const keyFromFieldName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
const normalizeNumber = (val: string) => val.replace(",", ".")

// Generic field setter for the related-state slices below
function setFieldReducer<S extends object>(state: S, action: SetFieldAction<S>): S {
	switch (action.type) {
		case "set":
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}

/**
 * Form to publish a new P2P buy/sell offer (`POST /p2p/create`).
 * Coins come from `useCoins('p2p')` (caché compartida); the selected coin's
 * `working_data` JSON drives the dynamic payment-details fields (same pattern as
 * Withdraw), which can be pre-filled from saved payment methods
 * (`GET /user/payment-methods`). Gated by `user.p2p_enabled` (P2PRequirementsGate);
 * on 201 it navigates straight to the created offer (P2POffer).
 */
const P2PCreate = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'P2PCreate'>) => {

	// Idioma activo
	const { t } = useTranslation()

	// User context
	const { user } = useAuth()

	// Theme
	const { theme } = useTheme()
	const { coins: coinCatalog, isLoading: loadingCoins } = useCoins('p2p')
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Offer form
	const [form, dispatchForm] = useReducer(setFieldReducer<P2PCreateFormState>, { type: "buy", amount: "", receive: "", message: "", advancedOpen: false, onlyVIP: false, privateOffer: false } as P2PCreateFormState)
	const { type, amount, receive, message, onlyVIP, privateOffer } = form
	const setFormField: SetP2PCreateField = (field, value) => dispatchForm({ type: "set", field, value } as SetFieldAction<P2PCreateFormState>)

	// Coins selector (same-named setters keep call sites unchanged)
	const [coin, dispatchCoin] = useReducer(setFieldReducer<CoinState>, { availableCoins: [], selectedCoin: null, showCoinPicker: false } as CoinState)
	const { availableCoins, selectedCoin, showCoinPicker } = coin
	const setAvailableCoins = (value: Coin[]) => dispatchCoin({ type: "set", field: "availableCoins", value })
	const setSelectedCoin = (value: Coin | null) => dispatchCoin({ type: "set", field: "selectedCoin", value })
	const setShowCoinPicker = (value: boolean) => dispatchCoin({ type: "set", field: "showCoinPicker", value })

	// Saved payment methods picker
	const [saved, dispatchSaved] = useReducer(setFieldReducer<SavedState>, { showSavedMethods: false, savedMethods: [], savedMethodsLoading: false } as SavedState)
	const { showSavedMethods, savedMethods, savedMethodsLoading } = saved
	const setShowSavedMethods = (value: boolean) => dispatchSaved({ type: "set", field: "showSavedMethods", value })
	const setSavedMethods = (value: SavedPaymentMethod[]) => dispatchSaved({ type: "set", field: "savedMethods", value })
	const setSavedMethodsLoading = (value: boolean) => dispatchSaved({ type: "set", field: "savedMethodsLoading", value })

	const [isSending, setIsSending] = useState(false)
	const [workingForm, setWorkingForm] = useState<Record<string, string>>({})
	// El `!` es solo de tipos: la pantalla vive tras el gate de sesión iniciada
	const [p2pEnabled] = useState(user!.p2p_enabled)

	// Clave de idempotencia del intento: sobrevive a timeouts, 5xx y toques
	// repetidos — solo rota tras éxito confirmado (evita ofertas dobles y el
	// doble débito de las ofertas sell)
	const idempotencyKeyRef = useRef(makeIdempotencyKey())

	// Button label derived from type + amount
	// `amount` es el string del input y se compara con 0 por coerción (JS lo hace
	// numérico): los casts preservan esa comparación tal cual, sin envolver en Number()
	const buttonText = type === "buy"
		? t('p2p.create.buyButton', { amount: (amount as unknown as number) > 0 ? "$" + amount : "" })
		: t('p2p.create.sellButton', { amount: (amount as unknown as number) > 0 ? "$" + amount : "" })

	// Catálogo desde la caché compartida (useCoins): sin espera al abrir
	useEffect(() => {
		if (coinCatalog.length) setAvailableCoins(coinCatalog)
	}, [coinCatalog])

	// Handle coin selection
	const handleCoinSelect = (selected: Coin) => {
		setSelectedCoin(selected)
		setShowCoinPicker(false)
		setWorkingForm({})
	}

	// Working data parsing (same logic as Withdraw)
	const workingFields = useMemo<CoinWorkingField[]>(() => {
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
			toast.error(t('p2p.create.toasts.incompleteTitle'), { description: t('p2p.create.toasts.selectOption') })
			return
		}

		if (!selectedCoin) {
			toast.error(t('p2p.create.toasts.incompleteTitle'), { description: t('p2p.create.toasts.selectCoin') })
			return
		}

		// Basic validation
		if (!amount || !receive) {
			toast.error(t('p2p.create.toasts.incompleteTitle'), { description: t('p2p.create.toasts.completeAmounts') })
			return
		}
		const amt = parseFloat(normalizeNumber(amount))
		const rcv = parseFloat(normalizeNumber(receive))
		if (isNaN(amt) || isNaN(rcv) || amt <= 0 || rcv <= 0) {
			toast.error(t('p2p.create.toasts.invalidAmountsTitle'), { description: t('p2p.create.toasts.invalidAmountsBody') })
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
				toast.error(t('p2p.create.toasts.missingDataTitle'), { description: t('p2p.create.toasts.missingDataBody') })
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
				idempotency_key: idempotencyKeyRef.current,
			}
			// Ante el 409 "en proceso" se espera y reintenta una vez con la MISMA clave
			const res = await callWithDuplicateRetry(() => p2pApi.create(payload))

			if (res.success) {
				idempotencyKeyRef.current = makeIdempotencyKey()
				toast.success(t('p2p.create.toasts.successTitle'), {
					description: res.data?.duplicate
						? t('p2p.create.toasts.createdDuplicate')
						: t('p2p.create.toasts.created'),
				})
				// OJO: el backend envuelve la oferta creada en `{ p2p }`, pero p2pApi.create
				// la tipa como la oferta PELADA — cast local, sin tocar el tipo compartido
				navigation.navigate(ROUTES.P2P_OFFER_SCREEN, { p2p_uuid: (res.data as unknown as { p2p: P2POffer }).p2p.uuid })
			} else if (isNetworkFailure(res)) {
				toast.error(t('p2p.create.toasts.networkError'), { description: `${res.error || t('errors.network')}. ${safeRetryHint()}` })
			} else {
				const errMsg = res?.error || t('p2p.create.toasts.createFailedFallback')
				toast.error(t('p2p.create.toasts.createErrorTitle'), { description: errMsg })
			}

		} catch (err) {
			toast.error(t('p2p.create.toasts.createErrorTitle'), { description: (err as Error).message })
		} finally { setIsSending(false) }
	}

	// Handle launch saved payment methods
	const lauchSavedPaymentMethods = () => {
		if (!selectedCoin) {
			toast.error(t('p2p.create.toasts.selectCoinFirst'))
			return
		}
		setSavedMethodsLoading(true)
		userApi.getPaymentMethods()
			.then((res) => {
				if (res.success) {
					// userApi.getPaymentMethods tipa `data` genérico: el array llega pelado
					// o envuelto en `{ methods }` según la versión del backend
					const raw: SavedPaymentMethod[] = Array.isArray(res.data) ? res.data as SavedPaymentMethod[] : ((res.data as { methods?: SavedPaymentMethod[] } | undefined)?.methods || [])
					const filtered = raw.filter((m) => {
						const tick = (m?.coin as { tick?: string } | undefined)?.tick || m?.tick || m?.coin || m?.ticker
						return String(tick || "").toLowerCase() === String(selectedCoin?.tick || "").toLowerCase()
					})
					setSavedMethods(filtered)
					setShowSavedMethods(true)
				} else { toast.error(res.error || t('p2p.create.toasts.methodsLoadFailed')) }
			})
			.catch((e: Error) => { toast.error(e.message || t('p2p.create.toasts.networkError')) })
			.finally(() => setSavedMethodsLoading(false))
	}

	// Apply saved method into working form
	const handleSelectSavedMethod = (method: SavedPaymentMethod) => {
		try {
			const rawDetails = (method && (method.details || method.Details)) || null
			let detailsArray: SavedMethodDetail[] = []
			if (Array.isArray(rawDetails)) {
				detailsArray = rawDetails.map((d) => ({ name: d.name || d.key, value: String(d.value ?? d.val ?? "") }))
			} else if (rawDetails && typeof rawDetails === "object") { detailsArray = Object.entries(rawDetails).map(([k, v]) => ({ name: k, value: String(v ?? "") })) }
			const nextForm: Record<string, string> = {}
			workingFields.forEach((field) => {
				const key = keyFromFieldName(field.name)
				const found = detailsArray.find((d) => String(d.name).toLowerCase() === String(field.name).toLowerCase())
				nextForm[key] = found ? found.value! : ""
			})
			setWorkingForm(nextForm)
			setShowSavedMethods(false)
		} catch (e) { toast.error((e as Error).message || t('p2p.create.toasts.methodApplyFailed')) }
	}

	if (!p2pEnabled) {
		return <P2PRequirementsGate user={user!} navigation={navigation} theme={theme} textStyles={textStyles} containerStyles={containerStyles} />
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
						style={{ backgroundColor: type === "buy" ? theme.colors.successFill : theme.colors.danger }}
						textStyle={{ color: type === "buy" ? theme.colors.successFillText : theme.colors.almostWhite }}
						iconColor={type === "buy" ? theme.colors.successFillText : theme.colors.almostWhite}
						loadingColor={type === "buy" ? theme.colors.successFillText : theme.colors.almostWhite}
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
					user={user!}
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
				isLoading={loadingCoins}
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
