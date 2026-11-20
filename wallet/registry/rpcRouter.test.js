/**
 * @jest-environment node
 *
 * rpcRouter: prioridad, circuit breaker, rotación solo en errores de
 * infraestructura y el contrato clave del plan crypto — un nodo qvapay que
 * pasa a `enabled: true` gana por priority 0 aunque tenga peor latencia,
 * sin publicar versión nueva.
 */
import {
	isMethodNotAllowed,
	isDataUnavailable,
	createRpcRouter,
	isRetryableRpcError,
	AllRpcsFailedError,
	MAX_FAILURES,
	BREAKER_REOPEN_MS,
	BACKGROUND_PROBE_TOP,
	createTrailingWriter,
	NETWORK_IDENTITY,
	RpcNetworkMismatchError,
	verifyRpcNetwork,
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

	test('un método que el nodo NO ofrece (403 METHOD_NOT_ALLOWED de sol.qvapay.com) rota aunque no sea lectura, y no rompe el nodo', async () => {
		// El fallo real (2026-09-30): el proxy propio rechaza getEpochInfo, getProgramAccounts…
		// y el staking de SOL moría en la confirmación en vez de probar el siguiente nodo
		const { router } = makeRouter(makeRegistry(RPCS()))
		const refusal = () => Object.assign(new Error('https://api.trongrid.io: HTTP 403 {"error":"El método getEpochInfo no está permitido","code":"METHOD_NOT_ALLOWED"}'), { status: 403, retryable: false })
		for (let i = 0; i < 5; i++) {
			const seen = []
			const result = await router.call('tron', (rpc) => {
				seen.push(rpc.url)
				if (rpc.url === 'https://api.trongrid.io') throw refusal()
				return Promise.resolve('ok')
			})
			expect(result).toBe('ok')
			// Cinco rechazos seguidos y el nodo sigue siendo el primero: no cuenta como caída
			expect(seen[0]).toBe('https://api.trongrid.io')
		}
		expect(isMethodNotAllowed(refusal())).toBe(true)
		expect(isMethodNotAllowed(new Error('Method not found'))).toBe(true)
		expect(isMethodNotAllowed(new Error('HTTP 403'))).toBe(false)
	})

	test('un dato que el nodo no guarda (bloque podado) rota sin romper el nodo', async () => {
		// El fallo real (2026-10-17): sol.qvapay.com poda a ~3,7 h y getInflationReward de la
		// epoch anterior pide un bloque que ya no tiene. Cada apertura del selector de
		// validador sumaba un fallo y a la tercera nuestro nodo salía del router
		const { router } = makeRouter(makeRegistry(RPCS()))
		const pruned = () => Object.assign(new Error('https://api.trongrid.io: getInflationReward → Block 457920000 cleaned up, does not exist on node. First available block: 458090636'), { retryable: false })
		for (let i = 0; i < MAX_FAILURES + 2; i++) {
			const seen = []
			const result = await router.call('tron', (rpc) => {
				seen.push(rpc.url)
				if (rpc.url === 'https://api.trongrid.io') throw pruned()
				return Promise.resolve('ok')
			}, { idempotent: true })
			expect(result).toBe('ok')
			expect(seen[0]).toBe('https://api.trongrid.io')
		}
	})

	test('isDataUnavailable: mensajes de Agave de "no está en este nodo" o "aún no existe"', () => {
		const rpc = (message) => new Error(`https://sol.qvapay.com: getInflationReward → ${message}`)
		expect(isDataUnavailable(rpc('Block 457920000 cleaned up, does not exist on node. First available block: 458090636'))).toBe(true)
		expect(isDataUnavailable(rpc('Slot 1 was skipped, or missing due to ledger jump to recent snapshot'))).toBe(true)
		expect(isDataUnavailable(rpc('Slot 1 was skipped, or missing in long-term storage'))).toBe(true)
		expect(isDataUnavailable(rpc('Transaction history is not available from this node'))).toBe(true)
		expect(isDataUnavailable(rpc('Rewards cannot be found because slot 1 is not the epoch boundary.This may be due to gap in the queried node\'s local ledger or long-term storage'))).toBe(true)
		expect(isDataUnavailable(rpc('Epoch rewards period still active at slot 457920100'))).toBe(true)
		// Un nodo EVM completo al que se le pide estado de un bloque ya podado (lookupEvmTransaction)
		expect(isDataUnavailable(rpc('missing trie node 9f3c (path ) state 0x9f3c is not available'))).toBe(true)
		expect(isDataUnavailable(rpc('required historical state unavailable (reexec=128)'))).toBe(true)
		expect(isDataUnavailable(rpc('historical state at block 123 is not available'))).toBe(true)
		expect(isDataUnavailable(rpc('No state available for block 0xabc'))).toBe(true)
		// Un nodo atrasado o enfermo SÍ es un fallo del nodo
		expect(isDataUnavailable(rpc('Block not available for slot 1'))).toBe(false)
		expect(isDataUnavailable(rpc('Node is behind by 120 slots'))).toBe(false)
		expect(isDataUnavailable(new Error('http 502'))).toBe(false)
		expect(isDataUnavailable(null)).toBe(false)
	})

	test('una LECTURA rota ante cualquier error: repetirla no puede duplicar nada', async () => {
		// El fallo real: nueve nodos del registry sirven `eth_getBalance` y rechazan
		// `eth_call` con códigos propios. Sin rotar, moría la cadena entera y los tokens
		// desaparecían de la pantalla mientras el nativo seguía viéndose.
		const { router } = makeRouter(makeRegistry(RPCS()))
		const seen = []
		const result = await router.call('tron', (rpc) => {
			seen.push(rpc.url)
			if (rpc.url === 'https://api.trongrid.io') throw new Error("Method 'eth_call' is available for paid plans")
			return Promise.resolve('ok')
		}, { idempotent: true })
		expect(result).toBe('ok')
		expect(seen).toHaveLength(2)
	})

	test('sin marcar idempotente, un nodo que SE NIEGA también rota', async () => {
		// Medidos en producción: Tatum -16401, zan.top -32012, OnFinality -32029,
		// publicnode -32602. Ninguno es un error de la petición: es el nodo diciendo que no.
		for (const message of [
			"Method 'eth_call' is available for paid plans",
			'cu limit exceeded; Method "eth_call" is not available',
			'Too Many Requests, Please apply an OnFinality API key',
			'Request blocked',
		]) {
			const { router } = makeRouter(makeRegistry(RPCS()))
			const seen = []
			const result = await router.call('tron', (rpc) => {
				seen.push(rpc.url)
				if (seen.length === 1) throw new Error(message)
				return Promise.resolve('ok')
			})
			expect(result).toBe('ok')
			expect(seen).toHaveLength(2)
		}
	})

	test('un error de NEGOCIO sigue sin rotar aunque la lectura no lo sea', async () => {
		// Rotar aquí gastaría los nodos y cambiaría "fondos insuficientes" por un
		// "fallaron todos", que no le dice nada a nadie
		const { router } = makeRouter(makeRegistry(RPCS()))
		const seen = []
		await expect(router.call('tron', (rpc) => {
			seen.push(rpc.url)
			throw new Error('insufficient funds for transfer')
		})).rejects.toThrow('insufficient funds')
		expect(seen).toHaveLength(1)
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

/**
 * Proxies propios ya en producción (verificados antes de encenderse en el registry):
 * - solana: sol.qvapay.com
 * - tron: tron.qvapay.com → GetBlock FULLNODE-REST (2026-10-01: bloques, cuenta, recompensas,
 *   SR y brokerage REAL —5 % P2P.org, a diferencia de TronGrid— y rutas vetadas con 403)
 * - ethereum: eth.qvapay.com, bsc: bsc.qvapay.com, polygon: pol.qvapay.com (el nombre corto:
 *   `polygon.qvapay.com` nunca tuvo DNS) y base: base.qvapay.com. Verificados el 2026-11-16
 *   con las llamadas de la wallet (identidad de red 0x1, 0x38, 0x89 y 0x2105, altura, saldo
 *   nativo, `balanceOf`, precio del gas y nonce) y con la altura a un bloque como mucho de la
 *   de un nodo público. En el registro remoto, eth y bsc llevaban encendidos desde el 13-14
 *   de noviembre; pol y base, desde ese día (v13)
 * - bitcoin: btc.qvapay.com/api (el proxy de qpweb traduce Esplora ⇄ Blockbook). Comprobado el
 *   2026-11-18 contra mempool.space ruta por ruta y con las funciones de Bitcoin de la wallet
 *   (saldo, UTXOs, comisiones, preparar un envío, qué fue de una tx y el texto de los rechazos).
 *   Va de RESPALDO, no el primero: ver `BACKUP_QVAPAY_PROXIES`
 *
 * Sigue apagado el que no existe: stx.qvapay.com (sin DNS ni proxy).
 */
const LIVE_QVAPAY_PROXIES = ['solana', 'tron', 'ethereum', 'bsc', 'polygon', 'base', 'bitcoin']

/**
 * Nodos propios que no van los primeros, con su prioridad. Espejo de `OWN_BACKUP` de
 * `scripts/check.mjs` del registro remoto.
 *
 * - bitcoin: el índice por dirección del nodo sigue el mempool por tandas, así que un pago
 *   recién difundido tarda en torno a 1 min en salir en el saldo y en los UTXOs (mempool.space
 *   y blockstream.info, segundos), y los pagos de comisión muy baja no los ve hasta que se
 *   minan (2026-11-20: no conocía 6 de 7 tx pendientes de menos de 1 sat/vB). De primero, quien
 *   recibe lo vería tarde. Entra detrás de mempool.space (10) y de blockstream.info (20) y
 *   delante del resto: la wallet lo usa cuando esos dos fallan o la limitan. Vuelve a 0 cuando
 *   vaya al día.
 */
const BACKUP_QVAPAY_PROXIES = { bitcoin: 25 }

describe('bundled.json', () => {
	test('cubre las 8 cadenas v7 con la forma del contrato', () => {
		// La versión se fija a propósito: es lo que decide si el registro remoto gana
		// (`remote.version >= bundled.version`), así que subirla es una decisión, no un
		// detalle. El remoto estuvo dos versiones descartado por quedarse atrás.
		expect(bundled.version).toBe(7)
		expect(Object.keys(bundled.chains).sort()).toEqual(['base', 'bitcoin', 'bsc', 'ethereum', 'polygon', 'solana', 'stacks', 'tron'])
		for (const [key, chain] of Object.entries(bundled.chains)) {
			expect(['evm', 'tron', 'btc', 'stacks', 'solana']).toContain(chain.kind)
			expect(chain.explorer).toContain('{tx}')
			expect(chain.native.decimals).toBeGreaterThan(0)
			if (chain.kind === 'evm') expect(chain.chainId).toBeGreaterThan(0)
			// Todo nodo propio nace registrado con la priority 0 reservada, y apagado
			// hasta que el proxy existe de verdad: encenderlo antes hace que cada
			// llamada se coma un probe fallido para nada.
			const qvapay = chain.rpcs.filter(r => r.owner === 'qvapay')
			const publics = chain.rpcs.filter(r => r.owner !== 'qvapay' && r.enabled !== false)
			expect(qvapay).toHaveLength(1)
			expect(qvapay[0].priority).toBe(BACKUP_QVAPAY_PROXIES[key] ?? 0)
			expect(qvapay[0].enabled).toBe(LIVE_QVAPAY_PROXIES.includes(key))
			// Uno de respaldo lo es de verdad: va detrás de al menos un público encendido
			if (key in BACKUP_QVAPAY_PROXIES) expect(Math.min(...publics.map(r => r.priority))).toBeLessThan(qvapay[0].priority)
			// Y siempre hay al menos un público habilitado para arrancar
			expect(publics.length).toBeGreaterThanOrEqual(2)
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

// R-05: el sondeo de fondo medía los ~120 nodos del registro en cada arranque y cada 10 min
describe('sondeo de fondo: solo los nodos que se usarían', () => {
	const many = (count, extra = []) => makeRegistry([
		...extra,
		...Array.from({ length: count }, (_, i) => ({ url: `https://n${i + 1}.example`, priority: (i + 1) * 10, owner: `op${i + 1}` })),
	])
	const probed = (registry, run, deps = {}) => {
		const seen = []
		const { router, clock } = makeRouter(registry, { probeRequest: async (_k, _c, rpc) => { seen.push(rpc.url) }, ...deps })
		return run(router, clock).then(() => seen.sort())
	}

	test('con `top`, los primeros por prioridad; sin él (la pantalla Nodos), todos', async () => {
		const registry = many(12)
		expect(await probed(registry, router => router.probe(undefined, { top: BACKGROUND_PROBE_TOP }))).toEqual(['https://n1.example', 'https://n2.example', 'https://n3.example'])
		expect(await probed(registry, router => router.probe())).toHaveLength(12)
		expect(await probed(registry, router => router.probe('tron'))).toHaveLength(12)
	})

	test('los nodos del usuario se miden siempre, además de esos', async () => {
		const registry = many(12, [
			{ url: 'https://mio.example', priority: -1, owner: 'user' },
			{ url: 'https://mio2.example', priority: -1, owner: 'user' },
		])
		expect(await probed(registry, router => router.probe(undefined, { top: 3 }))).toEqual(['https://mio.example', 'https://mio2.example', 'https://n1.example', 'https://n2.example', 'https://n3.example'])
	})

	test('uno deshabilitado no cuenta, y uno con el breaker abierto cede su sitio al siguiente', async () => {
		const registry = many(6)
		registry.chains.tron.rpcs[1].enabled = false
		const seen = await probed(registry, async (router) => {
			// n1 cae tres veces: el breaker lo aparta, y `call` ya no lo intentaría
			for (let i = 0; i < MAX_FAILURES; i++) {
				await router.call('tron', async (rpc) => { if (rpc.url === 'https://n1.example') throw Object.assign(new Error('timeout'), { retryable: true }); return 'ok' })
			}
			await router.probe(undefined, { top: 3 })
		})
		expect(seen).toEqual(['https://n3.example', 'https://n4.example', 'https://n5.example'])
	})

	test('el registro de la app: de 119 nodos pasa a medir tres por cadena', async () => {
		const total = Object.values(bundled.chains).reduce((sum, chain) => sum + chain.rpcs.filter(r => r.enabled !== false).length, 0)
		const seen = []
		const router = createRpcRouter(() => bundled, { probeRequest: async (_k, _c, rpc) => { seen.push(rpc.url) } })
		await router.probe(undefined, { top: BACKGROUND_PROBE_TOP })
		expect(total).toBeGreaterThan(100)
		expect(seen.length).toBeLessThanOrEqual(Object.keys(bundled.chains).length * BACKGROUND_PROBE_TOP)
		expect(seen.length).toBeGreaterThanOrEqual(Object.keys(bundled.chains).length)
	})
})

// Cada llamada a un nodo cambia la salud: escribirla en disco cada vez eran ~120 escrituras
// por sondeo y una más por cada lectura
describe('la salud se escribe en disco una vez por ráfaga', () => {
	const fakeTimers = () => {
		const timers = { pending: null, set: (fn, ms) => { timers.pending = { fn, ms }; return timers.pending }, clear: () => { timers.pending = null }, fire: () => { const { fn } = timers.pending; timers.pending = null; fn() } }
		return timers
	}

	test('cien cambios seguidos: una escritura, con el último', () => {
		const timers = fakeTimers()
		const write = jest.fn()
		const writer = createTrailingWriter(write, 3_000, timers)
		for (let i = 1; i <= 100; i++) writer.push({ version: i })
		expect(write).not.toHaveBeenCalled()
		expect(timers.pending.ms).toBe(3_000)
		timers.fire()
		expect(write).toHaveBeenCalledTimes(1)
		expect(write).toHaveBeenCalledWith({ version: 100 })
	})

	test('el reloj no se reinicia con cada cambio: con actividad continua se sigue escribiendo', () => {
		const timers = fakeTimers()
		const write = jest.fn()
		const writer = createTrailingWriter(write, 3_000, timers)
		writer.push('a')
		const armed = timers.pending
		writer.push('b')
		expect(timers.pending).toBe(armed)
		timers.fire()
		writer.push('c')
		timers.fire()
		expect(write.mock.calls.map(call => call[0])).toEqual(['b', 'c'])
	})

	test('sin cambios no escribe, y `flush` adelanta lo pendiente una sola vez', () => {
		const timers = fakeTimers()
		const write = jest.fn()
		const writer = createTrailingWriter(write, 3_000, timers)
		writer.flush()
		expect(write).not.toHaveBeenCalled()
		writer.push('a')
		writer.flush()
		writer.flush()
		expect(write).toHaveBeenCalledTimes(1)
		expect(timers.pending).toBeNull()
	})
})

// R-03: al añadir un nodo propio solo se comprobaba que respondía. Uno de otra cadena, o de
// una red de pruebas, pasaba, y sus saldos se pintaban como los de la wallet
describe('un nodo del usuario tiene que ser de ESA red', () => {
	afterEach(() => { delete global.fetch })
	const RPC = { url: 'https://nodo.example/', priority: -1, owner: 'user' }
	const reply = (json, { text } = {}) => ({ ok: true, status: 200, json: async () => json, text: async () => text ?? JSON.stringify(json) })
	/** Nodo de mentira: contesta por ruta (REST) o por método (JSON-RPC). */
	const node = (answers) => {
		const calls = []
		global.fetch = jest.fn(async (url, init) => {
			const body = init?.body ? JSON.parse(init.body) : null
			const key = body?.method ?? new URL(url).pathname
			calls.push({ url, key })
			const answer = answers[key]
			if (answer === undefined) return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
			return typeof answer === 'string' ? reply(null, { text: answer }) : reply(answer)
		})
		return calls
	}
	const EVM = { kind: 'evm', chainId: 56, native: { symbol: 'BNB', decimals: 18 }, rpcs: [] }
	const TRON = { kind: 'tron', chainId: 728126428, native: { symbol: 'TRX', decimals: 6 }, rpcs: [] }

	test('EVM: su `eth_chainId` es el de la cadena', async () => {
		node({ eth_chainId: { jsonrpc: '2.0', id: 1, result: '0x38' } })
		await expect(verifyRpcNetwork(EVM, RPC, 3000)).resolves.toBeUndefined()
		// Un nodo de Ethereum añadido a BNB Chain: responde, pero los saldos serían de otra red
		node({ eth_chainId: { jsonrpc: '2.0', id: 1, result: '0x1' } })
		await expect(verifyRpcNetwork(EVM, RPC, 3000)).rejects.toBeInstanceOf(RpcNetworkMismatchError)
		// Y uno de la red de pruebas de BNB (97)
		node({ eth_chainId: { jsonrpc: '2.0', id: 1, result: '0x61' } })
		await expect(verifyRpcNetwork(EVM, RPC, 3000)).rejects.toBeInstanceOf(RpcNetworkMismatchError)
	})

	test('TRON: el bloque 0 por su API, o el chainId por la capa eth_*', async () => {
		const calls = node({ '/wallet/getblockbynum': { blockID: NETWORK_IDENTITY.tronGenesis } })
		await expect(verifyRpcNetwork(TRON, RPC, 3000)).resolves.toBeUndefined()
		// La barra final de la URL no dobla la ruta
		expect(calls[0].url).toBe('https://nodo.example/wallet/getblockbynum')
		// Nile (la red de pruebas) tiene otro bloque 0
		node({ '/wallet/getblockbynum': { blockID: '0000000000000000d698d4192c56cb6be724a558448e2684802de4d6cd8690dc' } })
		await expect(verifyRpcNetwork(TRON, RPC, 3000)).rejects.toBeInstanceOf(RpcNetworkMismatchError)
		node({ eth_chainId: { result: '0x2b6653dc' } })
		await expect(verifyRpcNetwork(TRON, { ...RPC, api: 'jsonrpc' }, 3000)).resolves.toBeUndefined()
	})

	test('Solana, Bitcoin y Stacks: su génesis o su id de red', async () => {
		node({ getGenesisHash: { result: NETWORK_IDENTITY.solanaGenesis } })
		await expect(verifyRpcNetwork({ kind: 'solana', rpcs: [] }, RPC, 3000)).resolves.toBeUndefined()
		// devnet
		node({ getGenesisHash: { result: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' } })
		await expect(verifyRpcNetwork({ kind: 'solana', rpcs: [] }, RPC, 3000)).rejects.toBeInstanceOf(RpcNetworkMismatchError)

		node({ '/block-height/0': `${NETWORK_IDENTITY.btcGenesis}\n` })
		await expect(verifyRpcNetwork({ kind: 'btc', rpcs: [] }, RPC, 3000)).resolves.toBeUndefined()
		// testnet3
		node({ '/block-height/0': '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943' })
		await expect(verifyRpcNetwork({ kind: 'btc', rpcs: [] }, RPC, 3000)).rejects.toBeInstanceOf(RpcNetworkMismatchError)

		node({ '/v2/info': { network_id: 1 } })
		await expect(verifyRpcNetwork({ kind: 'stacks', rpcs: [] }, RPC, 3000)).resolves.toBeUndefined()
		node({ '/v2/info': { network_id: 2147483648 } })
		await expect(verifyRpcNetwork({ kind: 'stacks', rpcs: [] }, RPC, 3000)).rejects.toBeInstanceOf(RpcNetworkMismatchError)
	})

	test('si no se puede preguntar, no es «otra red»: es que no se sabe (y tampoco se guarda)', async () => {
		node({})
		const err = await verifyRpcNetwork(EVM, RPC, 3000).catch(e => e)
		expect(err).toBeInstanceOf(Error)
		expect(err).not.toBeInstanceOf(RpcNetworkMismatchError)
		// Responde, pero sin el dato
		node({ eth_chainId: { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'method not found' } } })
		await expect(verifyRpcNetwork(EVM, RPC, 3000)).rejects.not.toBeInstanceOf(RpcNetworkMismatchError)
		// Una cadena EVM sin chainId en el registro no se puede comprobar
		node({ eth_chainId: { result: '0x38' } })
		await expect(verifyRpcNetwork({ ...EVM, chainId: undefined }, RPC, 3000)).rejects.toThrow(/chainId/)
	})
})
