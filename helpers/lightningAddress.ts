/**
 * Reglas PURAS de la Lightning Address (`name@qvpay.me`, LUD-16): espejo de
 * `scripts/lightning/address-rules.js` de qpweb. Cero react-native: lo usan el
 * campo del nombre (validación en vivo, la misma que aplica el servidor), el
 * retiro BTCLN (clasificar lo que se escribe y reconocer una dirección propia)
 * y el historial (marcar los cobros que entraron en sats).
 *
 * Cambiar el patrón, los nombres reservados o los dominios exige tocar LOS DOS
 * repos: el servidor es quien manda y aquí solo se adelanta su veredicto.
 */

export const LN_NAME_MIN = 3
export const LN_NAME_MAX = 32
export const LN_COMMENT_MAX = 255
export const LN_PAYMENTS_PAGE_SIZE = 20

/** Clave de la query de la Lightning Address (aquí, pura, para que la invaliden módulos sin React Query). */
export const LIGHTNING_ADDRESS_KEY = ['user', 'lightning-address'] as const

// LUD-16 admite a-z 0-9 - _ . ; además: empieza y acaba en alfanumérico y sin separadores
// seguidos (`a..b`, `a._b`), que solo sirven para imitar otro nombre.
const LN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|[._-](?=[a-z0-9])){1,30}[a-z0-9]$/

/** Nombres que suplantarían a QvaPay o a un buzón de sistema. */
export const RESERVED_LN_NAMES = new Set([
	'admin', 'administrator', 'root', 'support', 'soporte', 'ayuda', 'help', 'info', 'billing', 'pagos', 'payments', 'pay',
	'api', 'www', 'mail', 'email', 'noreply', 'no-reply', 'security', 'seguridad', 'abuse', 'postmaster', 'hostmaster',
	'webmaster', 'qvapay', 'qvpay', 'staff', 'oficial', 'official', 'wallet', 'lightning', 'lnurl', 'bitcoin', 'btc',
	'test', 'system', 'sistema', 'compliance', 'tesoreria', 'treasury', 'skymind',
])

export type LnNameProblem = 'length' | 'format' | 'reserved'

export const normalizeLnName = (raw: unknown): string => String(raw ?? '').trim().toLowerCase()

/** Esqueleto anti-suplantación: `a.lice`, `a-lice` y `alice` son el mismo nombre. */
export const skeletonOf = (name: unknown): string => String(name ?? '').replace(/[._-]/g, '')

/**
 * Qué le pasa a un nombre YA normalizado. `null` = válido (el servidor aún puede
 * decir «ocupado»: eso solo lo sabe él).
 */
export const lnNameProblem = (name: unknown): LnNameProblem | null => {
	const n = String(name ?? '')
	if (n.length < LN_NAME_MIN || n.length > LN_NAME_MAX) return 'length'
	if (!LN_NAME_PATTERN.test(n)) return 'format'
	if (RESERVED_LN_NAMES.has(n) || RESERVED_LN_NAMES.has(skeletonOf(n))) return 'reserved'
	return null
}

// --- Dominios propios ---------------------------------------------------------------------

/** Hosts que sirven NUESTRAS Lightning Address (un retiro BTCLN hacia ellos es un auto-pago). */
const OWN_LN_ROOTS = ['qvpay.me', 'qvapay.com']

export const isOwnLnurlHost = (host: unknown): boolean => {
	const h = String(host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
	if (!h) return false
	return OWN_LN_ROOTS.some(d => h === d || h.endsWith(`.${d}`))
}

// --- Qué se ha escrito en el campo de destino ----------------------------------------------

export type LightningInputKind = 'lnaddress' | 'bolt11' | 'lnurl'

const LN_ADDRESS_PATTERN = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

/** Quita el esquema (`lightning:`, `lnurlp:`…) y los espacios. */
export const stripLightningScheme = (raw: unknown): string =>
	String(raw ?? '').trim().replace(/^(lightning|lnurlp|lnurl):(\/\/)?/i, '')

/**
 * ¿Lo escrito es un destino Lightning completo que merece decodificarse?
 * Solo clasifica cuando el patrón casa ENTERO: a medio teclear devuelve null y
 * el retiro no gasta una llamada a `/lightning/decode` (5 por minuto).
 */
export const classifyLightningInput = (raw: unknown): LightningInputKind | null => {
	const value = stripLightningScheme(raw)
	if (!value) return null
	if (LN_ADDRESS_PATTERN.test(value)) return 'lnaddress'
	if (/^lnbc[0-9a-z]*1[0-9a-z]+$/i.test(value)) return 'bolt11'
	if (/^lnurl1[02-9ac-hj-np-z]+$/i.test(value)) return 'lnurl'
	return null
}

/** Dominio de una Lightning Address (`nombre@dominio`), o null si no lo es. */
export const lnAddressHost = (raw: unknown): string | null => {
	const value = stripLightningScheme(raw)
	if (!LN_ADDRESS_PATTERN.test(value)) return null
	return value.slice(value.lastIndexOf('@') + 1).toLowerCase()
}

/** ¿Es una Lightning Address de QvaPay (se debe transferir, no retirar)? Lo confirma el backend con `LN_SELF_PAY`. */
export const isOwnLnAddress = (raw: unknown): boolean => isOwnLnurlHost(lnAddressHost(raw))

// --- Marcas en el historial ---------------------------------------------------------------

/** `remote_id` de las transacciones que entraron por la Lightning Address. */
export const LNADDR_REMOTE_PREFIX = 'LNADDR_'
/** Sufijo de la descripción cuando el cobro entró al saldo de sats (el saldo USD no se movió). */
export const LN_SATS_DESCRIPTION_MARK = ' (saldo en sats)'

export const isLnAddressTransaction = (tx: { remote_id?: unknown, description?: unknown } | null | undefined): boolean =>
	String(tx?.remote_id ?? '').startsWith(LNADDR_REMOTE_PREFIX) || /^Lightning Address /.test(String(tx?.description ?? ''))

export const isSatsCreditDescription = (description: unknown): boolean =>
	String(description ?? '').trimEnd().endsWith(LN_SATS_DESCRIPTION_MARK.trimEnd())

// --- Motivos y errores → claves i18n ------------------------------------------------------

const REASON_KEYS: Record<string, string> = {
	MODE_OFF: 'MODE_OFF',
	NOT_BETA: 'MODE_OFF',
	OPERATIONAL: 'ROLE',
	ROLE: 'ROLE',
	UNCLAIMED: 'UNCLAIMED',
	KYC: 'KYC',
	DEPOSITS_DISABLED: 'DEPOSITS_DISABLED',
	PAUSED: 'PAUSED',
	BLOCKED: 'BLOCKED',
}

/**
 * Clave i18n (`settings.lightningAddress.reasons.<x>`) del motivo por el que la
 * cuenta no recibe. `null` = código desconocido: la UI enseña el `message` del
 * servidor (en español) tal cual.
 */
export const lnReasonKey = (code: unknown): string | null => {
	const k = REASON_KEYS[String(code ?? '')]
	return k ? `settings.lightningAddress.reasons.${k}` : null
}

const ERROR_KEYS: Record<string, string> = {
	LN_NAME_TAKEN: 'nameProblems.taken',
	LN_RENAME_LIMIT: 'errors.renameLimit',
	LN_ADDRESS_EXISTS: 'errors.stateChanged',
	LN_ADDRESS_STATE_CHANGED: 'errors.stateChanged',
	LN_ADDRESS_NOT_FOUND: 'errors.stateChanged',
	LN_SATS_DISABLED: 'errors.satsDisabled',
	LN_ADDRESS_UNAVAILABLE_TEMP: 'errors.temp',
}

/**
 * Clave i18n del error de un POST. `LN_NAME_INVALID` se traduce por su `problem`
 * (el `error` del servidor es genérico). `LN_ADDRESS_UNAVAILABLE` y `KYC_REQUIRED`
 * no están aquí: los resuelve `lnReasonKey` / la navegación al KYC.
 */
export const lnErrorKey = (code: unknown, problem?: unknown): string | null => {
	if (code === 'LN_NAME_INVALID') {
		const p = String(problem ?? '')
		return p === 'length' || p === 'format' || p === 'reserved' ? `settings.lightningAddress.nameProblems.${p}` : 'settings.lightningAddress.nameProblems.format'
	}
	const k = ERROR_KEYS[String(code ?? '')]
	return k ? `settings.lightningAddress.${k}` : null
}

/** Tras estos códigos la caché está vieja: se recorta y se vuelve a pedir el GET. */
export const LN_STATE_CHANGED_CODES = new Set(['LN_ADDRESS_EXISTS', 'LN_ADDRESS_STATE_CHANGED', 'LN_ADDRESS_NOT_FOUND', 'LN_SATS_DISABLED'])

// --- Fallo de un POST → qué enseñar -------------------------------------------------------

export type LnFailureHint = {
	/** Clave i18n a resolver, si el código tiene traducción. */
	key: string | null
	/** Texto del servidor (español) para los códigos sin traducción. */
	text: string | null
	/** `KYC_REQUIRED` o motivo `KYC`: además de avisar, llevar a la verificación. */
	kyc: boolean
}

/**
 * Traduce el fallo de `POST /user/lightning-address` a una clave i18n o al texto
 * del servidor. Orden: KYC (403) → motivo de cuenta (`LN_ADDRESS_UNAVAILABLE`) →
 * 429 → código de acción → prosa del servidor.
 */
export const lnFailureHint = (details: unknown, status?: number, fallbackText?: string | null): LnFailureHint => {
	const d = (details && typeof details === 'object' ? details : {}) as { code?: string, problem?: string, reason_code?: string, message?: string, error?: string }
	if (d.code === 'KYC_REQUIRED') return { key: 'settings.lightningAddress.reasons.KYC', text: null, kyc: true }
	if (d.code === 'LN_ADDRESS_UNAVAILABLE') {
		const key = lnReasonKey(d.reason_code)
		return { key, text: key ? null : (d.message || d.error || fallbackText || null), kyc: d.reason_code === 'KYC' }
	}
	if (status === 429) return { key: 'settings.lightningAddress.errors.tooMany', text: null, kyc: false }
	const key = lnErrorKey(d.code, d.problem)
	return { key, text: key ? null : (d.error || d.message || fallbackText || null), kyc: false }
}
