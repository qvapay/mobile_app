import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Linking } from 'react-native'
import type WebView from 'react-native-webview'
import type { WebViewMessageEvent } from 'react-native-webview'
import ReactNativeHapticFeedback, { type HapticFeedbackTypes } from 'react-native-haptic-feedback'
import { toast } from 'sonner-native'

import { miniappsApi } from '../../api/miniappsApi'
import {
	BRIDGE_ERRORS,
	MODAL_METHODS,
	bridgeErrorResponse,
	bridgeEvent,
	bridgeResponse,
	isAllowedOrigin,
	parseBridgeMessage,
	type BridgeError,
	type BridgeEvent,
	type BridgeRequest,
	type HapticType,
	type MainButtonState,
	type MiniAppScope,
} from '../../miniapps/protocol'
import { buildDeliveryScript } from '../../miniapps/sdkScript'
import type { MiniApp } from '../../types/domain'

/** Tema que ve la mini-app: solo lo necesario para pintar a juego. */
export type MiniAppThemePayload = {
	mode: 'light' | 'dark'
	colors: { bg: string, surface: string, text: string, primary: string }
}

/** Hoja nativa pendiente de que el usuario decida. */
export type MiniAppModalRequest =
	| { kind: 'consent', id: string, scopes: MiniAppScope[] }
	| { kind: 'pay', id: string, invoiceUuid: string }

const HAPTICS: Record<HapticType, HapticFeedbackTypes> = {
	light: 'impactLight' as HapticFeedbackTypes,
	medium: 'impactMedium' as HapticFeedbackTypes,
	heavy: 'impactHeavy' as HapticFeedbackTypes,
	success: 'notificationSuccess' as HapticFeedbackTypes,
	warning: 'notificationWarning' as HapticFeedbackTypes,
	error: 'notificationError' as HapticFeedbackTypes,
}

const HIDDEN_MAIN_BUTTON: MainButtonState = { text: '', visible: false, loading: false, enabled: true }

const isSubset = (wanted: readonly string[], allowed: readonly string[]) => wanted.every(s => allowed.includes(s))

type Options = {
	app: MiniApp | undefined
	webViewRef: RefObject<WebView<object> | null>
	theme: MiniAppThemePayload
	onReady: () => void
	onClose: () => void
	/**
	 * Gate KYC (UX preventiva, el backend sigue siendo la autoridad): qpweb exige
	 * identidad verificada para autorizar y pagar. Devuelve false —y la pantalla
	 * enseña su KycGateModal— si el usuario no está verificado.
	 */
	requireKyc: () => boolean
}

/**
 * Despachador del bridge de una mini-app. Valida cada mensaje con
 * `miniapps/protocol` (lista blanca + params), comprueba que viene del marco
 * principal y de un origen permitido, y lo resuelve: los métodos de UI al
 * momento, los de identidad y pago abriendo una hoja nativa (`modal`) que la
 * pantalla pinta y cierra con `resolveModal` / `rejectModal`.
 *
 * Solo una hoja a la vez: un segundo `requestLogin`/`payInvoice` mientras hay
 * otro en curso se rechaza con `BUSY` (una mini-app no puede apilar cobros).
 */
export function useMiniAppBridge({ app, webViewRef, theme, onReady, onClose, requireKyc }: Options) {

	// La operación modal en vuelo (incluye el authorize directo, que no pinta hoja)
	const busyRef = useRef(false)
	const [modal, setModal] = useState<MiniAppModalRequest | null>(null)
	// Espejo síncrono de `modal`: resolver dentro de un updater de setState
	// respondería dos veces en StrictMode
	const modalRef = useRef<MiniAppModalRequest | null>(null)
	const openModal = useCallback((next: MiniAppModalRequest | null) => {
		modalRef.current = next
		setModal(next)
		// Cerrar la hoja libera el bridge para la siguiente operación modal
		if (!next) busyRef.current = false
	}, [])
	const [mainButton, setMainButton] = useState<MainButtonState>(HIDDEN_MAIN_BUTTON)
	const [backButtonVisible, setBackButtonVisible] = useState(false)

	// Refs espejo: el dispatcher es estable y lee siempre lo último
	const appRef = useRef(app)
	const themeRef = useRef(theme)
	const callbacksRef = useRef({ onReady, onClose, requireKyc })
	useEffect(() => { appRef.current = app }, [app])
	useEffect(() => { themeRef.current = theme }, [theme])
	useEffect(() => { callbacksRef.current = { onReady, onClose, requireKyc } }, [onReady, onClose, requireKyc])

	const deliver = useCallback((payload: string) => {
		webViewRef.current?.injectJavaScript(buildDeliveryScript(payload))
	}, [webViewRef])

	const respond = useCallback((id: string, result: unknown = null) => deliver(bridgeResponse(id, result)), [deliver])
	const reject = useCallback((id: string, error: BridgeError) => deliver(bridgeErrorResponse(id, error)), [deliver])
	const emit = useCallback((event: BridgeEvent, data: unknown = null) => deliver(bridgeEvent(event, data)), [deliver])

	// Cambio de tema en vivo → evento
	const isFirstTheme = useRef(true)
	useEffect(() => {
		if (isFirstTheme.current) { isFirstTheme.current = false; return }
		emit('themeChanged', theme)
	}, [theme, emit])

	/** Cierra la hoja en curso entregando el resultado a la mini-app. */
	const resolveModal = useCallback((result: unknown) => {
		const current = modalRef.current
		if (current) respond(current.id, result)
		openModal(null)
	}, [respond, openModal])

	/** Cierra la hoja en curso con un error (por defecto, el usuario canceló). */
	const rejectModal = useCallback((error: BridgeError = { code: BRIDGE_ERRORS.USER_CANCELLED, message: 'User cancelled' }) => {
		const current = modalRef.current
		if (current) reject(current.id, error)
		openModal(null)
	}, [reject, openModal])

	const requestLogin = useCallback(async (id: string, scopes: MiniAppScope[]) => {
		const current = appRef.current!
		if (!isSubset(scopes, current.scopes)) {
			reject(id, { code: BRIDGE_ERRORS.NOT_ALLOWED, message: 'Scope not approved for this mini-app' })
			busyRef.current = false
			return
		}
		// Consentimiento ya dado para estos scopes: firma directa, sin hoja
		if (current.granted && isSubset(scopes, current.granted_scopes)) {
			const result = await miniappsApi.authorize(current.slug, scopes)
			busyRef.current = false
			if (result.success && result.data) { respond(id, result.data) }
			else { reject(id, { code: result.status == null ? BRIDGE_ERRORS.NETWORK : BRIDGE_ERRORS.FAILED, message: 'Authorization failed' }) }
			return
		}
		openModal({ kind: 'consent', id, scopes })
	}, [reject, respond, openModal])

	const dispatch = useCallback((request: BridgeRequest) => {
		switch (request.method) {
			case 'ready':
				callbacksRef.current.onReady()
				respond(request.id)
				return
			case 'close':
				respond(request.id)
				callbacksRef.current.onClose()
				return
			case 'getTheme':
				respond(request.id, themeRef.current)
				return
			case 'auth.requestLogin':
				requestLogin(request.id, request.params.scopes)
				return
			case 'payments.payInvoice':
				openModal({ kind: 'pay', id: request.id, invoiceUuid: request.params.invoiceUuid })
				return
			case 'ui.mainButton.set':
				setMainButton(request.params)
				respond(request.id)
				return
			case 'ui.backButton.set':
				setBackButtonVisible(request.params.visible)
				respond(request.id)
				return
			case 'ui.haptic':
				ReactNativeHapticFeedback.trigger(HAPTICS[request.params.type], { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
				respond(request.id)
				return
			case 'ui.toast': {
				// Con el nombre de la mini-app como título: el usuario debe saber quién habla
				const title = appRef.current?.name ?? 'Mini-app'
				const show = request.params.type === 'success' ? toast.success : request.params.type === 'error' ? toast.error : toast
				show(title, { description: request.params.message })
				respond(request.id)
				return
			}
			case 'openLink':
				Linking.openURL(request.params.url).catch(() => {})
				respond(request.id)
				return
		}
	}, [respond, requestLogin, openModal])

	const onMessage = useCallback((event: WebViewMessageEvent) => {
		const current = appRef.current
		// En iOS solo el marco principal tiene `ReactNativeWebView`; en Android un
		// iframe también podría postear, y `url` es la del marco principal. Por eso
		// nada del bridge confía en el emisor: el cobro siempre pasa por la hoja
		// nativa con PIN y la factura debe ser del comercio de la mini-app
		const { data, url } = event.nativeEvent
		if (!current) return

		const parsed = parseBridgeMessage(data)
		if (!parsed.ok) {
			if (parsed.id) reject(parsed.id, parsed.error)
			return
		}
		const { request } = parsed

		if (!isAllowedOrigin(url, current.allowed_origins)) {
			reject(request.id, { code: BRIDGE_ERRORS.NOT_ALLOWED, message: 'Origin not allowed' })
			return
		}

		if (MODAL_METHODS.has(request.method)) {
			// Identidad y pago exigen KYC en el backend (403 KYC_REQUIRED): se corta ANTES
			// de abrir la hoja o firmar, para no pedir consentimiento ni PIN para nada.
			// Código existente del contrato del SDK (NOT_ALLOWED): uno nuevo exigiría
			// tocar la documentación pública de qpweb
			if (!callbacksRef.current.requireKyc()) {
				reject(request.id, { code: BRIDGE_ERRORS.NOT_ALLOWED, message: 'Identity verification (KYC) required' })
				return
			}
			if (busyRef.current) {
				reject(request.id, { code: BRIDGE_ERRORS.BUSY, message: 'Another request is in progress' })
				return
			}
			busyRef.current = true
		}

		dispatch(request)
	}, [dispatch, reject])

	/** Al recargar o salir del origen, la UI que puso la mini-app deja de valer. */
	const resetUi = useCallback(() => {
		setMainButton(HIDDEN_MAIN_BUTTON)
		setBackButtonVisible(false)
	}, [])

	return { onMessage, emit, modal, resolveModal, rejectModal, mainButton, backButtonVisible, resetUi }
}
