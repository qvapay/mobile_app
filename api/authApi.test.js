/**
 * Unit tests for api/authApi.js — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { authApi } from './authApi'
import { apiClient } from './client'

jest.mock('./client', () => ({
	apiClient: {
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		patch: jest.fn(),
		delete: jest.fn()
	}
}))

// Builds an axios-like error carrying a server response
const apiError = (status, data) => Object.assign(new Error('Request failed'), { response: { status, data } })

// Builds an axios-like network error (no response at all)
const networkError = (message = 'Network Error') => new Error(message)

beforeEach(() => { jest.clearAllMocks() })

describe('authApi.login', () => {

	test('posts credentials with remember flag and empty two_factor_code by default', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { accessToken: 'tok', token_type: 'Bearer', me: { uuid: 'u1' } } })

		await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
			email: 'a@b.com',
			password: 'secret',
			two_factor_code: '',
			remember: true
		})
	})

	test('returns accessToken, tokenType and me on a 200 login', async () => {
		const me = { uuid: 'u1', username: 'erich' }
		apiClient.post.mockResolvedValue({ status: 200, data: { accessToken: 'tok-123', token_type: 'Bearer', me } })

		const result = await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(result).toEqual({
			success: true,
			data: { accessToken: 'tok-123', token_type: 'Bearer', me },
			accessToken: 'tok-123',
			tokenType: 'Bearer',
			me,
			security_warning: null
		})
	})

	test('passes through a security_warning when the backend sends one', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { accessToken: 't', token_type: 'Bearer', me: {}, security_warning: 'leaked-password' } })

		const result = await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(result.security_warning).toBe('leaked-password')
	})

	test('returns a 202 prelogin result when a 2FA challenge is pending', async () => {
		apiClient.post.mockResolvedValue({ status: 202, data: { notified: true, has_otp: true } })

		const result = await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(result).toEqual({ status: 202, success: true, notified: true, has_otp: true })
	})

	test('defaults has_otp to false on 202 when the backend omits it', async () => {
		apiClient.post.mockResolvedValue({ status: 202, data: { notified: true } })

		const result = await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(result.has_otp).toBe(false)
	})

	test('sends the two_factor_code on the second phase of the 2FA flow', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { accessToken: 't', token_type: 'Bearer', me: {} } })

		await authApi.login({ email: 'a@b.com', password: 'secret', two_factor_code: '1234' })

		expect(apiClient.post).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ two_factor_code: '1234' }))
	})

	test('returns the API error message, status and action on a rejected login', async () => {
		apiClient.post.mockRejectedValue(apiError(401, { message: 'Credenciales inválidas', action: 'reset_password' }))

		const result = await authApi.login({ email: 'a@b.com', password: 'bad' })

		expect(result).toEqual({
			success: false,
			error: 'Credenciales inválidas',
			details: { message: 'Credenciales inválidas', action: 'reset_password' },
			status: 401,
			action: 'reset_password'
		})
	})

	test('falls back to errorData.error and then the Spanish default message', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Email requerido' }))
		expect((await authApi.login({ email: '', password: 'x' })).error).toBe('Email requerido')

		apiClient.post.mockRejectedValue(apiError(500, {}))
		const result = await authApi.login({ email: 'a@b.com', password: 'x' })
		expect(result.error).toBe('No se pudo iniciar sesión')
		expect(result.action).toBeNull()
	})

	test('returns the raw error message with null status on a network error', async () => {
		apiClient.post.mockRejectedValue(networkError('timeout of 20000ms exceeded'))

		const result = await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(result).toEqual({ success: false, error: 'timeout of 20000ms exceeded', status: null })
	})

	test('falls back to the friendly connection message when the error has no message', async () => {
		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))

		const result = await authApi.login({ email: 'a@b.com', password: 'secret' })

		expect(result.error).toBe('No se ha podido conectar al servidor')
	})
})

describe('authApi.requestPin', () => {

	test('posts email and password and returns the confirmation payload', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { message: 'PIN enviado' } })

		const result = await authApi.requestPin({ email: 'a@b.com', password: 'secret' })

		expect(apiClient.post).toHaveBeenCalledWith('/auth/request-pin', { email: 'a@b.com', password: 'secret' })
		expect(result).toEqual({ success: true, data: { message: 'PIN enviado' } })
	})

	test('returns the API error message and status on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(429, { message: 'Demasiados intentos' }))

		const result = await authApi.requestPin({ email: 'a@b.com', password: 'secret' })

		expect(result).toEqual({
			success: false,
			error: 'Demasiados intentos',
			details: { message: 'Demasiados intentos' },
			status: 429
		})
	})

	test('falls back to the Spanish default when the response has no message', async () => {
		apiClient.post.mockRejectedValue(apiError(400, {}))

		const result = await authApi.requestPin({ email: 'a@b.com', password: 'secret' })

		expect(result.error).toBe('No se pudo solicitar el PIN')
	})

	// LATENT BUG: the network-error branch reads `error.response.status` without a
	// guard, so when there is no response the catch itself throws a TypeError and
	// the promise rejects instead of resolving the fallback object.
	test('rejects with a TypeError on a network error (documents current unguarded catch)', async () => {
		apiClient.post.mockRejectedValue(networkError())

		await expect(authApi.requestPin({ email: 'a@b.com', password: 'secret' })).rejects.toThrow(TypeError)
	})
})

describe('authApi.logout', () => {

	test('posts to /auth/logout and returns success with the response data', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { message: 'bye' } })

		const result = await authApi.logout()

		expect(apiClient.post).toHaveBeenCalledWith('/auth/logout')
		expect(result).toEqual({ success: true, data: { message: 'bye' } })
	})

	test('still resolves success true when the server rejects (best-effort logout)', async () => {
		apiClient.post.mockRejectedValue(apiError(403, { error: 'Token inválido' }))

		const result = await authApi.logout()

		expect(result).toEqual({ success: true, error: 'Request failed', status: 403 })
	})

	// LATENT BUG: the catch reads `error.response.status` without a guard, so a
	// network error (no response) makes logout reject with a TypeError instead of
	// resolving success true as the best-effort contract promises.
	test('rejects with a TypeError on a network error (documents current unguarded catch)', async () => {
		apiClient.post.mockRejectedValue(networkError())

		await expect(authApi.logout()).rejects.toThrow(TypeError)
	})
})

describe('authApi.register', () => {

	test('posts the registration payload and returns message and user', async () => {
		const user = { uuid: 'new-uuid', email: 'a@b.com' }
		apiClient.post.mockResolvedValue({ status: 201, data: { message: 'Registrado', user } })

		const result = await authApi.register({
			name: 'Ana',
			lastname: 'Pérez',
			email: 'a@b.com',
			password: 'secret123',
			invite: 'erich',
			source: 'ads'
		})

		expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
			name: 'Ana',
			lastname: 'Pérez',
			email: 'a@b.com',
			password: 'secret123',
			invite: 'erich',
			source: 'ads',
			terms: true
		})
		expect(result).toEqual({ success: true, data: { message: 'Registrado', user }, message: 'Registrado', user })
	})

	test('omits invite and source when absent and defaults terms to true', async () => {
		apiClient.post.mockResolvedValue({ status: 201, data: { message: 'ok', user: {} } })

		await authApi.register({ name: 'Ana', lastname: 'Pérez', email: 'a@b.com', password: 'secret123' })

		const payload = apiClient.post.mock.calls[0][1]
		expect(payload.invite).toBeUndefined()
		expect(payload.source).toBeUndefined()
		expect(payload.terms).toBe(true)
	})

	// LATENT QUIRK: `terms: credentials.terms || true` can never send false —
	// an explicit terms: false is coerced to true.
	test('coerces an explicit terms: false to true (documents current behavior)', async () => {
		apiClient.post.mockResolvedValue({ status: 201, data: { message: 'ok', user: {} } })

		await authApi.register({ name: 'Ana', lastname: 'Pérez', email: 'a@b.com', password: 'secret123', terms: false })

		expect(apiClient.post.mock.calls[0][1].terms).toBe(true)
	})

	test('prefers errorData.error over errorData.message on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Email en uso', message: 'otro' }))

		const result = await authApi.register({ name: 'A', lastname: 'B', email: 'a@b.com', password: 'x' })

		expect(result).toEqual({ success: false, error: 'Email en uso', details: { error: 'Email en uso', message: 'otro' } })
	})

	test('returns the network fallback message on a connection error', async () => {
		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))

		const result = await authApi.register({ name: 'A', lastname: 'B', email: 'a@b.com', password: 'x' })

		expect(result).toEqual({ success: false, error: 'Ha ocurrido un error de red' })
	})
})

describe('authApi.confirmRegistration', () => {

	test('posts uuid, email and pin and returns the confirmation message', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { message: 'Email verificado' } })

		const result = await authApi.confirmRegistration({ uuid: 'u-1', email: 'a@b.com', pin: '1234' })

		expect(apiClient.post).toHaveBeenCalledWith('/auth/confirm-registration', { uuid: 'u-1', email: 'a@b.com', pin: '1234' })
		expect(result).toEqual({ success: true, data: { message: 'Email verificado' }, message: 'Email verificado' })
	})

	test('returns the API error with details and Spanish fallback on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { message: 'PIN incorrecto' }))
		expect((await authApi.confirmRegistration({ uuid: 'u', email: 'e', pin: '0' })).error).toBe('PIN incorrecto')

		apiClient.post.mockRejectedValue(apiError(400, {}))
		expect((await authApi.confirmRegistration({ uuid: 'u', email: 'e', pin: '0' })).error).toBe('No se pudo confirmar el registro')
	})

	test('returns error.message on a network error', async () => {
		apiClient.post.mockRejectedValue(networkError('ECONNREFUSED'))

		const result = await authApi.confirmRegistration({ uuid: 'u', email: 'e', pin: '0' })

		expect(result).toEqual({ success: false, error: 'ECONNREFUSED' })
	})
})

describe('authApi passkeys', () => {

	test('getPasskeys returns the unwrapped passkeys array', async () => {
		const passkeys = [{ id: 1, name: 'iPhone' }]
		apiClient.get.mockResolvedValue({ status: 200, data: { passkeys } })

		const result = await authApi.getPasskeys()

		expect(apiClient.get).toHaveBeenCalledWith('/auth/passkey/list')
		expect(result).toEqual({ success: true, data: passkeys })
	})

	test('getPasskeys returns the server error or the Spanish fallback', async () => {
		apiClient.get.mockRejectedValue(apiError(500, { error: 'Boom' }))
		expect((await authApi.getPasskeys()).error).toBe('Boom')

		apiClient.get.mockRejectedValue(networkError())
		expect(await authApi.getPasskeys()).toEqual({ success: false, error: 'Error al obtener passkeys' })
	})

	test('deletePasskey posts the id and returns bare success', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { ok: true } })

		const result = await authApi.deletePasskey(7)

		expect(apiClient.post).toHaveBeenCalledWith('/auth/passkey/delete', { id: 7 })
		expect(result).toEqual({ success: true })
	})

	test('deletePasskey returns the Spanish fallback on failure', async () => {
		apiClient.post.mockRejectedValue(networkError())

		expect(await authApi.deletePasskey(7)).toEqual({ success: false, error: 'Error al eliminar passkey' })
	})

	test('getPasskeyRegisterOptions posts the passkey name and returns the options', async () => {
		const options = { challenge: 'abc' }
		apiClient.post.mockResolvedValue({ status: 200, data: options })

		const result = await authApi.getPasskeyRegisterOptions('iPhone de Ana')

		expect(apiClient.post).toHaveBeenCalledWith('/auth/passkey/register-options', { name: 'iPhone de Ana' })
		expect(result).toEqual({ success: true, data: options })
	})

	test('getPasskeyRegisterOptions returns the Spanish fallback on failure', async () => {
		apiClient.post.mockRejectedValue(networkError())

		expect(await authApi.getPasskeyRegisterOptions('x')).toEqual({ success: false, error: 'Error al generar opciones de registro' })
	})

	test('verifyPasskeyRegistration posts the attestation as-is', async () => {
		const attestation = { id: 'cred-1', rawId: 'raw' }
		apiClient.post.mockResolvedValue({ status: 200, data: { verified: true } })

		const result = await authApi.verifyPasskeyRegistration(attestation)

		expect(apiClient.post).toHaveBeenCalledWith('/auth/passkey/register-verify', attestation)
		expect(result).toEqual({ success: true, data: { verified: true } })
	})

	test('verifyPasskeyRegistration returns the Spanish fallback on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(400, {}))

		expect(await authApi.verifyPasskeyRegistration({})).toEqual({ success: false, error: 'Error al verificar el registro' })
	})

	test('getPasskeyLoginOptions posts with no body and returns the options', async () => {
		const options = { challenge: 'xyz' }
		apiClient.post.mockResolvedValue({ status: 200, data: options })

		const result = await authApi.getPasskeyLoginOptions()

		expect(apiClient.post).toHaveBeenCalledWith('/auth/passkey/login-options')
		expect(result).toEqual({ success: true, data: options })
	})

	test('getPasskeyLoginOptions returns the Spanish fallback on failure', async () => {
		apiClient.post.mockRejectedValue(networkError())

		expect(await authApi.getPasskeyLoginOptions()).toEqual({ success: false, error: 'Error al generar opciones de autenticación' })
	})

	test('verifyPasskeyLogin mirrors a 200 login result on success', async () => {
		const me = { uuid: 'u1' }
		const assertion = { id: 'cred-1' }
		apiClient.post.mockResolvedValue({ status: 200, data: { accessToken: 'tok', token_type: 'Bearer', me } })

		const result = await authApi.verifyPasskeyLogin(assertion)

		expect(apiClient.post).toHaveBeenCalledWith('/auth/passkey/login-verify', assertion)
		expect(result).toEqual({
			success: true,
			data: { accessToken: 'tok', token_type: 'Bearer', me },
			accessToken: 'tok',
			tokenType: 'Bearer',
			me
		})
	})

	test('verifyPasskeyLogin returns the server error or the Spanish fallback', async () => {
		apiClient.post.mockRejectedValue(apiError(401, { error: 'Passkey inválida' }))
		expect((await authApi.verifyPasskeyLogin({})).error).toBe('Passkey inválida')

		apiClient.post.mockRejectedValue(networkError())
		expect((await authApi.verifyPasskeyLogin({})).error).toBe('Error al verificar la autenticación')
	})
})

describe('authApi.resetPassword', () => {

	test('posts the email and returns the generic confirmation message', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { message: 'Si el email existe, enviamos instrucciones' } })

		const result = await authApi.resetPassword({ email: 'a@b.com' })

		expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', { email: 'a@b.com' })
		expect(result).toEqual({
			success: true,
			data: { message: 'Si el email existe, enviamos instrucciones' },
			message: 'Si el email existe, enviamos instrucciones'
		})
	})

	test('returns the API error with details and Spanish fallback on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(429, { error: 'Demasiadas solicitudes' }))
		expect((await authApi.resetPassword({ email: 'a@b.com' })).error).toBe('Demasiadas solicitudes')

		apiClient.post.mockRejectedValue(apiError(400, {}))
		expect((await authApi.resetPassword({ email: 'a@b.com' })).error).toBe('No se pudo solicitar el restablecimiento de contraseña')
	})

	test('returns the network fallback message on a connection error', async () => {
		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))

		expect(await authApi.resetPassword({ email: 'a@b.com' })).toEqual({ success: false, error: 'Ha ocurrido un error de red' })
	})
})
