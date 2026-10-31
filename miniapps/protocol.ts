/**
 * Protocolo del bridge de mini-apps (PURO: cero react-native, se testea con
 * `@jest-environment node`).
 *
 * Una mini-app es una web de terceros que corre en un WebView de QvaPay y habla
 * con la app por `postMessage`. Todo lo que cruza esa frontera es dato NO
 * confiable: este módulo decide qué mensajes se aceptan (lista blanca de
 * métodos versionada + validación de params) y desde qué orígenes.
 *
 * Mensaje entrante:  `{ v: 1, id: string, method: string, params?: object }`
 * Respuesta saliente: `{ id, ok: true, result }` | `{ id, ok: false, error: { code, message } }`
 * Evento saliente:    `{ event: string, data }`
 *
 * Los rechazos de ESTE módulo (mensaje malformado, `INVALID_PARAMS`,
 * `UNKNOWN_METHOD`) son errores de integración: su `message` es técnico y en
 * inglés, para la consola del desarrollador. Los de tiempo de ejecución salen
 * de `screens/miniapps/bridgeErrors.ts`, en el idioma del usuario.
 */

export const PROTOCOL_VERSION = 1

/** Códigos de error estables del contrato público del SDK (los ve el desarrollador). */
export const BRIDGE_ERRORS = {
	USER_CANCELLED: 'USER_CANCELLED',
	NOT_ALLOWED: 'NOT_ALLOWED',
	INVALID_PARAMS: 'INVALID_PARAMS',
	BUSY: 'BUSY',
	NETWORK: 'NETWORK',
	FAILED: 'FAILED',
	INVOICE_APP_MISMATCH: 'INVOICE_APP_MISMATCH',
	UNKNOWN_METHOD: 'UNKNOWN_METHOD',
} as const

export type BridgeErrorCode = (typeof BRIDGE_ERRORS)[keyof typeof BRIDGE_ERRORS]

/** Scopes de identidad que una mini-app puede pedir (espejo de qpweb). */
export const MINIAPP_SCOPES = ['profile', 'kyc'] as const
export type MiniAppScope = (typeof MINIAPP_SCOPES)[number]

export const HAPTIC_TYPES = ['light', 'medium', 'heavy', 'success', 'warning', 'error'] as const
export type HapticType = (typeof HAPTIC_TYPES)[number]

export const TOAST_TYPES = ['info', 'success', 'error'] as const
export type ToastType = (typeof TOAST_TYPES)[number]

/** Eventos que la app empuja a la mini-app. */
export const BRIDGE_EVENTS = ['themeChanged', 'backButton', 'mainButton', 'headerAction'] as const
export type BridgeEvent = (typeof BRIDGE_EVENTS)[number]

/** Tope del texto de un toast: la mini-app no debe poder tapar la pantalla con prosa. */
export const TOAST_MAX_LENGTH = 120
/** Tope del texto del botón principal nativo. */
export const MAIN_BUTTON_MAX_LENGTH = 32
/** Tope de un mensaje crudo (bytes de string): nada legítimo del SDK se acerca. */
export const MAX_MESSAGE_LENGTH = 16_384
/**
 * Catálogo CERRADO de iconos para las acciones del encabezado: se pintan como
 * iconos nativos de la app (FontAwesome 6) y del simulador de qpweb (Lineicons),
 * así que todo nombre nuevo exige su glifo en los DOS sitios
 * (`screens/miniapps/headerIcons.ts` y `HEADER_ICONS` de Simulator.js).
 */
export const HEADER_ICONS = [
	'cart', 'search', 'filter', 'sort', 'share', 'heart', 'star', 'bookmark', 'bell', 'user', 'settings',
	'help', 'plus', 'edit', 'chat', 'calendar', 'wallet', 'ticket', 'home', 'location', 'refresh',
] as const
export type HeaderIcon = (typeof HEADER_ICONS)[number]
/** Subtítulo bajo el nombre registrado de la mini-app (el nombre y el logo NO se pueden cambiar). */
export const HEADER_SUBTITLE_MAX_LENGTH = 48
/** Acciones a la derecha, delante del menú ⋯ de QvaPay (que siempre está). */
export const HEADER_MAX_ACTIONS = 2
const HEADER_ACTION_LABEL_MAX_LENGTH = 40
/** Por encima de esto el badge enseña «99+». */
export const HEADER_BADGE_MAX = 99
const ACTION_ID_RE = /^[A-Za-z0-9_-]{1,32}$/
// Controles (saltos de línea, tabuladores, NUL…) fuera de un texto de una línea
const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g

/** Tope del texto que una mini-app añade al compartir su enlace. */
export const SHARE_TEXT_MAX_LENGTH = 200
// El texto de `share` NO puede llevar enlaces: la URL la pone siempre la app
// (el mensaje sale con la marca QvaPay; un enlace ajeno ahí sería phishing)
const LOOKS_LIKE_LINK = /https?:\/\/|www\./i

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Peticiones válidas, ya tipadas, por método. */
export type BridgeRequest =
	| { id: string, method: 'ready' }
	| { id: string, method: 'close' }
	| { id: string, method: 'getTheme' }
	| { id: string, method: 'auth.requestLogin', params: { scopes: MiniAppScope[] } }
	| { id: string, method: 'payments.payInvoice', params: { invoiceUuid: string } }
	| { id: string, method: 'ui.mainButton.set', params: MainButtonPatch }
	| { id: string, method: 'ui.backButton.set', params: { visible: boolean } }
	| { id: string, method: 'ui.header.set', params: HeaderPatch }
	| { id: string, method: 'ui.haptic', params: { type: HapticType } }
	| { id: string, method: 'ui.toast', params: { message: string, type: ToastType } }
	| { id: string, method: 'openLink', params: { url: string } }
	| { id: string, method: 'share', params: { text?: string } }

export type BridgeMethod = BridgeRequest['method']

export type MainButtonState = { text: string, visible: boolean, loading: boolean, enabled: boolean }
/** `ui.mainButton.set` es una actualización PARCIAL: solo cambia lo que la mini-app manda. */
export type MainButtonPatch = Partial<MainButtonState>

/** Botón de la derecha del encabezado; `badge` 0 = sin badge. */
export type HeaderAction = { id: string, icon: HeaderIcon, label: string, badge: number }
/** Lo que la mini-app controla del encabezado nativo (nombre y logo salen del registro). */
export type HeaderState = { subtitle: string, actions: HeaderAction[] }
/** `ui.header.set` también es PARCIAL, como el botón principal. */
export type HeaderPatch = Partial<HeaderState>

export type BridgeError = { code: BridgeErrorCode, message: string }

export type ParseResult =
	| { ok: true, request: BridgeRequest }
	/** `id` viaja si se pudo leer, para que la mini-app reciba el rechazo en su promesa. */
	| { ok: false, id: string | null, error: BridgeError }

const isObj = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const fail = (id: string | null, code: BridgeErrorCode, message: string): ParseResult =>
	({ ok: false, id, error: { code, message } })

const isHttpsUrl = (raw: unknown): raw is string => {
	if (typeof raw !== 'string' || raw.length > 2048) return false
	try { return new URL(raw).protocol === 'https:' } catch { return false }
}

/**
 * Valida un mensaje crudo del WebView y lo convierte en una petición tipada.
 * Nunca lanza: todo error de forma vuelve como `{ ok: false }`.
 *
 * @param raw - `event.nativeEvent.data` tal cual (string JSON).
 */
export function parseBridgeMessage(raw: unknown): ParseResult {

	if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_LENGTH) {
		return fail(null, BRIDGE_ERRORS.INVALID_PARAMS, 'Malformed message')
	}

	let msg: unknown
	try { msg = JSON.parse(raw) } catch { return fail(null, BRIDGE_ERRORS.INVALID_PARAMS, 'Malformed message') }
	if (!isObj(msg)) return fail(null, BRIDGE_ERRORS.INVALID_PARAMS, 'Malformed message')

	const id = typeof msg.id === 'string' && ID_RE.test(msg.id) ? msg.id : null
	if (!id) return fail(null, BRIDGE_ERRORS.INVALID_PARAMS, 'Missing id')
	if (msg.v !== PROTOCOL_VERSION) return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, `Unsupported protocol version ${String(msg.v)}`)

	const method = msg.method
	const params = isObj(msg.params) ? msg.params : {}

	switch (method) {
		case 'ready':
		case 'close':
		case 'getTheme':
			return { ok: true, request: { id, method } }

		case 'auth.requestLogin': {
			const scopes = Array.isArray(params.scopes) && params.scopes.length <= 8 ? [...new Set(params.scopes)] : null
			if (!scopes || scopes.length === 0) {
				return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'scopes must be a non-empty array')
			}
			if (!scopes.every((s): s is MiniAppScope => (MINIAPP_SCOPES as readonly unknown[]).includes(s))) {
				return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, `scopes must be a subset of ${MINIAPP_SCOPES.join(', ')}`)
			}
			return { ok: true, request: { id, method, params: { scopes: scopes.sort() } } }
		}

		case 'payments.payInvoice': {
			const invoiceUuid = params.invoiceUuid
			if (typeof invoiceUuid !== 'string' || !UUID_RE.test(invoiceUuid)) {
				return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'invoiceUuid must be a UUID')
			}
			return { ok: true, request: { id, method, params: { invoiceUuid: invoiceUuid.toLowerCase() } } }
		}

		case 'ui.mainButton.set': {
			// PARCIAL (igual que el simulador de qpweb): `set({ loading: true })` no
			// toca el texto ni la visibilidad. Un campo ausente se conserva; uno
			// presente se normaliza con la misma tolerancia de siempre
			const patch: MainButtonPatch = {}
			if (params.text !== undefined) patch.text = typeof params.text === 'string' ? params.text.trim().slice(0, MAIN_BUTTON_MAX_LENGTH) : ''
			if (params.visible !== undefined) patch.visible = params.visible === true
			if (params.loading !== undefined) patch.loading = params.loading === true
			if (params.enabled !== undefined) patch.enabled = params.enabled !== false
			return { ok: true, request: { id, method, params: patch } }
		}

		case 'ui.backButton.set':
			return { ok: true, request: { id, method, params: { visible: params.visible === true } } }

		case 'ui.header.set': {
			// Método nuevo: validación ESTRICTA (no hay mini-apps publicadas que dependan de
			// tolerancias). `null` o '' borran el subtítulo; `null` o [] quitan las acciones
			const patch: HeaderPatch = {}
			if (params.subtitle !== undefined) {
				if (params.subtitle !== null && typeof params.subtitle !== 'string') return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'subtitle must be a string or null')
				patch.subtitle = typeof params.subtitle === 'string' ? oneLine(params.subtitle).slice(0, HEADER_SUBTITLE_MAX_LENGTH) : ''
			}
			if (params.actions !== undefined) {
				const actions = parseHeaderActions(params.actions)
				if (typeof actions === 'string') return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, actions)
				patch.actions = actions
			}
			return { ok: true, request: { id, method, params: patch } }
		}

		case 'ui.haptic': {
			const type = params.type ?? 'light'
			if (!(HAPTIC_TYPES as readonly unknown[]).includes(type)) return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'Unknown haptic type')
			return { ok: true, request: { id, method, params: { type: type as HapticType } } }
		}

		case 'ui.toast': {
			const message = typeof params.message === 'string' ? params.message.trim() : ''
			if (!message) return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'message is required')
			const type = params.type ?? 'info'
			if (!(TOAST_TYPES as readonly unknown[]).includes(type)) return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'Unknown toast type')
			const clipped = message.length > TOAST_MAX_LENGTH ? `${message.slice(0, TOAST_MAX_LENGTH - 1)}…` : message
			return { ok: true, request: { id, method, params: { message: clipped, type: type as ToastType } } }
		}

		case 'openLink': {
			if (!isHttpsUrl(params.url)) return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'url must be https')
			return { ok: true, request: { id, method, params: { url: params.url } } }
		}

		case 'share': {
			// La mini-app solo comparte SU enlace (lo pone la app); el texto es opcional
			if (params.text !== undefined && params.text !== null && typeof params.text !== 'string') {
				return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'text must be a string')
			}
			const text = typeof params.text === 'string' ? params.text.replace(/\s+/g, ' ').trim().slice(0, SHARE_TEXT_MAX_LENGTH) : ''
			if (LOOKS_LIKE_LINK.test(text)) return fail(id, BRIDGE_ERRORS.INVALID_PARAMS, 'text must not contain links')
			return { ok: true, request: { id, method, params: text ? { text } : {} } }
		}

		default:
			return fail(id, BRIDGE_ERRORS.UNKNOWN_METHOD, `Unknown method ${typeof method === 'string' ? method.slice(0, 64) : ''}`)
	}
}

/** Texto de una línea: sin controles y con los espacios colapsados. */
const oneLine = (text: string) => text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()

/**
 * Valida las acciones del encabezado. Devuelve la lista normalizada o el
 * mensaje técnico del rechazo (`INVALID_PARAMS`).
 */
function parseHeaderActions(raw: unknown): HeaderAction[] | string {
	if (raw === null) return []
	if (!Array.isArray(raw)) return 'actions must be an array'
	if (raw.length > HEADER_MAX_ACTIONS) return `actions accepts at most ${HEADER_MAX_ACTIONS} items`
	const actions: HeaderAction[] = []
	for (const item of raw) {
		if (!isObj(item)) return 'each action must be an object'
		if (typeof item.id !== 'string' || !ACTION_ID_RE.test(item.id)) return 'action id must match [A-Za-z0-9_-]{1,32}'
		if (!(HEADER_ICONS as readonly unknown[]).includes(item.icon)) return `action icon must be one of ${HEADER_ICONS.join(', ')}`
		const label = typeof item.label === 'string' ? oneLine(item.label).slice(0, HEADER_ACTION_LABEL_MAX_LENGTH) : ''
		// La etiqueta es lo que lee el lector de pantalla: sin ella el botón sería mudo
		if (!label) return 'action label is required'
		let badge = 0
		if (item.badge !== undefined && item.badge !== null) {
			if (typeof item.badge !== 'number' || !Number.isFinite(item.badge) || item.badge < 0) return 'action badge must be a non-negative number'
			badge = Math.floor(item.badge)
		}
		if (actions.some(a => a.id === item.id)) return 'action ids must be unique'
		actions.push({ id: item.id, icon: item.icon as HeaderIcon, label, badge })
	}
	return actions
}

/**
 * Normaliza un origen declarado (`https://shop.example.com`) o lo descarta.
 * Solo https, sin credenciales; el puerto se conserva (un origen lo incluye).
 */
export function normalizeOrigin(raw: unknown): string | null {
	if (typeof raw !== 'string') return null
	try {
		const url = new URL(raw)
		if (url.protocol !== 'https:' || url.username || url.password) return null
		return url.origin
	} catch { return null }
}

/**
 * ¿La URL pertenece EXACTAMENTE a uno de los orígenes permitidos? Comparación
 * de origen completo (esquema + host + puerto): un subdominio no hereda permiso
 * y `http:` nunca pasa aunque el host coincida.
 *
 * @param url - URL a la que navega (o desde la que habla) el WebView.
 * @param allowedOrigins - `allowed_origins` de la mini-app.
 */
export function isAllowedOrigin(url: unknown, allowedOrigins: readonly string[]): boolean {
	const origin = normalizeOrigin(url)
	if (!origin) return false
	return allowedOrigins.some(allowed => normalizeOrigin(allowed) === origin)
}

/** URLs que el WebView carga internamente y no son navegación real (iframes vacíos, etc.). */
export function isBenignInternalUrl(url: string): boolean {
	return url === 'about:blank' || url.startsWith('about:srcdoc')
}

/** Aplica un `ui.mainButton.set` sobre el estado anterior del botón. */
export function applyMainButtonPatch(prev: MainButtonState, patch: MainButtonPatch): MainButtonState {
	return { ...prev, ...patch }
}

/** Estado inicial del encabezado: solo la identidad registrada, sin subtítulo ni acciones. */
export const EMPTY_HEADER: HeaderState = { subtitle: '', actions: [] }

/** Aplica un `ui.header.set` sobre el estado anterior del encabezado. */
export function applyHeaderPatch(prev: HeaderState, patch: HeaderPatch): HeaderState {
	return { ...prev, ...patch }
}

/** Texto del badge: nada con 0, el número hasta 99 y «99+» por encima. */
export function headerBadgeText(badge: number): string | null {
	if (!badge) return null
	return badge > HEADER_BADGE_MAX ? `${HEADER_BADGE_MAX}+` : String(badge)
}

/** Sin texto no hay botón: un botón vacío no se puede pulsar con sentido. */
export function isMainButtonShown(state: MainButtonState): boolean {
	return state.visible && state.text.length > 0
}

/** Serializa la respuesta a una petición. */
export function bridgeResponse(id: string, result: unknown): string {
	return JSON.stringify({ id, ok: true, result: result ?? null })
}

/** Serializa un rechazo. */
export function bridgeErrorResponse(id: string, error: BridgeError): string {
	return JSON.stringify({ id, ok: false, error })
}

/** Serializa un evento push app → mini-app. */
export function bridgeEvent(event: BridgeEvent, data: unknown = null): string {
	return JSON.stringify({ event, data })
}

/** Métodos que abren una hoja nativa modal: solo uno a la vez (`BUSY`). */
export const MODAL_METHODS: ReadonlySet<BridgeMethod> = new Set(['auth.requestLogin', 'payments.payInvoice'])
