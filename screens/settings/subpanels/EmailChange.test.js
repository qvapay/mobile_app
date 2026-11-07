/**
 * Cambiar el correo con las vistas de verdad: qué pinta cada estado del servidor y qué
 * hace la pantalla con cada error. Los errores se deciden por `code`, nunca por el status.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
const mockLogout = jest.fn()
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ user: { email: 'viejo@ejemplo.com' }, logout: mockLogout }) }))
jest.mock('../../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPCodeInput', () => 'QPCodeInput')
jest.mock('../../../ui/particles/QPLoader', () => 'QPLoader')
jest.mock('../../../ui/particles/QPSwitch', () => 'QPSwitch')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => {
	const { useEffect } = require('react')
	return {
		useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true }),
		useFocusEffect: (effect) => { useEffect(() => effect(), [effect]) },
	}
})
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('../../../api/userApi', () => ({
	userApi: {
		getEmailChangeState: jest.fn(),
		startEmailChange: jest.fn(),
		sendEmailChangeCode: jest.fn(),
		confirmEmailChange: jest.fn(),
		cancelEmailChange: jest.fn(),
	},
}))
jest.mock('../../../helpers/biometricEmailChange', () => ({ rememberEmailBeforeChange: jest.fn(), forgetEmailBeforeChange: jest.fn() }))

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import { userApi } from '../../../api/userApi'
import { forgetEmailBeforeChange, rememberEmailBeforeChange } from '../../../helpers/biometricEmailChange'
import EmailChange from './EmailChange'

const STATE = { enabled: true, can_start: true, problem: null, methods: ['totp', 'telegram'], hold_hours: 48, pending: null }
const PENDING = { uuid: 'u', new_email: 'nu***@e***.com', execute_after: '2026-11-08T20:00:00.000Z', requested_at: '2026-11-06T20:00:00.000Z', cancel_methods: ['totp', 'telegram'] }
const STARTED = { ok: true, new_email: 'nu***@e***.com', methods: ['totp', 'telegram'] }

const serve = (data) => userApi.getEmailChangeState.mockResolvedValue({ success: true, data })
const failWith = (code, status = 400, extra = {}) => ({ success: false, status, error: 'texto del servidor', details: { error: 'texto del servidor', code, ...extra } })

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

let client
let tree
const open = async () => {
	await act(async () => { tree = create(<QueryClientProvider client={client}><EmailChange /></QueryClientProvider>) })
	await settle()
}

const byId = (testID) => tree.root.findAll(node => node.props.testID === testID)
const one = (testID) => byId(testID)[0]
const press = async (testID) => { await act(async () => { await one(testID).props.onPress() }); await settle() }
const type = (testID, value) => act(async () => { one(testID).props.onChangeText(value) })
const typeCode = (testID, value) => act(async () => { one(testID).props.onChangeCode(value) })
const hasText = (needle) => tree.root.findAllByType(Text).some(node => [].concat(node.props.children).join('').includes(needle))

const fillForm = async () => {
	await type('email-change-new-email', ' nuevo@ejemplo.com ')
	await type('email-change-password', 'secreta')
}
const toVerify = async () => {
	userApi.startEmailChange.mockResolvedValue({ success: true, data: STARTED, status: 200 })
	await open()
	await fillForm()
	await press('email-change-continue')
}

beforeEach(() => {
	jest.clearAllMocks()
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	serve(STATE)
})
afterEach(async () => {
	await act(async () => { tree.unmount() })
	client.clear()
})

describe('qué vista toca', () => {

	test('cerrado para la cuenta: vuelve atrás', async () => {
		serve({ enabled: false })
		await open()
		expect(mockGoBack).toHaveBeenCalled()
	})

	test('no se puede pedir: explica por qué y desde cuándo', async () => {
		serve({ ...STATE, can_start: false, methods: [], problem: { code: 'EMAIL_CHANGE_QUIET_PERIOD', message: 'en español', until: '2026-11-20T10:00:00.000Z' } })
		await open()
		expect(hasText('Hubo un cambio de seguridad reciente')).toBe(true)
		expect(hasText('Podrás hacerlo a partir del')).toBe(true)
		expect(byId('email-change-continue')).toHaveLength(0)
	})

	test('un problema desconocido enseña el texto del servidor', async () => {
		serve({ ...STATE, can_start: false, problem: { code: 'ALGO_NUEVO', message: 'texto del servidor', until: null } })
		await open()
		expect(hasText('texto del servidor')).toBe(true)
	})

	test('si no carga deja reintentar', async () => {
		userApi.getEmailChangeState.mockResolvedValue({ success: false, status: 503, error: 'x' })
		await open()
		expect(hasText('No pudimos cargar')).toBe(true)
		serve(STATE)
		await act(async () => { tree.root.findByType('QPButton').props.onPress() })
		await settle()
		expect(byId('email-change-continue')).toHaveLength(1)
	})
})

describe('paso 1', () => {

	test('avisa de la espera que dicta el servidor', async () => {
		serve({ ...STATE, hold_hours: 72 })
		await open()
		expect(hasText('72 horas')).toBe(true)
	})

	test('no deja seguir sin un correo con forma y una contraseña', async () => {
		await open()
		expect(one('email-change-continue').props.disabled).toBe(true)
		await type('email-change-new-email', 'nuevo@ejemplo')
		await type('email-change-password', 'secreta')
		expect(one('email-change-continue').props.disabled).toBe(true)
		await type('email-change-new-email', 'nuevo@ejemplo.com')
		expect(one('email-change-continue').props.disabled).toBe(false)
	})

	test('manda el correo limpio y pasa al paso 2 con el correo enmascarado', async () => {
		await toVerify()
		expect(userApi.startEmailChange).toHaveBeenCalledWith({ new_email: 'nuevo@ejemplo.com', password: 'secreta' })
		expect(hasText('Código enviado a nu***@e***.com')).toBe(true)
	})

	test('la contraseña no sobrevive al paso 2: al volver hay que escribirla', async () => {
		await toVerify()
		await press('email-change-restart')
		expect(one('email-change-new-email').props.value).toBe(' nuevo@ejemplo.com ')
		expect(one('email-change-password').props.value).toBe('')
	})

	test.each([401, 422])('una contraseña incorrecta (%i) marca el campo y lo vacía', async (status) => {
		userApi.startEmailChange.mockResolvedValue(failWith('PASSWORD_INVALID', status))
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(one('email-change-password').props.style).toEqual(expect.objectContaining({ borderWidth: 1 }))
		expect(one('email-change-password').props.value).toBe('')
		expect(toast.error).toHaveBeenCalledWith('La contraseña no es correcta.', undefined)
		expect(mockLogout).not.toHaveBeenCalled()
	})

	test.each(['EMAIL_SAME', 'EMAIL_INVALID', 'EMAIL_TAKEN'])('%s marca el correo y conserva la contraseña', async (code) => {
		userApi.startEmailChange.mockResolvedValue(failWith(code))
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(one('email-change-new-email').props.style).toEqual(expect.objectContaining({ borderWidth: 1 }))
		expect(one('email-change-password').props.value).toBe('secreta')
	})

	test('corregir el campo apaga la marca', async () => {
		userApi.startEmailChange.mockResolvedValue(failWith('EMAIL_TAKEN'))
		await open()
		await fillForm()
		await press('email-change-continue')
		await type('email-change-new-email', 'otro@ejemplo.com')
		expect(one('email-change-new-email').props.style).toBeUndefined()
	})

	test('CODE_LOCKED enseña los minutos que trae el servidor', async () => {
		userApi.startEmailChange.mockResolvedValue(failWith('CODE_LOCKED', 423))
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(toast.error).toHaveBeenCalledWith('texto del servidor', undefined)
	})

	test('un error con fecha la enseña y relee el estado', async () => {
		userApi.startEmailChange.mockResolvedValue(failWith('EMAIL_CHANGE_TOO_SOON', 409, { until: '2026-12-01T10:00:00.000Z' }))
		await open()
		await fillForm()
		userApi.getEmailChangeState.mockClear()
		await press('email-change-continue')
		expect(toast.error).toHaveBeenCalledWith('Cambiaste tu correo hace poco.', { description: expect.stringContaining('Podrás hacerlo a partir del') })
		expect(userApi.getEmailChangeState).toHaveBeenCalled()
	})

	test('EMAIL_CHANGE_DISABLED cierra el flujo', async () => {
		userApi.startEmailChange.mockResolvedValue(failWith('EMAIL_CHANGE_DISABLED', 403))
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(mockGoBack).toHaveBeenCalled()
	})

	test('SESSION_REQUIRED pide iniciar sesión', async () => {
		userApi.startEmailChange.mockResolvedValue(failWith('SESSION_REQUIRED', 403))
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(mockLogout).toHaveBeenCalledTimes(1)
	})

	test('un fallo de integración da un mensaje genérico y deja rastro', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => { })
		userApi.startEmailChange.mockResolvedValue(failWith('INVALID_REQUEST'))
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(toast.error).toHaveBeenCalledWith('No pudimos completar el cambio. Inténtalo de nuevo.', undefined)
		expect(warn).toHaveBeenCalledWith(expect.any(String), 'INVALID_REQUEST')
		warn.mockRestore()
	})

	test('sin red enseña el aviso traducido del cliente', async () => {
		userApi.startEmailChange.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(toast.error).toHaveBeenCalledWith('No se ha podido conectar con el servidor', undefined)
	})

	test('una respuesta sin código enseña el mensaje genérico, nunca el texto de axios', async () => {
		userApi.startEmailChange.mockResolvedValue({ success: false, status: 502, error: 'Request failed with status code 502' })
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(toast.error).toHaveBeenCalledWith('No pudimos completar el cambio. Inténtalo de nuevo.', undefined)
	})
})

describe('paso 2', () => {

	test('con dos pruebas deja elegir, y totp no usa teclado numérico', async () => {
		await toVerify()
		expect(tree.root.findByType('QPSwitch').props.value).toBe('left')
		expect(byId('email-change-proof')[0].type).toBe('QPInput')
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange('right') })
		expect(byId('email-change-proof')[0].type).toBe('QPCodeInput')
	})

	test('tocar el método elegido no lo apaga', async () => {
		await toVerify()
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange(null) })
		expect(tree.root.findByType('QPSwitch').props.value).toBe('left')
	})

	test('una sola prueba no pinta selector', async () => {
		userApi.startEmailChange.mockResolvedValue({ success: true, data: { ...STARTED, methods: ['old_email'] } })
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(tree.root.findAllByType('QPSwitch')).toHaveLength(0)
		expect(hasText('Te enviamos este código a tu correo actual.')).toBe(true)
	})

	test('el código del correo actual ya salió, así que ofrece otro sin volver al paso 1', async () => {
		userApi.startEmailChange.mockResolvedValue({ success: true, data: { ...STARTED, methods: ['old_email'] } })
		userApi.sendEmailChangeCode.mockResolvedValue({ success: true, data: { ok: true } })
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(one('email-change-send-code').props.title).toBe('Enviar otro código')
		await press('email-change-send-code')
		expect(userApi.sendEmailChangeCode).toHaveBeenCalledWith({ channel: 'old_email' })
		expect(userApi.startEmailChange).toHaveBeenCalledTimes(1)
		expect(byId('email-change-confirm')).toHaveLength(1)
	})

	test('con la app autenticadora no hay código que pedir', async () => {
		await toVerify()
		expect(byId('email-change-send-code')).toHaveLength(0)
	})

	test('Telegram pide el código por el bot', async () => {
		userApi.startEmailChange.mockResolvedValue({ success: true, data: { ...STARTED, methods: ['telegram'] } })
		userApi.sendEmailChangeCode.mockResolvedValue({ success: true, data: { ok: true } })
		await open()
		await fillForm()
		await press('email-change-continue')
		expect(one('email-change-send-code').props.title).toBe('Enviarme el código por Telegram')
		await press('email-change-send-code')
		expect(userApi.sendEmailChangeCode).toHaveBeenCalledWith({ channel: 'telegram' })
		expect(one('email-change-send-code').props.title).toBe('Enviar otro código')
	})

	test('acepta un código de recuperación como prueba', async () => {
		userApi.confirmEmailChange.mockResolvedValue({ success: true, data: { ok: true, pending: PENDING }, status: 201 })
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', 'abcd-2345')
		await press('email-change-confirm')
		expect(userApi.confirmEmailChange).toHaveBeenCalledWith({ new_email_code: '123456', proof: { type: 'totp', code: 'ABCD-2345' } })
	})

	test('no deja confirmar con un código a medias', async () => {
		await toVerify()
		await typeCode('email-change-new-email-code', '12345')
		await type('email-change-proof', '654321')
		expect(one('email-change-confirm').props.disabled).toBe(true)
	})

	test('confirmar lleva al cambio en curso aunque la recarga no llegue', async () => {
		userApi.confirmEmailChange.mockResolvedValue({ success: true, data: { ok: true, pending: PENDING }, status: 201 })
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', '654321')
		userApi.getEmailChangeState.mockResolvedValue({ success: false, error: 'x' })
		await press('email-change-confirm')
		expect(hasText('Tu correo cambiará a nu***@e***.com')).toBe(true)
		expect(toast.success).toHaveBeenCalledTimes(1)
	})

	test('un código del correo nuevo incorrecto vacía solo ese campo', async () => {
		userApi.confirmEmailChange.mockResolvedValue(failWith('NEW_EMAIL_CODE_INVALID', 422))
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', '654321')
		await press('email-change-confirm')
		expect(one('email-change-new-email-code').props.code).toBe('')
		expect(one('email-change-proof').props.value).toBe('654321')
	})

	test('una prueba incorrecta vacía solo ese campo', async () => {
		userApi.confirmEmailChange.mockResolvedValue(failWith('PROOF_INVALID', 422))
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', '654321')
		await press('email-change-confirm')
		expect(one('email-change-new-email-code').props.code).toBe('123456')
		expect(one('email-change-proof').props.value).toBe('')
	})

	test.each(['EMAIL_CHANGE_EXPIRED', 'TOO_MANY_ATTEMPTS'])('%s vuelve al paso 1', async (code) => {
		userApi.confirmEmailChange.mockResolvedValue(failWith(code, code === 'TOO_MANY_ATTEMPTS' ? 429 : 410))
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', '654321')
		await press('email-change-confirm')
		expect(byId('email-change-continue')).toHaveLength(1)
	})

	test('si el correo se ocupó al confirmar vuelve al paso 1 a elegir otro', async () => {
		userApi.confirmEmailChange.mockResolvedValue(failWith('EMAIL_TAKEN', 409))
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', '654321')
		await press('email-change-confirm')
		expect(one('email-change-new-email').props.value).toBe(' nuevo@ejemplo.com ')
		expect(toast.error).toHaveBeenCalledWith('Ese correo no está disponible.', undefined)
	})

	test('PROOF_NOT_ALLOWED relee qué pruebas valen', async () => {
		userApi.confirmEmailChange.mockResolvedValue(failWith('PROOF_NOT_ALLOWED'))
		await toVerify()
		await typeCode('email-change-new-email-code', '123456')
		await type('email-change-proof', '654321')
		serve({ ...STATE, methods: ['telegram'] })
		await press('email-change-confirm')
		expect(tree.root.findAllByType('QPSwitch')).toHaveLength(0)
		expect(byId('email-change-proof')[0].type).toBe('QPCodeInput')
	})

	test('sin Telegram sugiere revisar el bot', async () => {
		userApi.startEmailChange.mockResolvedValue({ success: true, data: { ...STARTED, methods: ['telegram'] } })
		userApi.sendEmailChangeCode.mockResolvedValue(failWith('TELEGRAM_UNAVAILABLE', 502))
		await open()
		await fillForm()
		await press('email-change-continue')
		await press('email-change-send-code')
		expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('bloqueado el bot'), undefined)
		expect(one('email-change-send-code').props.title).toBe('Enviarme el código por Telegram')
	})
})

describe('cambio en curso', () => {

	beforeEach(() => { serve({ ...STATE, can_start: false, pending: PENDING }) })

	test('avisa de lo que va a pasar', async () => {
		await open()
		expect(hasText('Tu correo cambiará a nu***@e***.com')).toBe(true)
		expect(hasText('Al completarse se cerrará la sesión')).toBe(true)
		expect(hasText('El acceso con biometría dejará de funcionar')).toBe(true)
	})

	test('anota el correo actual para reconocer la biometría vieja', async () => {
		await open()
		expect(rememberEmailBeforeChange).toHaveBeenCalledWith('viejo@ejemplo.com')
	})

	test('la prueba no aparece hasta pedir cancelar', async () => {
		await open()
		expect(byId('email-change-proof')).toHaveLength(0)
		await press('email-change-cancel')
		expect(byId('email-change-proof')).toHaveLength(1)
		expect(byId('email-change-confirm-cancel')).toHaveLength(1)
	})

	test('Telegram pide el código con el propósito de cancelar', async () => {
		serve({ ...STATE, can_start: false, pending: { ...PENDING, cancel_methods: ['telegram'] } })
		userApi.sendEmailChangeCode.mockResolvedValue({ success: true, data: { ok: true } })
		await open()
		await press('email-change-cancel')
		await press('email-change-send-code')
		expect(userApi.sendEmailChangeCode).toHaveBeenCalledWith({ channel: 'telegram', purpose: 'cancel' })
	})

	test('sin factor pide el código al correo actual', async () => {
		serve({ ...STATE, can_start: false, pending: { ...PENDING, cancel_methods: ['old_email'] } })
		userApi.sendEmailChangeCode.mockResolvedValue({ success: true, data: { ok: true } })
		await open()
		await press('email-change-cancel')
		expect(one('email-change-send-code').props.title).toBe('Enviarme el código al correo')
		await press('email-change-send-code')
		expect(userApi.sendEmailChangeCode).toHaveBeenCalledWith({ channel: 'old_email', purpose: 'cancel' })
	})

	test('cancelar borra la anotación y vuelve atrás', async () => {
		userApi.cancelEmailChange.mockResolvedValue({ success: true, data: { ok: true } })
		await open()
		await press('email-change-cancel')
		await type('email-change-proof', '654321')
		await press('email-change-confirm-cancel')
		expect(userApi.cancelEmailChange).toHaveBeenCalledWith({ proof: { type: 'totp', code: '654321' } })
		expect(forgetEmailBeforeChange).toHaveBeenCalledTimes(1)
		expect(mockGoBack).toHaveBeenCalledTimes(1)
	})

	test('una prueba incorrecta no cancela nada y deja reintentar', async () => {
		userApi.cancelEmailChange.mockResolvedValue(failWith('PROOF_INVALID', 422))
		await open()
		await press('email-change-cancel')
		await type('email-change-proof', '654321')
		await press('email-change-confirm-cancel')
		expect(one('email-change-proof').props.value).toBe('')
		expect(one('email-change-proof').props.style).toEqual(expect.objectContaining({ borderWidth: 1 }))
		expect(forgetEmailBeforeChange).not.toHaveBeenCalled()
		expect(mockLogout).not.toHaveBeenCalled()
	})

	test('EMAIL_CHANGE_NOT_FOUND relee: ya no hay nada que cancelar', async () => {
		userApi.cancelEmailChange.mockResolvedValue(failWith('EMAIL_CHANGE_NOT_FOUND', 404))
		await open()
		await press('email-change-cancel')
		await type('email-change-proof', '654321')
		serve(STATE)
		await press('email-change-confirm-cancel')
		expect(byId('email-change-continue')).toHaveLength(1)
	})
})
