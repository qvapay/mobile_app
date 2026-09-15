/**
 * @jest-environment node
 *
 * rpcRouter: prioridad, circuit breaker, rotación solo en errores de
 * infraestructura y el contrato clave del plan crypto — un nodo qvapay que
 * pasa a `enabled: true` gana por priority 0 aunque tenga peor latencia,
 * sin publicar versión nueva.
 */
import {
	createRpcRouter,
	isRetryableRpcError,
	AllRpcsFailedError,
	MAX_FAILURES,
	BREAKER_REOPEN_MS,
} from './rpcRouter'
import bundled from './bundled.json'

const makeRegistry = (rpcs) => ({
	version: 1,
	updated_at: '2026-09-03T00:00:00Z',
	chains: {
		tron: {
			kind: 'tron',
			native: { symbol: 'TRX', decimals: 6 },
			explorer: 'https://tronscan.org/#/transaction/{tx}',
			rpcs,
		},
	},
})

const RPCS = () => ([
	{ url: 'https://tron.qvapay.com', priority: 0, owner: 'qvapay', enabled: false },
	{ url: 'https://api.trongrid.io', priority: 10, owner: 'trongrid' },
	{ url: 'https://tron-rpc.publicnode.com', priority: 20, owner: 'publicnode' },
])

const makeRouter = (registry, deps = {}) => {
	let t = 1_000_000
	const clock = { now: () => t, advance: (ms) => { t += ms } }
	const router = createRpcRouter(() => registry, { now: clock.now, ...deps })
	return { router, clock }
}

describe('pickRpc', () => {
	test('filtra enabled:false y prefiere la prioridad más baja', () => {
		const { router } = makeRouter(makeRegistry(RPCS()))
		expect(router.pickRpc('tron').url).toBe('https://api.trongrid.io')
	})

	test('un nodo qvapay habilitado gana por priority 0 aunque tenga peor latencia', async () => {
		const registry = makeRegistry(RPCS())
		const probes = { 'https://tron.qvapay.com': 500, 'https://api.trongrid.io': 40, 'https://tron-rpc.publicnode.com': 60 }
		const { router, clock } = makeRouter(registry, {
			probeRequest: (_k, _c, rpc) => { clock.advance(probes[rpc.url]); return Promise.resolve() },
		})
		// Flip remoto: el registro cambia sin tocar el router
		registry.chains.tron.rpcs[0].enabled = true
		await router.probe('tron')
		expect(router.pickRpc('tron').owner).toBe('qvapay')
	})

	test('a igual prioridad desempata por latencia conocida', async () => {
		const registry = makeRegistry([
			{ url: 'https://a.example', priority: 10, owner: 'a' },
			{ url: 'https://b.example', priority: 10, owner: 'b' },
		])
		const probes = { 'https://a.example': 300, 'https://b.example': 20 }
		const { router, clock } = makeRouter(registry, {
			probeRequest: (_k, _c, rpc) => { clock.advance(probes[rpc.url]); return Promise.resolve() },
		})
		await router.probe('tron')
		expect(router.pickRpc('tron').url).toBe('https://b.example')
	})

	test('cadena desconocida lanza', () => {
		const { router } = makeRouter(makeRegistry(RPCS()))
		expect(() => router.pickRpc('dogecoin')).toThrow(/desconocida/)
	})
})

describe('circuit breaker', () => {
	const netError = () => Object.assign(new Error('boom'), { retryable: true })

	test('tras MAX_FAILURES fallos salta al siguiente y reabre pasada la ventana', async () => {
		const { router, clock } = makeRouter(makeRegistry(RPCS()))
		for (let i = 0; i < MAX_FAILURES; i++) {
			await router.call('tron', (rpc) => {
				if (rpc.url === 'https://api.trongrid.io') throw netError()
				return Promise.resolve('ok')
			})
		}
		// trongrid quemado → publicnode directo
		expect(router.pickRpc('tron').url).toBe('https://tron-rpc.publicnode.com')
		// pasada la ventana, reabre solo
		clock.advance(BREAKER_REOPEN_MS + 1)
		expect(router.pickRpc('tron').url).toBe('https://api.trongrid.io')
	})

	test('con todos quemados devuelve el primero por prioridad (nunca null)', async () => {
		const { router } = makeRouter(makeRegistry(RPCS()))
		for (let i = 0; i < MAX_FAILURES; i++) {
			await expect(router.call('tron', () => { throw netError() })).rejects.toThrow(AllRpcsFailedError)
		}
		expect(router.pickRpc('tron').url).toBe('https://api.trongrid.io')
	})
})

describe('call', () => {
	test('rota en error de red y resuelve con el siguiente', async () => {
		const { router } = makeRouter(makeRegistry(RPCS()))
		const seen = []
		const result = await router.call('tron', (rpc) => {
			seen.push(rpc.url)
			if (rpc.url === 'https://api.trongrid.io') throw Object.assign(new Error('http 502'), { status: 502 })
			return Promise.resolve('ok')
		})
		expect(result).toBe('ok')
		expect(seen).toEqual(['https://api.trongrid.io', 'https://tron-rpc.publicnode.com'])
	})

	test('accept descarta dialectos que no sirven para la llamada', async () => {
		const registry = { version: 1, updated_at: '', chains: { tron: { kind: 'tron', native: { symbol: 'TRX', decimals: 6 }, explorer: '', rpcs: [
			{ url: 'https://a/jsonrpc', priority: 0, owner: 'x', api: 'jsonrpc' },
			{ url: 'https://b', priority: 10, owner: 'x' },
		] } } }
		const router = createRpcRouter(() => registry)
		const used = await router.call('tron', async rpc => rpc.url, { accept: rpc => rpc.api !== 'jsonrpc' })
		expect(used).toBe('https://b')
		await expect(router.call('tron', async rpc => rpc.url, { accept: () => false })).rejects.toThrow(AllRpcsFailedError)
	})

	test('un error de negocio NO rota: se relanza tal cual', async () => {
		const { router } = makeRouter(makeRegistry(RPCS()))
		const seen = []
		await expect(router.call('tron', (rpc) => {
			seen.push(rpc.url)
			throw Object.assign(new Error('REVERT: fondos insuficientes'), { status: 400 })
		})).rejects.toThrow(/fondos insuficientes/)
		expect(seen).toEqual(['https://api.trongrid.io'])
	})

	test('el éxito resetea failures y guarda latencia', async () => {
		const { router, clock } = makeRouter(makeRegistry(RPCS()))
		await router.call('tron', () => { throw Object.assign(new Error('x'), { retryable: true }) }).catch(() => {})
		await router.call('tron', () => { clock.advance(120); return Promise.resolve('ok') })
		const h = router.getHealth()['https://api.trongrid.io']
		expect(h).toMatchObject({ ok: true, failures: 0, latencyMs: 120 })
	})

	test('notifica cambios de salud (persistencia en la capa React)', async () => {
		const onHealthChange = jest.fn()
		const { router } = makeRouter(makeRegistry(RPCS()), { onHealthChange })
		await router.call('tron', () => Promise.resolve('ok'))
		expect(onHealthChange).toHaveBeenCalled()
		expect(onHealthChange.mock.calls.at(-1)[0]['https://api.trongrid.io'].ok).toBe(true)
	})
})

describe('isRetryableRpcError', () => {
	test.each([
		[{ name: 'AbortError' }, true],
		[{ name: 'TypeError' }, true],
		[{ status: 503 }, true],
		[{ retryable: true }, true],
		[{ status: 400 }, false],
		[{ status: 500, retryable: false }, false],
		[null, false],
		['string', false],
	])('%p → %p', (err, expected) => {
		expect(isRetryableRpcError(err)).toBe(expected)
	})
})

describe('bundled.json', () => {
	test('cubre las 7 cadenas v5 con la forma del contrato', () => {
		expect(Object.keys(bundled.chains).sort()).toEqual(['base', 'bitcoin', 'bsc', 'ethereum', 'polygon', 'stacks', 'tron'])
		for (const [key, chain] of Object.entries(bundled.chains)) {
			expect(['evm', 'tron', 'btc', 'stacks']).toContain(chain.kind)
			expect(chain.explorer).toContain('{tx}')
			expect(chain.native.decimals).toBeGreaterThan(0)
			if (chain.kind === 'evm') expect(chain.chainId).toBeGreaterThan(0)
			// Todo nodo propio nace registrado pero apagado, con la priority 0 reservada
			const qvapay = chain.rpcs.filter(r => r.owner === 'qvapay')
			expect(qvapay).toHaveLength(1)
			expect(qvapay[0]).toMatchObject({ priority: 0, enabled: false })
			// Y siempre hay al menos un público habilitado para arrancar
			expect(chain.rpcs.filter(r => r.owner !== 'qvapay' && r.enabled !== false).length).toBeGreaterThanOrEqual(2)
			expect(key).toBeTruthy()
		}
	})

	test('ninguna URL de RPC lleva API keys embebidas', () => {
		for (const chain of Object.values(bundled.chains)) {
			for (const rpc of chain.rpcs) {
				expect(rpc.url).not.toMatch(/key|token|api_?key/i)
				expect(rpc.headers ?? {}).toEqual({})
			}
		}
	})
})

describe('seedHealth', () => {
	test('hidrata entradas persistidas sin pisar mediciones más frescas', async () => {
		const { router, clock } = makeRouter(makeRegistry(RPCS()))
		await router.call('tron', () => { clock.advance(50); return Promise.resolve('ok') })
		const fresh = router.getHealth()['https://api.trongrid.io']
		router.seedHealth({
			'https://api.trongrid.io': { ok: false, latencyMs: 900, checkedAt: fresh.checkedAt - 1, failures: 3, lastFailureAt: fresh.checkedAt - 1 },
			'https://tron-rpc.publicnode.com': { ok: true, latencyMs: 80, checkedAt: fresh.checkedAt - 1, failures: 0, lastFailureAt: 0 },
		})
		const h = router.getHealth()
		expect(h['https://api.trongrid.io']).toEqual(fresh)
		expect(h['https://tron-rpc.publicnode.com'].latencyMs).toBe(80)
	})
})
