/**
 * Reglas puras del cambio de correo: la tabla de errores del contrato y las decisiones
 * de la pantalla. Se decide por `code`, así que da igual si el fallo llega como 401 o 422.
 * @jest-environment node
 */
import es from '../../../../i18n/locales/es/settings.json'
import {
	classifyEmailChangeFailure,
	emailChangeView,
	formatEmailChangeDate,
	looksLikeEmail,
	pickMethod,
	problemMessageKey,
	proofIsComplete,
	proofCanSendCode,
	proofCodeAlreadySent,
	proofIsNumeric,
	sanitizeProofCode,
} from './emailChangeRules'

const failure = (code, extra = {}) => classifyEmailChangeFailure({ error: 'texto del servidor', details: { code, ...extra } })

describe('classifyEmailChangeFailure', () => {

	test.each([
		['SESSION_REQUIRED', 'login', null],
		['EMAIL_CHANGE_DISABLED', 'hide', null],
		['EMAIL_CHANGE_PENDING', 'reload', null],
		['EMAIL_CHANGE_HOLD', 'reload', null],
		['EMAIL_CHANGE_TOO_SOON', 'reload', null],
		['EMAIL_CHANGE_QUIET_PERIOD', 'reload', null],
		['EMAIL_CHANGE_NOT_PENDING', 'reload', null],
		['EMAIL_CHANGE_NOT_FOUND', 'reload', null],
		['EMAIL_SAME', 'field', 'email'],
		['EMAIL_INVALID', 'field', 'email'],
		['EMAIL_TAKEN', 'field', 'email'],
		['PASSWORD_INVALID', 'field', 'password'],
		['NEW_EMAIL_CODE_INVALID', 'field', 'newEmailCode'],
		['PROOF_INVALID', 'field', 'proof'],
		['PROOF_NOT_ALLOWED', 'reloadMethods', null],
		['EMAIL_CHANGE_EXPIRED', 'restart', null],
		['TOO_MANY_ATTEMPTS', 'restart', null],
		['RATE_LIMITED', 'message', null],
		['CODE_LOCKED', 'message', null],
		['TELEGRAM_UNAVAILABLE', 'message', null],
		['EMAIL_SEND_FAILED', 'message', null],
		['EMAIL_CHANGE_UNAVAILABLE', 'message', null],
		['INVALID_REQUEST', 'message', null],
		['USER_NOT_FOUND', 'message', null],
	])('%s → %s', (code, action, field) => {
		const result = failure(code)
		expect(result.action).toBe(action)
		expect(result.field).toBe(field)
	})

	test('the same code means the same thing with any status', () => {
		for (const status of [401, 422]) {
			expect(classifyEmailChangeFailure({ error: 'x', details: { code: 'PASSWORD_INVALID' }, status }).field).toBe('password')
		}
	})

	test('every message key exists in the Spanish bundle', () => {
		const codes = ['SESSION_REQUIRED', 'EMAIL_CHANGE_DISABLED', 'EMAIL_CHANGE_PENDING', 'EMAIL_CHANGE_HOLD', 'EMAIL_CHANGE_TOO_SOON', 'EMAIL_CHANGE_QUIET_PERIOD', 'EMAIL_CHANGE_NOT_PENDING', 'EMAIL_CHANGE_NOT_FOUND', 'EMAIL_SAME', 'EMAIL_INVALID', 'EMAIL_TAKEN', 'PASSWORD_INVALID', 'NEW_EMAIL_CODE_INVALID', 'PROOF_INVALID', 'PROOF_NOT_ALLOWED', 'EMAIL_CHANGE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'RATE_LIMITED', 'TELEGRAM_UNAVAILABLE', 'EMAIL_SEND_FAILED', 'EMAIL_CHANGE_UNAVAILABLE', 'INVALID_REQUEST', 'USER_NOT_FOUND']
		for (const code of codes) {
			const key = failure(code).messageKey
			expect(typeof es.emailChange.errors[key]).toBe('string')
		}
	})

	test('CODE_LOCKED shows the server text: the minutes only live there', () => {
		expect(failure('CODE_LOCKED').messageKey).toBeNull()
		expect(failure('CODE_LOCKED').serverMessage).toBe('texto del servidor')
	})

	test('keeps the date a waiting error brings', () => {
		expect(failure('EMAIL_CHANGE_TOO_SOON', { until: '2026-12-01T00:00:00.000Z' }).until).toBe('2026-12-01T00:00:00.000Z')
	})

	test('integration failures are the only ones flagged for the log', () => {
		expect(failure('INVALID_REQUEST').integrationCode).toBe('INVALID_REQUEST')
		expect(failure('USER_NOT_FOUND').integrationCode).toBe('USER_NOT_FOUND')
		expect(failure('PROOF_INVALID').integrationCode).toBeNull()
	})

	test('with no response it keeps the translated notice of the client', () => {
		expect(classifyEmailChangeFailure({ error: 'No se ha podido conectar con el servidor' })).toEqual({
			action: 'message', field: null, messageKey: null, serverMessage: 'No se ha podido conectar con el servidor', until: null, integrationCode: null,
		})
	})

	test('a response with no code never shows the raw axios text', () => {
		expect(classifyEmailChangeFailure({ error: 'Request failed with status code 502', status: 502 }).messageKey).toBe('generic')
	})

	test('a non-JSON body counts as having no code', () => {
		expect(classifyEmailChangeFailure({ error: 'x', details: '<html>', status: 503 }).messageKey).toBe('generic')
	})

	test('an unknown code falls back to the server text', () => {
		const result = failure('ALGO_NUEVO')
		expect(result.action).toBe('message')
		expect(result.messageKey).toBeNull()
		expect(result.serverMessage).toBe('texto del servidor')
	})
})

describe('problemMessageKey', () => {

	test('translates the known problems', () => {
		expect(problemMessageKey('EMAIL_CHANGE_QUIET_PERIOD')).toBe('quietPeriod')
	})

	test('leaves an unknown problem to its server message', () => {
		expect(problemMessageKey('ALGO_NUEVO')).toBeNull()
	})
})

describe('emailChangeView', () => {

	const base = { enabled: true, can_start: true, problem: null, methods: ['totp'], hold_hours: 48, pending: null }

	test.each([[null], [undefined], [{ enabled: false }]])('hides the flow for %j', (state) => {
		expect(emailChangeView(state)).toBe('hidden')
	})

	test('opens the request when it can start', () => {
		expect(emailChangeView(base)).toBe('request')
	})

	test('shows the problem when it cannot', () => {
		expect(emailChangeView({ ...base, can_start: false, problem: { code: 'EMAIL_CHANGE_HOLD', message: 'x', until: null } })).toBe('problem')
	})

	test('a change in progress wins over its own problem', () => {
		const pending = { uuid: 'u', new_email: 'a***@b***.com', execute_after: '2026-11-08T20:00:00.000Z', cancel_methods: ['totp'] }
		expect(emailChangeView({ ...base, can_start: false, problem: { code: 'EMAIL_CHANGE_PENDING', message: 'x', until: null }, pending })).toBe('pending')
	})
})

describe('proof helpers', () => {

	test('pickMethod keeps a valid choice and replaces a stale one', () => {
		expect(pickMethod(['totp', 'telegram'], 'telegram')).toBe('telegram')
		expect(pickMethod(['telegram'], 'totp')).toBe('telegram')
		expect(pickMethod(['totp', 'telegram'], null)).toBe('totp')
		expect(pickMethod([], 'totp')).toBeNull()
	})

	test('every proof but the authenticator can ask for a code', () => {
		expect(proofCanSendCode('telegram')).toBe(true)
		expect(proofCanSendCode('old_email')).toBe(true)
		expect(proofCanSendCode('totp')).toBe(false)
	})

	test('only the current mailbox starts with a code on its way, and only when requesting', () => {
		expect(proofCodeAlreadySent('old_email', 'request')).toBe(true)
		expect(proofCodeAlreadySent('old_email', 'cancel')).toBe(false)
		expect(proofCodeAlreadySent('telegram', 'request')).toBe(false)
	})

	test('only the authenticator proof needs a full keyboard', () => {
		expect(proofIsNumeric('totp')).toBe(false)
		expect(proofIsNumeric('telegram')).toBe(true)
		expect(proofIsNumeric('old_email')).toBe(true)
	})

	test('sanitizeProofCode keeps a recovery code and limits sent codes to six digits', () => {
		expect(sanitizeProofCode('totp', ' abcd-2345 ')).toBe('ABCD-2345')
		expect(sanitizeProofCode('telegram', '12a34 56789')).toBe('123456')
	})

	test('proofIsComplete accepts a TOTP and a recovery code', () => {
		expect(proofIsComplete('totp', '123456')).toBe(true)
		expect(proofIsComplete('totp', 'ABCD-2345')).toBe(true)
		expect(proofIsComplete('totp', '12345')).toBe(false)
		expect(proofIsComplete('old_email', '12345')).toBe(false)
		expect(proofIsComplete('old_email', '123456')).toBe(true)
	})
})

describe('looksLikeEmail', () => {

	test('tells an address from a typo', () => {
		expect(looksLikeEmail(' nuevo@ejemplo.com ')).toBe(true)
		expect(looksLikeEmail('nuevo@ejemplo')).toBe(false)
		expect(looksLikeEmail('')).toBe(false)
	})
})

describe('formatEmailChangeDate', () => {

	test('prints a readable date', () => {
		expect(formatEmailChangeDate('2026-11-08T20:00:00.000Z', 'es-ES')).toMatch(/noviembre/)
	})

	test('gives nothing for a missing or broken date', () => {
		expect(formatEmailChangeDate(null, 'es-ES')).toBe('')
		expect(formatEmailChangeDate('mañana', 'es-ES')).toBe('')
	})
})
