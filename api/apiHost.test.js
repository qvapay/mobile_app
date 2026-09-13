/**
 * @jest-environment node
 *
 * apiHost: en dev, si la LAN no contesta en el timeout, el cliente pasa a
 * producción para toda la sesión; cualquier respuesta HTTP (aunque sea 500)
 * mantiene la LAN; fuera de dev no se sondea nunca.
 */
jest.mock('../config', () => ({
	__esModule: true,
	default: {
		API_BASE_URL: 'http://10.0.0.208:3000/api',
		API_PROD_URL: 'https://api.qvapay.com',
		API_DEV_PROBE_TIMEOUT: 50,
		API_TIMEOUT: 20000,
	},
}))

const LOCAL = 'http://10.0.0.208:3000/api'
const PROD = 'https://api.qvapay.com'

const originalEnv = process.env.NODE_ENV
const originalDev = global.__DEV__
const originalFetch = global.fetch

const load = ({ dev, env }) => {
	global.__DEV__ = dev
	process.env.NODE_ENV = env
	let mod
	jest.isolateModules(() => { mod = require('./apiHost') })
	return mod
}

afterEach(() => {
	process.env.NODE_ENV = originalEnv
	global.__DEV__ = originalDev
	global.fetch = originalFetch
})

test('sin respuesta en el timeout → producción el resto de la sesión', async () => {
	global.fetch = jest.fn((_url, { signal }) => new Promise((_, reject) => {
		signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
	}))
	const host = load({ dev: true, env: 'development' })
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

	expect(host.getApiBaseUrl()).toBe(LOCAL)
	await expect(host.ensureApiHost()).resolves.toBe(PROD)
	expect(host.getApiBaseUrl()).toBe(PROD)
	expect(host.isUsingFallbackHost()).toBe(true)
	expect(global.fetch).toHaveBeenCalledTimes(1)
	expect(global.fetch.mock.calls[0][0]).toBe(`${LOCAL}/status`)

	// Ya en producción: no vuelve a sondear
	await expect(host.ensureApiHost()).resolves.toBe(PROD)
	expect(global.fetch).toHaveBeenCalledTimes(1)
	warn.mockRestore()
})

test('error de red inmediato también cae a producción', async () => {
	global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')))
	const host = load({ dev: true, env: 'development' })
	jest.spyOn(console, 'warn').mockImplementation(() => {})
	await expect(host.ensureApiHost()).resolves.toBe(PROD)
})

test('cualquier respuesta HTTP mantiene la LAN, aunque sea un 500', async () => {
	global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 }))
	const host = load({ dev: true, env: 'development' })
	await expect(host.ensureApiHost()).resolves.toBe(LOCAL)
	expect(host.isUsingFallbackHost()).toBe(false)
})

test('las peticiones concurrentes comparten UNA sonda', async () => {
	let resolveFetch
	global.fetch = jest.fn(() => new Promise(resolve => { resolveFetch = resolve }))
	const host = load({ dev: true, env: 'development' })
	const a = host.ensureApiHost()
	const b = host.ensureApiHost()
	expect(global.fetch).toHaveBeenCalledTimes(1)
	resolveFetch({ ok: true, status: 200 })
	await expect(Promise.all([a, b])).resolves.toEqual([LOCAL, LOCAL])
})

test('fuera de dev no sondea jamás', async () => {
	global.fetch = jest.fn()
	const host = load({ dev: false, env: 'production' })
	await expect(host.ensureApiHost()).resolves.toBe(LOCAL) // el mock de config fija la base; lo relevante es que no toca fetch
	expect(global.fetch).not.toHaveBeenCalled()
})

test('bajo jest (NODE_ENV=test) tampoco sondea', async () => {
	global.fetch = jest.fn()
	const host = load({ dev: true, env: 'test' })
	await host.ensureApiHost()
	expect(global.fetch).not.toHaveBeenCalled()
})
