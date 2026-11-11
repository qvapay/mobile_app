import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Linking } from 'react-native'
import type WebView from 'react-native-webview'
import type { WebViewMessageEvent } from 'react-native-webview'
import ReactNativeHapticFeedback, { type HapticFeedbackTypes } from 'react-native-haptic-feedback'
import { toast } from 'sonner-native'

import { miniappsApi } from '../../api/miniappsApi'
import {
	EMPTY_COLORS,
	EMPTY_HEADER,
	MODAL_METHODS,
	applyColorsPatch,
	applyHeaderPatch,
	applyMainButtonPatch,
	bridgeErrorResponse,
	bridgeEvent,
	bridgeResponse,
	isAllowedOrigin,
	isMainButtonShown,
	parseBridgeMessage,
	type BridgeError,
	type BridgeEvent,
	type BridgeRequest,
	type HapticType,
	type HeaderState,
	type MainButtonState,
	type MiniAppScope,
	type UiColorsState,
} from '../../miniapps/protocol'
import { buildDeliveryScript } from '../../miniapps/sdkScript'
import { authorizeFailureError, bridgeErrors } from './bridgeErrors'
import { canPayInMiniApp, canShareMiniApp } from './miniappTesting'
import i18n from '../../i18n'
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
	/**
	 * Hoja nativa de compartir con el enlace público de la mini-app abierta
	 * (la pantalla la implementa con `shareMiniApp`; el hook no toca `Share` y
	 * sigue siendo testeable en node). `dismissed` solo lo distingue iOS.
	 */
	share: (text?: string) => Promise<'shared' | 'dismissed'>
}

/**
 * Despachador del bridge de una mini-app. Valida cada mensaje con
 * `miniapps/protocol` (lista blanca + params), comprueba que viene del marco
 * principal y de un origen permitido, y lo resuelve: los métodos de UI al
 * momento, los de identidad y pago abriendo una hoja nativa (`modal`) que la
 * pantalla pinta y cierra con `resolveModal` / `rejectModal`.
 *
 * Solo una hoja a la vez: un segundo `requestLogin`/`payInvoice` mientras hay
 * otro en curso se rechaza con `BUSY` (una mini-app no puede apilar cobros), y
 * lo mismo con la hoja de compartir en pantalla, en los dos sentidos.
 */
export function useMiniAppBridge({ app, webViewRef, theme, onReady, onClose, requireKyc, share }: Options) {

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
	// Subtítulo y acciones del encabezado nativo (nombre y logo salen del registro)
	const [header, setHeader] = useState<HeaderState>(EMPTY_HEADER)
	// Colores del host que tiñe la mini-app (barra + status bar, fondo); null = tema
	const [colors, setColors] = useState<UiColorsState>(EMPTY_COLORS)

	// Refs espejo: el dispatcher es estable y lee siempre lo último
	const appRef = useRef(app)
	const themeRef = useRef(theme)
	const callbacksRef = useRef({ onReady, onClose, requireKyc, share })
	useEffect(() => { appRef.current = app }, [app])
	useEffect(() => { themeRef.current = theme }, [theme])
	useEffect(() => { callbacksRef.current = { onReady, onClose, requireKyc, share } }, [onReady, onClose, requireKyc, share])
	// Hoja de compartir en vuelo: no es modal del bridge (no pide PIN ni KYC)
	// pero tampoco se apila
	const shareBusyRef = useRef(false)

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
	const rejectModal = useCallback((error: BridgeError = bridgeErrors.userCancelled()) => {
		const current = modalRef.current
		if (current) reject(current.id, error)
		openModal(null)
	}, [reject, openModal])

	const requestLogin = useCallback(async (id: string, scopes: MiniAppScope[]) => {
		const current = appRef.current!
		if (!isSubset(scopes, current.scopes)) {
			reject(id, bridgeErrors.scopeNotAllowed())
			busyRef.current = false
			return
		}
		// Consentimiento ya dado para estos scopes: firma directa, sin hoja
		if (current.granted && isSubset(scopes, current.granted_scopes)) {
			const result = await miniappsApi.authorize(current.slug, scopes)
			busyRef.current = false
			if (result.success && result.data) { respond(id, result.data) }
			else { reject(id, result.success ? bridgeErrors.authorizeFailed() : authorizeFailureError(result.status)) }
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
				// Parcial: solo cambia lo que la mini-app mandó (updater puro, seguro en StrictMode)
				setMainButton(prev => applyMainButtonPatch(prev, request.params))
				respond(request.id)
				return
			case 'ui.backButton.set':
				setBackButtonVisible(request.params.visible)
				respond(request.id)
				return
			case 'ui.header.set':
				setHeader(prev => applyHeaderPatch(prev, request.params))
				respond(request.id)
				return
			case 'ui.colors.set':
				setColors(prev => applyColorsPatch(prev, request.params))
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
			case 'share': {
				// Sin publicar no hay página pública: el enlace sería «no encontrada» para el resto
				if (!canShareMiniApp(appRef.current)) {
					reject(request.id, bridgeErrors.previewNoShare())
					return
				}
				// `busyRef` y no `modalRef`: cubre también el login que firma sin hoja
				if (shareBusyRef.current || busyRef.current) {
					reject(request.id, bridgeErrors.busy())
					return
				}
				shareBusyRef.current = true
				callbacksRef.current.share(request.params.text)
					.then(outcome => {
						if (outcome === 'dismissed') reject(request.id, bridgeErrors.userCancelled())
						else respond(request.id)
					})
					.catch(() => reject(request.id, bridgeErrors.shareFailed()))
					.finally(() => { shareBusyRef.current = false })
				return
			}
		}
	}, [respond, reject, requestLogin, openModal])

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
			reject(request.id, bridgeErrors.originNotAllowed())
			return
		}

		if (MODAL_METHODS.has(request.method)) {
			// Identidad y pago exigen KYC en el backend (403 KYC_REQUIRED): se corta ANTES
			// de abrir la hoja o firmar, para no pedir consentimiento ni PIN para nada.
			// Código existente del contrato del SDK (NOT_ALLOWED): uno nuevo rompería
			// mini-apps publicadas. La app ya le enseña al usuario su KycGateModal
			// Ocupado va ANTES que el KYC: con la hoja de compartir en pantalla, ni la hoja
			// de pago ni la del KYC pueden presentarse (iOS no apila presentaciones: la
			// hoja no saldría y `busyRef` se quedaría en true hasta recargar)
			if (busyRef.current || shareBusyRef.current) {
				reject(request.id, bridgeErrors.busy())
				return
			}
			// En prueba (sin publicar) no se cobra: QvaPay no la ha revisado y qpweb responde
			// 403 PREVIEW_NO_PAYMENTS. Se corta antes del KYC: no tiene sentido pedir que se
			// verifique para algo que no va a pasar. `NOT_ALLOWED` por la misma razón que el KYC
			if (request.method === 'payments.payInvoice' && !canPayInMiniApp(current)) {
				toast(i18n.t('miniapps.testing.payBlockedTitle'), { description: i18n.t('miniapps.testing.payBlockedBody') })
				reject(request.id, bridgeErrors.previewNoPayments())
				return
			}
			if (!callbacksRef.current.requireKyc()) {
				reject(request.id, bridgeErrors.kycRequired())
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
		setHeader(EMPTY_HEADER)
		setColors(EMPTY_COLORS)
	}, [])

	// Lo que la pantalla pinta: `visible` ya cuenta con la regla "sin texto no hay botón"
	// (el estado guarda lo que pidió la mini-app, para que `set({ text })` tras
	// `set({ visible: true })` lo muestre)
	const shownMainButton = useMemo(() => ({ ...mainButton, visible: isMainButtonShown(mainButton) }), [mainButton])

	return { onMessage, emit, modal, resolveModal, rejectModal, mainButton: shownMainButton, backButtonVisible, header, colors, resetUi }
}
