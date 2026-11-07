import type { ApiFailure } from '../../../../types/api'
import type { EmailChangeProofType, EmailChangeState } from '../../../../types/domain'

/**
 * Reglas PURAS del cambio de correo (sin react-native). Contrato en qpweb
 * `content/docs/user/email-change.mdx`.
 *
 * El servidor decide todo lo que importa (quién puede, con qué prueba, cuánto se espera);
 * aquí solo se traduce su respuesta a qué pintar. Los errores se deciden SIEMPRE por
 * `code`, nunca por el status, y el texto del servidor, que viaja solo en español, es
 * el respaldo.
 */

/** Qué vista toca según el estado del servidor. */
export type EmailChangeView = 'hidden' | 'pending' | 'problem' | 'request'

/** Campo que se marca en rojo ante un error. */
export type EmailChangeField = 'email' | 'password' | 'newEmailCode' | 'proof'

/** Para qué se pide la prueba: abrir el pedido o cancelarlo. */
export type EmailChangePurpose = 'request' | 'cancel'

/** Qué hace la pantalla con un error, además de enseñar el mensaje. */
export type EmailChangeAction = 'message' | 'field' | 'reload' | 'reloadMethods' | 'restart' | 'hide' | 'login'

type Rule = { action: EmailChangeAction, messageKey: string | null, field?: EmailChangeField }

const RULES: Record<string, Rule> = {
	SESSION_REQUIRED: { action: 'login', messageKey: 'sessionRequired' },
	EMAIL_CHANGE_DISABLED: { action: 'hide', messageKey: 'disabled' },
	EMAIL_CHANGE_PENDING: { action: 'reload', messageKey: 'pending' },
	EMAIL_CHANGE_HOLD: { action: 'reload', messageKey: 'hold' },
	EMAIL_CHANGE_TOO_SOON: { action: 'reload', messageKey: 'tooSoon' },
	EMAIL_CHANGE_QUIET_PERIOD: { action: 'reload', messageKey: 'quietPeriod' },
	EMAIL_CHANGE_NOT_PENDING: { action: 'reload', messageKey: 'notPending' },
	EMAIL_CHANGE_NOT_FOUND: { action: 'reload', messageKey: 'notFound' },
	EMAIL_SAME: { action: 'field', messageKey: 'emailSame', field: 'email' },
	EMAIL_INVALID: { action: 'field', messageKey: 'emailInvalid', field: 'email' },
	EMAIL_TAKEN: { action: 'field', messageKey: 'emailTaken', field: 'email' },
	PASSWORD_INVALID: { action: 'field', messageKey: 'passwordInvalid', field: 'password' },
	NEW_EMAIL_CODE_INVALID: { action: 'field', messageKey: 'newEmailCodeInvalid', field: 'newEmailCode' },
	PROOF_INVALID: { action: 'field', messageKey: 'proofInvalid', field: 'proof' },
	PROOF_NOT_ALLOWED: { action: 'reloadMethods', messageKey: 'proofNotAllowed' },
	EMAIL_CHANGE_EXPIRED: { action: 'restart', messageKey: 'expired' },
	TOO_MANY_ATTEMPTS: { action: 'restart', messageKey: 'tooManyAttempts' },
	RATE_LIMITED: { action: 'message', messageKey: 'rateLimited' },
	// Trae los minutos que faltan escritos en la frase: no hay otro sitio de donde sacarlos
	CODE_LOCKED: { action: 'message', messageKey: null },
	TELEGRAM_UNAVAILABLE: { action: 'message', messageKey: 'telegramUnavailable' },
	EMAIL_SEND_FAILED: { action: 'message', messageKey: 'emailSendFailed' },
	EMAIL_CHANGE_UNAVAILABLE: { action: 'message', messageKey: 'unavailable' },
	INVALID_REQUEST: { action: 'message', messageKey: 'generic' },
	USER_NOT_FOUND: { action: 'message', messageKey: 'generic' },
}

/** Fallos de integración: al usuario un mensaje genérico, y queda el rastro para nosotros. */
const INTEGRATION_CODES = ['INVALID_REQUEST', 'USER_NOT_FOUND']

export type EmailChangeFailure = {
	action: EmailChangeAction
	field: EmailChangeField | null
	/** Clave bajo `settings.emailChange.errors`. Sin clave se enseña `serverMessage`. */
	messageKey: string | null
	serverMessage: string | null
	until: string | null
	/** Código de un fallo de integración, para el log. */
	integrationCode: string | null
}

/**
 * Traduce un fallo de la API a lo que tiene que hacer la pantalla.
 *
 * @param result - Fallo de `userApi`.
 * @returns Acción, campo y mensaje. Un código desconocido enseña el texto del servidor.
 *   Sin código hay dos casos: sin respuesta (sin `status`), `error` es el aviso ya traducido
 *   del interceptor y dice más que el genérico; con respuesta, es el texto de axios en
 *   inglés de un cuerpo vacío, y va el mensaje genérico.
 */
export const classifyEmailChangeFailure = (result: Pick<ApiFailure, 'error' | 'details' | 'status'>): EmailChangeFailure => {
	const details = (result.details ?? {}) as { code?: unknown, until?: unknown }
	const code = typeof details.code === 'string' ? details.code : ''
	const until = typeof details.until === 'string' ? details.until : null
	const rule = RULES[code]
	return {
		action: rule?.action ?? 'message',
		field: rule?.field ?? null,
		messageKey: code ? rule?.messageKey ?? null : result.status ? 'generic' : null,
		serverMessage: result.error || null,
		until,
		integrationCode: INTEGRATION_CODES.includes(code) ? code : null,
	}
}

/**
 * Clave del mensaje de `problem` (GET), la misma tabla que los errores del POST.
 *
 * @param code - `problem.code` del servidor.
 * @returns La clave, o null para enseñar `problem.message` tal cual.
 */
export const problemMessageKey = (code: string): string | null => RULES[code]?.messageKey ?? null

/**
 * Qué vista pintar. Un pedido en curso gana a todo: con él `can_start` es false y el
 * `problem` solo diría que ya hay uno.
 */
export const emailChangeView = (state: EmailChangeState | null | undefined): EmailChangeView => {
	if (!state?.enabled) { return 'hidden' }
	if (state.pending) { return 'pending' }
	return state.can_start ? 'request' : 'problem'
}

/** La prueba elegida si sigue valiendo; si no, la primera que acepte la cuenta. */
export const pickMethod = (methods: EmailChangeProofType[], current: EmailChangeProofType | null): EmailChangeProofType | null =>
	(current && methods.includes(current) ? current : methods[0] ?? null)

/** ¿La prueba llega por un canal? Se puede pedir; el TOTP lo genera la app autenticadora. */
export const proofCanSendCode = (method: EmailChangeProofType) => method !== 'totp'

/**
 * Al pedir el cambio, `start` ya mandó el código al correo actual: desde el primer momento
 * el botón ofrece otro, que es la salida barata si tarda (volver al paso 1 gasta el límite
 * de 3 por hora). Cada código nuevo invalida el anterior.
 */
export const proofCodeAlreadySent = (method: EmailChangeProofType, purpose: EmailChangePurpose) =>
	method === 'old_email' && purpose === 'request'

/** `totp` admite también un código de recuperación (`XXXX-XXXX`): no puede ser numérico. */
export const proofIsNumeric = (method: EmailChangeProofType) => method !== 'totp'

/** Lo que el campo acepta según la prueba. El servidor limita la prueba a 32 caracteres. */
export const sanitizeProofCode = (method: EmailChangeProofType, text: string) =>
	(proofIsNumeric(method) ? text.replace(/\D/g, '').slice(0, 6) : text.replace(/\s/g, '').toUpperCase().slice(0, 32))

/** ¿Se puede enviar ya la prueba? Un TOTP son 6 dígitos y un código de recuperación más. */
export const proofIsComplete = (method: EmailChangeProofType, code: string) =>
	(proofIsNumeric(method) ? /^\d{6}$/.test(code) : code.trim().length >= 6)

/** Mínimo para no gastar una petición: la validación real es del servidor. */
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

/**
 * Fecha del servidor en la zona del dispositivo.
 *
 * @param value - Fecha ISO.
 * @param locale - Locale activo (`getDateLocale()`).
 * @returns Día, mes y hora; cadena vacía si la fecha no se puede leer.
 */
export const formatEmailChangeDate = (value: string | null | undefined, locale: string) => {
	if (!value) { return '' }
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) { return '' }
	return date.toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
