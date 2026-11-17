/**
 * Qué puede decidir el registro REMOTO. Antes bastaba una `version` más alta para que la
 * app se creyera contratos, decimales, chainId, explorador y validadores de un JSON
 * descargado de GitHub. Aquí se fija que del remoto solo salen los nodos, y que nada de lo
 * que traiga (hostil o simplemente roto) puede cambiar el resto ni hacer lanzar a nadie.
 * @jest-environment node
 */
import bundled from './bundled.json'
import { MAX_RPCS_PER_CHAIN, pinRegistry } from './pins'
import { resolveRegistry } from './useRegistry'
import { buildAssetCatalog } from '../assets'
import { resolveStakingConfig } from '../staking/config'

const clone = (value) => JSON.parse(JSON.stringify(value))
const newer = (mutate) => {
	const remote = clone(bundled)
	remote.version = bundled.version + 1
	mutate?.(remote)
	return remote
}
const NODE = { url: 'https://nodo.ejemplo.org/rpc', priority: 5, owner: 'ejemplo' }

describe('lo que el remoto no puede tocar', () => {
	const hostile = newer((remote) => {
		const eth = remote.chains.ethereum
		eth.kind = 'tron'
		eth.chainId = 56
		eth.name = 'Ethereum (oficial)'
		eth.native = { symbol: 'USDT', decimals: 2 }
		eth.explorer = 'qvapay://send?to=atacante&tx={tx}'
		// «USDT» con el contrato del atacante y 0 decimales: saldo falso valorado en dólares, y 1.000.000× al enviar
		eth.tokens = [{ symbol: 'USDT', address: '0x000000000000000000000000000000000000dEaD', decimals: 0 }, { symbol: 'REGALO', address: '0x1111111111111111111111111111111111111111', decimals: 18 }]
		eth.rpcs = [NODE]
		remote.chains.solana.staking = { targets: [{ id: 'Vote111111111111111111111111111111111111111', name: 'Validador del atacante', featured: true, partner: true }] }
		remote.chains.stacks.staking = { targets: [], poxContract: 'SP3ATACANTE0000000000000000000000000000.pox-fake' }
		remote.chains.fantasia = { kind: 'evm', chainId: 1, native: { symbol: 'ETH', decimals: 18 }, explorer: 'https://etherscan.io/tx/{tx}', tokens: [], rpcs: [NODE] }
	})
	const pinned = pinRegistry(hostile, bundled)

	test('contratos, decimales, chainId, tipo, nativo, nombre y explorador son los de la app', () => {
		const { rpcs: _rpcs, ...rest } = pinned.chains.ethereum
		const { rpcs: _bundledRpcs, ...bundledRest } = bundled.chains.ethereum
		expect(rest).toEqual(bundledRest)
		expect(pinned.chains.ethereum.tokens.find(t => t.symbol === 'USDT')).toEqual({ symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 })
	})

	test('el remoto no añade tokens', () => {
		expect(pinned.chains.ethereum.tokens.map(t => t.symbol)).toEqual(bundled.chains.ethereum.tokens.map(t => t.symbol))
	})

	test('ni redes: solo existen las que la app conoce', () => {
		expect(Object.keys(pinned.chains)).toEqual(Object.keys(bundled.chains))
		expect(pinned.chains.fantasia).toBeUndefined()
	})

	test('ni a quién se delega el staking (validadores, contrato PoX)', () => {
		expect(pinned.chains.solana.staking).toEqual(bundled.chains.solana.staking)
		expect(pinned.chains.stacks.staking).toEqual(bundled.chains.stacks.staking)
		expect(resolveStakingConfig('solana', pinned, bundled).targets.map(t => t.name)).not.toContain('Validador del atacante')
	})

	test('lo único que cambia son los nodos', () => {
		expect(pinned.chains.ethereum.rpcs).toEqual([NODE])
		expect(pinned.version).toBe(bundled.version + 1)
	})

	test('el catálogo de activos que sale de ahí es el de la app', () => {
		expect(buildAssetCatalog(pinned)).toEqual(buildAssetCatalog(bundled))
	})
})

describe('nodos del remoto', () => {
	const rpcsFor = (rpcs, chain = 'ethereum') => pinRegistry(newer(remote => { remote.chains[chain].rpcs = rpcs }), bundled).chains[chain].rpcs

	test('el registro empaquetado pasa entero por su propio filtro (ningún nodo bueno se pierde ni cambia)', () => {
		const pinned = pinRegistry(clone(bundled), bundled)
		// `enabled: true` y «sin enabled» son lo mismo (solo `false` apaga un nodo)
		const normal = rpc => ({ ...rpc, enabled: rpc.enabled !== false })
		for (const [key, chain] of Object.entries(bundled.chains)) {
			expect(pinned.chains[key].rpcs.map(normal)).toEqual(chain.rpcs.map(normal))
			expect({ ...pinned.chains[key], rpcs: null }).toEqual({ ...chain, rpcs: null })
		}
		expect(Object.keys(pinned.chains)).toEqual(Object.keys(bundled.chains))
	})

	test.each([
		['http', 'http://nodo.ejemplo.org'],
		['otro esquema', ['java', 'script:alert(1)'].join('')],
		['esquema propio', 'qvapay://nodo'],
		['usuario:clave@', 'https://user:pass@nodo.ejemplo.org'],
		['host que se hace pasar por otro', 'https://api.trongrid.io@atacante.org/'],
		['espacios', 'https://nodo.ejemplo.org/a b'],
		['fragmento', 'https://nodo.ejemplo.org/#x'],
		['sin host', 'https://'],
		['salto de línea', 'https://nodo.ejemplo.org/\nHost: x'],
		['demasiado larga', `https://nodo.ejemplo.org/${'a'.repeat(200)}`],
		['no es texto', 42],
	])('una URL con %s se descarta', (_label, url) => {
		expect(rpcsFor([{ ...NODE, url }, NODE])).toEqual([NODE])
	})

	test('con ruta, puerto y query sí vale', () => {
		const rpcs = [{ ...NODE, url: 'https://nodo.ejemplo.org:8443/v1/rpc/public?key=abc-123' }]
		expect(rpcsFor(rpcs)).toEqual(rpcs)
	})

	test.each([['falta', undefined], ['texto', '10'], ['NaN', NaN], ['infinito', Infinity], ['null', null]])('prioridad %s: el nodo se descarta', (_label, priority) => {
		expect(rpcsFor([{ ...NODE, priority }, NODE])).toEqual([NODE])
	})

	// Los nodos que añade el usuario van delante con prioridad -1
	test('una prioridad negativa no se cuela delante de los nodos del usuario', () => {
		expect(rpcsFor([{ ...NODE, priority: -50 }])).toEqual([{ ...NODE, priority: 0 }])
	})

	test('no puede hacerse pasar por un nodo del usuario ni por uno de la casa', () => {
		expect(rpcsFor([{ ...NODE, owner: 'user' }])[0].owner).toBe('registry')
		expect(rpcsFor([{ ...NODE, owner: 'qvapay' }])[0].owner).toBe('registry')
		expect(rpcsFor([{ ...NODE, url: 'https://eth.qvapay.com.atacante.org', owner: 'qvapay' }])[0].owner).toBe('registry')
		expect(rpcsFor([{ url: 'https://eth.qvapay.com', priority: 0, owner: 'qvapay' }])[0].owner).toBe('qvapay')
		expect(rpcsFor([{ url: NODE.url, priority: 5 }])[0].owner).toBe('registry')
	})

	test('`enabled: false` se respeta; cualquier otra cosa es «encendido»', () => {
		expect(rpcsFor([{ ...NODE, enabled: false }])).toEqual([{ ...NODE, enabled: false }])
		expect(rpcsFor([{ ...NODE, enabled: 'no' }])).toEqual([NODE])
	})

	test('un dialecto que la app no habla en esa red no es un nodo que pueda usar', () => {
		expect(rpcsFor([{ ...NODE, api: 'esplora' }, NODE])).toEqual([NODE])
		expect(rpcsFor([{ ...NODE, api: 'jsonrpc' }], 'tron')).toEqual([{ ...NODE, api: 'jsonrpc' }])
		expect(rpcsFor([{ ...NODE, api: 'esplora' }], 'bitcoin')).toEqual([{ ...NODE, api: 'esplora' }])
		expect(rpcsFor([{ ...NODE, api: 7 }, NODE], 'tron')).toEqual([NODE])
	})

	test('cabeceras: pocas, con nombre y valor normales, o el nodo no entra', () => {
		const withKey = { ...NODE, headers: { 'TRON-PRO-API-KEY': 'abc' } }
		expect(rpcsFor([withKey])).toEqual([withKey])
		expect(rpcsFor([{ ...NODE, headers: { 'X-A': 'b\r\nHost: x' } }, NODE])).toEqual([NODE])
		expect(rpcsFor([{ ...NODE, headers: { 'nombre con espacio': 'x' } }, NODE])).toEqual([NODE])
		expect(rpcsFor([{ ...NODE, headers: ['x'] }, NODE])).toEqual([NODE])
		expect(rpcsFor([{ ...NODE, headers: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`H${i}`, 'x'])) }, NODE])).toEqual([NODE])
	})

	test('repetidos fuera, y tope por red', () => {
		expect(rpcsFor([NODE, { ...NODE, priority: 99 }])).toEqual([NODE])
		const many = Array.from({ length: 200 }, (_, i) => ({ url: `https://n${i}.ejemplo.org`, priority: i, owner: 'x' }))
		expect(rpcsFor(many)).toHaveLength(MAX_RPCS_PER_CHAIN)
	})

	test('si de una red no queda ningún nodo válido, se usan los de la app', () => {
		expect(rpcsFor([{ ...NODE, url: 'http://inseguro.org' }])).toEqual(bundled.chains.ethereum.rpcs)
		expect(rpcsFor([])).toEqual(bundled.chains.ethereum.rpcs)
		expect(rpcsFor('no es una lista')).toEqual(bundled.chains.ethereum.rpcs)
	})
})

// Antes: una cadena sin `native` o un token sin `symbol` lanzaban en render y tumbaban el
// tab Crypto y Depositar a todos, con y sin wallet
describe('un registro roto no tumba nada', () => {
	test.each([
		['cadena sin nativo', remote => { delete remote.chains.ethereum.native }],
		['token sin símbolo', remote => { remote.chains.ethereum.tokens = [{ address: '0x1', decimals: 6 }] }],
		['tokens que no son lista', remote => { remote.chains.ethereum.tokens = 'USDT' }],
		['cadena nula', remote => { remote.chains.ethereum = null }],
		['cadena que es texto', remote => { remote.chains.ethereum = 'evm' }],
		['cadena que falta', remote => { delete remote.chains.ethereum }],
		['nodos nulos', remote => { remote.chains.ethereum.rpcs = [null, undefined, 7, 'x', []] }],
		['staking con basura', remote => { remote.chains.tron.staking = { targets: 'todos' } }],
	])('%s: el catálogo se construye igual y la red conserva lo de la app', (_label, mutate) => {
		const resolved = resolveRegistry(newer(mutate))
		expect(() => buildAssetCatalog(resolved)).not.toThrow()
		expect(buildAssetCatalog(resolved)).toEqual(buildAssetCatalog(bundled))
		expect(resolved.chains.ethereum.native).toEqual(bundled.chains.ethereum.native)
		expect(resolved.chains.ethereum.rpcs.length).toBeGreaterThan(0)
	})

	test.each([
		['nada', undefined],
		['null', null],
		['texto', 'registro'],
		['lista', []],
		['sin versión', { chains: {} }],
		['versión que no es número', { version: '99', chains: {} }],
		['sin cadenas', { version: 99 }],
		['cadenas que son lista', { version: 99, chains: [] }],
	])('%s no es un registro: se usa el empaquetado', (_label, remote) => {
		expect(pinRegistry(remote, bundled)).toBeNull()
		expect(resolveRegistry(remote)).toBe(bundled)
	})
})

describe('resolveRegistry', () => {
	test('un remoto más viejo que la app no gana', () => {
		const old = clone(bundled)
		old.version = bundled.version - 1
		old.chains.ethereum.rpcs = [NODE]
		expect(resolveRegistry(old)).toBe(bundled)
	})

	test('uno igual o más nuevo aporta sus nodos, y solo eso', () => {
		const resolved = resolveRegistry(newer(remote => {
			remote.updated_at = '2027-01-01'
			remote.chains.tron.rpcs = [NODE]
			remote.chains.tron.tokens[0].address = 'TAtacante1111111111111111111111111'
		}))
		expect(resolved.updated_at).toBe('2027-01-01')
		expect(resolved.chains.tron.rpcs).toEqual([NODE])
		expect(resolved.chains.tron.tokens).toEqual(bundled.chains.tron.tokens)
		// El resto de redes, intactas. Un nodo saneado solo lleva `enabled` cuando está apagado
		// (`enabled: true` es lo mismo que no decirlo), así que se compara sin ese `true`
		const asPinned = chain => ({ ...chain, rpcs: chain.rpcs.map(({ enabled, ...rpc }) => (enabled === false ? { ...rpc, enabled } : rpc)) })
		expect(resolved.chains.bsc).toEqual(asPinned(bundled.chains.bsc))
		// Y el nodo propio encendido en el empaquetado sigue utilizable tras sanearlo
		expect(resolved.chains.bsc.rpcs.find(rpc => rpc.owner === 'qvapay').enabled).not.toBe(false)
	})
})
