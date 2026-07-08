/**
 * Unit tests for api/userApi.js — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { userApi } from './userApi'
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

const ok = (data, status = 200) => ({ status, data })

beforeEach(() => { jest.clearAllMocks() })

describe('userApi.heartbeat', () => {

	test('posts an empty silent body when no tracked users are given', async () => {
		apiClient.post.mockResolvedValue(ok({ statuses: {} }))

		const result = await userApi.heartbeat()

		expect(apiClient.post).toHaveBeenCalledWith('/user/heartbeat', {}, { silent: true })
		expect(result).toEqual({ success: true, data: { statuses: {} } })
	})

	test('posts the trackedUserIds when provided', async () => {
		apiClient.post.mockResolvedValue(ok({ statuses: { 'u-1': true } }))

		await userApi.heartbeat(['u-1', 'u-2'])

		expect(apiClient.post).toHaveBeenCalledWith('/user/heartbeat', { trackedUserIds: ['u-1', 'u-2'] }, { silent: true })
	})

	test('returns the error message on failure', async () => {
		apiClient.post.mockRejectedValue(networkError('timeout'))

		expect(await userApi.heartbeat()).toEqual({ success: false, error: 'timeout' })
	})
})

describe('userApi.searchUser', () => {

	test('posts the query and returns the matched profile with status', async () => {
		apiClient.post.mockResolvedValue(ok({ uuid: 'u-1', username: 'erich' }))

		const result = await userApi.searchUser('erich')

		expect(apiClient.post).toHaveBeenCalledWith('/user/search', { query: 'erich' })
		expect(result).toEqual({ success: true, data: { uuid: 'u-1', username: 'erich' }, status: 200 })
	})

	test('returns error.message and the response status on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(404, { error: 'No encontrado' }))

		expect(await userApi.searchUser('nope')).toEqual({ success: false, error: 'Request failed', status: 404 })
	})

	test('survives a network error with undefined status', async () => {
		apiClient.post.mockRejectedValue(networkError())

		expect(await userApi.searchUser('erich')).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('userApi KYC', () => {

	test('requestKYCSession unwraps the nested verification URL', async () => {
		apiClient.post.mockResolvedValue(ok({ data: 'https://verify.didit.me/session/abc' }))

		const result = await userApi.requestKYCSession()

		expect(apiClient.post).toHaveBeenCalledWith('/user/kyc')
		expect(result).toEqual({ success: true, data: 'https://verify.didit.me/session/abc', status: 200 })
	})

	test('requestKYCSession returns the API error or Spanish fallback', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { error: 'KYC ya iniciado' }))
		expect(await userApi.requestKYCSession()).toEqual({ success: false, error: 'KYC ya iniciado', status: 400 })

		apiClient.post.mockRejectedValue(apiError(500, {}))
		expect((await userApi.requestKYCSession()).error).toBe('No se pudo obtener la sesión de verificación')
	})

	test('requestKYCSession returns the network fallback on a connection error', async () => {
		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))

		expect(await userApi.requestKYCSession()).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})

	test('getKYCStatus returns the unwrapped data plus the raw body', async () => {
		const body = { data: { uuid: 'u-1', KYC: { result: 'passed' } } }
		apiClient.get.mockResolvedValue(ok(body))

		const result = await userApi.getKYCStatus()

		expect(apiClient.get).toHaveBeenCalledWith('/user/kyc')
		expect(result).toEqual({ success: true, data: body.data, raw: body, status: 200 })
	})

	test('getKYCStatus includes the response body as details on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(404, { error: 'Sin KYC' }))

		expect(await userApi.getKYCStatus()).toEqual({
			success: false,
			error: 'Request failed',
			status: 404,
			details: { error: 'Sin KYC' }
		})
	})
})

describe('userApi profile', () => {

	test('getUserProfile fetches /user/extended', async () => {
		apiClient.get.mockResolvedValue(ok({ uuid: 'u-1', balance: 10 }))

		const result = await userApi.getUserProfile()

		expect(apiClient.get).toHaveBeenCalledWith('/user/extended')
		expect(result).toEqual({ success: true, data: { uuid: 'u-1', balance: 10 }, status: 200 })
	})

	test('getUserProfile returns error.message and status on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(403, {}))

		expect(await userApi.getUserProfile()).toEqual({ success: false, error: 'Request failed', status: 403 })
	})

	test('updateUser posts the partial fields as-is', async () => {
		apiClient.post.mockResolvedValue(ok({ uuid: 'u-1', name: 'Ana' }))

		const result = await userApi.updateUser({ name: 'Ana', bio: 'hola' })

		expect(apiClient.post).toHaveBeenCalledWith('/user/update', { name: 'Ana', bio: 'hola' })
		expect(result).toEqual({ success: true, data: { uuid: 'u-1', name: 'Ana' }, status: 200 })
	})

	test('updateUser returns error.message on failure', async () => {
		apiClient.post.mockRejectedValue(networkError('offline'))

		expect(await userApi.updateUser({ name: 'Ana' })).toEqual({ success: false, error: 'offline', status: undefined })
	})

	test('changePassword puts the password payload', async () => {
		apiClient.put.mockResolvedValue(ok({ message: 'ok' }))

		const result = await userApi.changePassword({ old_password: 'a', new_password: 'b' })

		expect(apiClient.put).toHaveBeenCalledWith('/user/update/password', { old_password: 'a', new_password: 'b' })
		expect(result).toEqual({ success: true, data: { message: 'ok' }, status: 200 })
	})

	test('changePassword returns error.message and status on failure', async () => {
		apiClient.put.mockRejectedValue(apiError(422, {}))

		expect(await userApi.changePassword({ old_password: 'a', new_password: 'b' })).toEqual({ success: false, error: 'Request failed', status: 422 })
	})
})

describe('userApi phone and telegram verification', () => {

	test('verifyPhone posts the phone data', async () => {
		apiClient.post.mockResolvedValue(ok({ sent: true }))

		const result = await userApi.verifyPhone({ phone: '5355555555', country: 'CU' })

		expect(apiClient.post).toHaveBeenCalledWith('/user/verify/phone', { phone: '5355555555', country: 'CU' })
		expect(result).toEqual({ success: true, data: { sent: true }, status: 200 })
	})

	test('verifyPhone returns error.message and status on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(400, {}))

		expect(await userApi.verifyPhone({ phone: 'x', country: 'CU' })).toEqual({ success: false, error: 'Request failed', status: 400 })
	})

	test('removePhone uses PUT on the verification path', async () => {
		apiClient.put.mockResolvedValue(ok({ removed: true }))

		const result = await userApi.removePhone()

		expect(apiClient.put).toHaveBeenCalledWith('/user/verify/phone')
		expect(result).toEqual({ success: true, data: { removed: true }, status: 200 })
	})

	test('getTelegramVerificationLink fetches the bot deep link', async () => {
		apiClient.get.mockResolvedValue(ok({ link: 'https://t.me/qvapaybot?start=abc' }))

		const result = await userApi.getTelegramVerificationLink()

		expect(apiClient.get).toHaveBeenCalledWith('/user/verify/telegram')
		expect(result).toEqual({ success: true, data: { link: 'https://t.me/qvapaybot?start=abc' }, status: 200 })
	})

	test('removeTelegram uses PUT on the verification path', async () => {
		apiClient.put.mockResolvedValue(ok({ removed: true }))

		const result = await userApi.removeTelegram()

		expect(apiClient.put).toHaveBeenCalledWith('/user/verify/telegram')
		expect(result).toEqual({ success: true, data: { removed: true }, status: 200 })
	})
})

describe('userApi referrals', () => {

	test('getReferrals fetches the referral data', async () => {
		apiClient.get.mockResolvedValue(ok({ referrals: [], earnings: 0 }))

		const result = await userApi.getReferrals()

		expect(apiClient.get).toHaveBeenCalledWith('/user/referrals')
		expect(result).toEqual({ success: true, data: { referrals: [], earnings: 0 }, status: 200 })
	})

	test('trackShareAttempt posts the channel and swallows failures silently', async () => {
		apiClient.post.mockResolvedValue(ok({ tracked: true }))
		expect(await userApi.trackShareAttempt('telegram')).toEqual({ success: true, data: { tracked: true } })
		expect(apiClient.post).toHaveBeenCalledWith('/user/referrals/share', { channel: 'telegram' })

		apiClient.post.mockRejectedValue(networkError())
		expect(await userApi.trackShareAttempt('sms')).toEqual({ success: false })
	})
})

describe('userApi gold', () => {

	test('getGoldCheckStatus unwraps response.data.user', async () => {
		const user = { golden_check: true, golden_expire: '2027-01-01' }
		apiClient.get.mockResolvedValue(ok({ user }))

		const result = await userApi.getGoldCheckStatus()

		expect(apiClient.get).toHaveBeenCalledWith('/user/gold')
		expect(result).toEqual({ success: true, data: user, status: 200 })
	})

	test('purchaseGold posts the purchase payload', async () => {
		apiClient.post.mockResolvedValue(ok({ message: 'Gold activado' }))

		const result = await userApi.purchaseGold({ uuid: 'u-1', duration: '1m' })

		expect(apiClient.post).toHaveBeenCalledWith('/user/gold', { uuid: 'u-1', duration: '1m' })
		expect(result).toEqual({ success: true, data: { message: 'Gold activado' }, status: 200 })
	})

	test('purchaseGold returns error.message and status on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(402, { error: 'Saldo insuficiente' }))

		expect(await userApi.purchaseGold({ uuid: 'u-1', duration: '1m' })).toEqual({ success: false, error: 'Request failed', status: 402 })
	})

	test('validateGoldReceipt posts the receipt payload', async () => {
		const receipt = { receipt: 'tok', platform: 'ios', productId: 'gold.1m', transactionId: 't-1' }
		apiClient.post.mockResolvedValue(ok({ golden_expire: '2027-01-01' }))

		const result = await userApi.validateGoldReceipt(receipt)

		expect(apiClient.post).toHaveBeenCalledWith('/user/gold/validate-receipt', receipt)
		expect(result).toEqual({ success: true, data: { golden_expire: '2027-01-01' }, status: 200 })
	})

	test('validateGoldReceipt returns the API error or the network fallback', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { error: 'Recibo inválido' }))
		expect(await userApi.validateGoldReceipt({})).toEqual({
			success: false,
			error: 'Recibo inválido',
			details: { error: 'Recibo inválido' },
			status: 400
		})

		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))
		expect((await userApi.validateGoldReceipt({})).error).toBe('Ha ocurrido un error de red')
	})
})

describe('userApi payment methods', () => {

	test('getPaymentMethods fetches the saved methods', async () => {
		const methods = [{ id: 1, coin: 'BANK_MLC' }]
		apiClient.get.mockResolvedValue(ok(methods))

		const result = await userApi.getPaymentMethods()

		expect(apiClient.get).toHaveBeenCalledWith('/user/payment-methods')
		expect(result).toEqual({ success: true, data: methods, status: 200 })
	})

	test('getPaymentMethods returns the API error with details on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(500, { message: 'Error interno' }))

		expect(await userApi.getPaymentMethods()).toEqual({
			success: false,
			error: 'Error interno',
			details: { message: 'Error interno' },
			status: 500
		})
	})

	test('createPaymentMethod succeeds on 201 and 200', async () => {
		const payload = { coin: 'BANK_MLC', details: { card: '1234' } }
		apiClient.post.mockResolvedValue(ok({ id: 9 }, 201))

		const result = await userApi.createPaymentMethod(payload)

		expect(apiClient.post).toHaveBeenCalledWith('/user/payment-methods', payload)
		expect(result).toEqual({ success: true, data: { id: 9 }, status: 201 })

		apiClient.post.mockResolvedValue(ok({ id: 10 }, 200))
		expect((await userApi.createPaymentMethod(payload)).success).toBe(true)
	})

	test('createPaymentMethod reports success false on any other 2xx status', async () => {
		apiClient.post.mockResolvedValue(ok({ id: 11 }, 202))

		expect(await userApi.createPaymentMethod({ coin: 'X', details: {} })).toEqual({ success: false, data: { id: 11 }, status: 202 })
	})

	test('createPaymentMethod returns the API error or the network fallback', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Datos inválidos' }))
		expect((await userApi.createPaymentMethod({})).error).toBe('Datos inválidos')

		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))
		expect((await userApi.createPaymentMethod({})).error).toBe('Ha ocurrido un error de red')
	})

	test('deletePaymentMethod sends the id in the DELETE request body', async () => {
		apiClient.delete.mockResolvedValue(ok({ deleted: true }))

		const result = await userApi.deletePaymentMethod(5)

		expect(apiClient.delete).toHaveBeenCalledWith('/user/payment-methods', { data: { id: 5 } })
		expect(result).toEqual({ success: true, data: { deleted: true }, status: 200 })
	})

	test('deletePaymentMethod returns the API error with details on failure', async () => {
		apiClient.delete.mockRejectedValue(apiError(404, { error: 'No existe' }))

		expect(await userApi.deletePaymentMethod(5)).toEqual({
			success: false,
			error: 'No existe',
			details: { error: 'No existe' },
			status: 404
		})
	})
})

describe('userApi contacts', () => {

	test('getContacts unwraps the contacts array', async () => {
		const contacts = [{ id: 1, name: 'Ana' }]
		apiClient.get.mockResolvedValue(ok({ contacts }))

		const result = await userApi.getContacts()

		expect(apiClient.get).toHaveBeenCalledWith('/user/contact')
		expect(result).toEqual({ success: true, data: contacts, status: 200 })
	})

	test('getContacts defaults to an empty array on an odd payload', async () => {
		apiClient.get.mockResolvedValue(ok({}))

		expect((await userApi.getContacts()).data).toEqual([])
	})

	test('getContacts returns the API error or the network fallback', async () => {
		apiClient.get.mockRejectedValue(apiError(500, {}))
		expect((await userApi.getContacts()).error).toBe('No se pudieron obtener los contactos')

		apiClient.get.mockRejectedValue(Object.assign(new Error(), { message: '' }))
		expect((await userApi.getContacts()).error).toBe('Ha ocurrido un error de red')
	})

	test('addContact posts the uuid and display name', async () => {
		apiClient.post.mockResolvedValue(ok({ id: 3 }))

		const result = await userApi.addContact('u-9', 'Ana')

		expect(apiClient.post).toHaveBeenCalledWith('/user/contact', { contact_uuid: 'u-9', name: 'Ana' })
		expect(result).toEqual({ success: true, data: { id: 3 }, status: 200 })
	})

	test('addContact returns the API error with details on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(409, { error: 'Ya es tu contacto' }))

		expect(await userApi.addContact('u-9', 'Ana')).toEqual({
			success: false,
			error: 'Ya es tu contacto',
			details: { error: 'Ya es tu contacto' },
			status: 409
		})
	})

	test('toggleFavoriteContact patches the contact id', async () => {
		apiClient.patch.mockResolvedValue(ok({ favorite: true }))

		const result = await userApi.toggleFavoriteContact(3)

		expect(apiClient.patch).toHaveBeenCalledWith('/user/contact', { contact_id: 3 })
		expect(result).toEqual({ success: true, data: { favorite: true }, status: 200 })
	})

	test('toggleFavoriteContact returns the API error without details on failure', async () => {
		apiClient.patch.mockRejectedValue(apiError(404, { error: 'No existe' }))

		expect(await userApi.toggleFavoriteContact(3)).toEqual({ success: false, error: 'No existe', status: 404 })
	})

	test('deleteContact sends contact_id in the DELETE request body', async () => {
		apiClient.delete.mockResolvedValue(ok({ deleted: true }))

		const result = await userApi.deleteContact(3)

		expect(apiClient.delete).toHaveBeenCalledWith('/user/contact', { data: { contact_id: 3 } })
		expect(result).toEqual({ success: true, data: { deleted: true }, status: 200 })
	})

	test('deleteContact returns the network fallback on a connection error', async () => {
		apiClient.delete.mockRejectedValue(Object.assign(new Error(), { message: '' }))

		expect(await userApi.deleteContact(3)).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})

	test('syncContacts posts the phone numbers under a phones key', async () => {
		const matches = [{ phone: '+5355555555', user: { uuid: 'u-1' } }]
		apiClient.post.mockResolvedValue(ok({ matches }))

		const result = await userApi.syncContacts(['+5355555555'])

		expect(apiClient.post).toHaveBeenCalledWith('/user/contacts/sync', { phones: ['+5355555555'] })
		expect(result).toEqual({ success: true, data: { matches } })
	})

	test('syncContacts returns the API error or the short network fallback', async () => {
		apiClient.post.mockRejectedValue(apiError(400, {}))
		expect((await userApi.syncContacts([])).error).toBe('No se pudieron sincronizar los contactos')

		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))
		expect(await userApi.syncContacts([])).toEqual({ success: false, error: 'Error de red' })
	})
})

describe('userApi 2FA', () => {

	test('generate2FA posts an empty body and returns the secret payload', async () => {
		const data = { secret: 'ABC123', otpauth_url: 'otpauth://totp/QvaPay' }
		apiClient.post.mockResolvedValue(ok(data))

		const result = await userApi.generate2FA()

		expect(apiClient.post).toHaveBeenCalledWith('/auth/create-2fa', {})
		expect(result).toEqual({ success: true, data, status: 200 })
	})

	test('generate2FA returns the API error with details on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { error: '2FA ya activo' }))

		expect(await userApi.generate2FA()).toEqual({
			success: false,
			error: '2FA ya activo',
			details: { error: '2FA ya activo' },
			status: 400
		})
	})

	test('activate2FA posts the code and secret', async () => {
		apiClient.post.mockResolvedValue(ok({ activated: true }))

		const result = await userApi.activate2FA({ code: '123456', secret: 'ABC123' })

		expect(apiClient.post).toHaveBeenCalledWith('/auth/create-2fa', { code: '123456', secret: 'ABC123' })
		expect(result).toEqual({ success: true, data: { activated: true }, status: 200 })
	})

	test('activate2FA falls back to the Spanish message on an empty error body', async () => {
		apiClient.post.mockRejectedValue(apiError(422, {}))

		expect((await userApi.activate2FA({ code: '000000', secret: 's' })).error).toBe('No se pudo activar el 2FA')
	})

	test('deactivate2FA posts an empty body to /auth/reset-2fa', async () => {
		apiClient.post.mockResolvedValue(ok({ reset: true }))

		const result = await userApi.deactivate2FA()

		expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-2fa', {})
		expect(result).toEqual({ success: true, data: { reset: true }, status: 200 })
	})

	test('deactivate2FA returns the network fallback on a connection error', async () => {
		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))

		expect(await userApi.deactivate2FA()).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})
})

describe('userApi.uploadAvatar', () => {

	test('posts multipart form data with the file and default avatar type', async () => {
		apiClient.post.mockResolvedValue(ok({ url: 'https://cdn/x.jpg', path: 'x.jpg' }))

		const result = await userApi.uploadAvatar({ file: { uri: 'file:///photo.jpg' } })

		const [url, formData, config] = apiClient.post.mock.calls[0]
		expect(url).toBe('/user/avatar')
		expect(formData).toBeInstanceOf(FormData)
		expect(formData.get('type')).toBe('avatar')
		expect(formData.has('file')).toBe(true)
		expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
		expect(result).toEqual({ success: true, data: { url: 'https://cdn/x.jpg', path: 'x.jpg' }, status: 200 })
	})

	test('sends the cover type when uploading a cover photo', async () => {
		apiClient.post.mockResolvedValue(ok({ url: 'u', path: 'p' }))

		await userApi.uploadAvatar({ file: { uri: 'file:///cover.jpg', name: 'cover.jpg', type: 'image/jpeg' }, uploadType: 'cover' })

		expect(apiClient.post.mock.calls[0][1].get('type')).toBe('cover')
	})

	test('returns the API error or the network fallback on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(413, { error: 'Imagen demasiado grande' }))
		expect((await userApi.uploadAvatar({ file: { uri: 'f' } })).error).toBe('Imagen demasiado grande')

		apiClient.post.mockRejectedValue(Object.assign(new Error(), { message: '' }))
		expect((await userApi.uploadAvatar({ file: { uri: 'f' } })).error).toBe('Ha ocurrido un error de red')
	})
})

describe('userApi notification settings', () => {

	test('getNotificationSettings fetches the server-side preferences', async () => {
		apiClient.get.mockResolvedValue(ok({ p2p: true, transactions: false }))

		const result = await userApi.getNotificationSettings()

		expect(apiClient.get).toHaveBeenCalledWith('/user/notifications')
		expect(result).toEqual({ success: true, data: { p2p: true, transactions: false }, status: 200 })
	})

	test('updateNotificationSettings posts the settings payload', async () => {
		apiClient.post.mockResolvedValue(ok({ saved: true }))

		const result = await userApi.updateNotificationSettings({ p2p: false })

		expect(apiClient.post).toHaveBeenCalledWith('/user/notifications', { p2p: false })
		expect(result).toEqual({ success: true, data: { saved: true }, status: 200 })
	})

	test('updateNotificationSettings returns error.message and status on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(500, {}))

		expect(await userApi.updateNotificationSettings({ p2p: false })).toEqual({ success: false, error: 'Request failed', status: 500 })
	})
})
