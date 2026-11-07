/**
 * El 401 con axios DE VERDAD: solo se sustituye el transporte. `isCurrentSession` lee el
 * bearer de `error.config.headers`, que en axios es un `AxiosHeaders`; si dejara de leerse,
 * ninguna sesión muerta se cerraría y client.test.js, que usa objetos planos, seguiría verde.
 * @jest-environment node
 */
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
jest.mock('react-native-device-info', () => ({
	getVersion: () => '1',
	getBuildNumber: () => '1',
	getSystemVersion: () => '1',
	getModel: () => 'x',
	getDeviceNameSync: () => 'x',
}))
jest.mock('react-native-keychain', () => ({
	getGenericPassword: jest.fn(),
	setGenericPassword: jest.fn(),
	resetGenericPassword: jest.fn(async () => { }),
	hasGenericPassword: jest.fn(),
}))
jest.mock('./apiHost', () => ({ ensureApiHost: jest.fn(async () => 'http://api.test') }))

import { AxiosError } from 'axios'
import * as Keychain from 'react-native-keychain'
import { apiClient, registerSessionExpiredHandler } from './client'

const storedToken = (password) => Keychain.getGenericPassword.mockResolvedValue(password ? { password } : false)
const unauthorized = async (config) => {
	throw new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_REQUEST, config, {}, { status: 401, data: { error: 'Unauthorized' }, config, headers: {} })
}
const failing = (request) => request.catch(error => error)

let onExpired

beforeEach(() => {
	jest.clearAllMocks()
	onExpired = jest.fn()
	registerSessionExpiredHandler(onExpired)
	apiClient.defaults.adapter = unauthorized
})
afterEach(() => { registerSessionExpiredHandler(null) })

test('a dead session ends: the bearer is readable on the real error', async () => {
	storedToken('tok-1')
	await failing(apiClient.get('/user/extended'))
	expect(Keychain.resetGenericPassword).toHaveBeenCalledTimes(1)
	expect(onExpired).toHaveBeenCalledTimes(1)
})

test('a new login survives the late 401 of a request from the old session', async () => {
	storedToken('tok-1')
	let respond
	apiClient.defaults.adapter = (config) => new Promise((resolve, reject) => { respond = () => unauthorized(config).catch(reject) })
	const request = failing(apiClient.get('/user/extended'))
	await new Promise(resolve => setTimeout(resolve, 0))

	storedToken('tok-2')
	respond()
	await request

	expect(Keychain.resetGenericPassword).not.toHaveBeenCalled()
	expect(onExpired).not.toHaveBeenCalled()
})

test('without a response the screen gets the translated notice, not the text of axios', async () => {
	apiClient.defaults.adapter = async (config) => { throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {}) }
	expect(await failing(apiClient.get('/user/update/email'))).toEqual({ message: 'No se ha podido conectar con el servidor' })
})

test('a request that went out anonymous keeps its hands off the session', async () => {
	storedToken('tok-1')
	await failing(apiClient.get('/wallet/history', { anonymous: true }))
	expect(Keychain.resetGenericPassword).not.toHaveBeenCalled()
	expect(onExpired).not.toHaveBeenCalled()
})
