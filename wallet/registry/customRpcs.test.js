/**
 * @jest-environment node
 *
 * Nodos RPC del usuario: validación de URL, mapa inmutable y fusión con el
 * registro (el nodo propio del usuario gana a todo, incluido qvapay).
 */
import {
	normalizeRpcUrl,
	validateCustomRpc,
	addCustomRpc,
	removeCustomRpc,
	applyCustomRpcs,
	CUSTOM_RPC_OWNER,
	CUSTOM_RPC_PRIORITY,
	MAX_CUSTOM_RPCS_PER_CHAIN,
} from './customRpcs'
import { createRpcRouter } from './rpcRouter'

const registry = () => ({
	version: 4,
	updated_at: '2026-09-08T00:00:00Z',
	chains: {
		tron: {
			kind: 'tron',
			native: { symbol: 'TRX', decimals: 6 },
			explorer: 'https://tronscan.org/#/transaction/{tx}',
			rpcs: [
				{ url: 'https://tron.qvapay.com', priority: 0, owner: 'qvapay', enabled: true },
				{ url: 'https://api.trongrid.io', priority: 10, owner: 'trongrid' },
			],
		},
	},
})

describe('normalizeRpcUrl', () => {
	test('recorta espacios y barra final', () => {
		expect(normalizeRpcUrl('  https://rpc.example.com/  ')).toBe('https://rpc.example.com')
		expect(normalizeRpcUrl('https://rpc.example.com/v1/')).toBe('https://rpc.example.com/v1')
	})

	test('rechaza http, credenciales, fragmentos y basura', () => {
		expect(normalizeRpcUrl('http://rpc.example.com')).toBeNull()
		expect(normalizeRpcUrl('https://user:pass@rpc.example.com')).toBeNull()
		expect(normalizeRpcUrl('https://rpc.example.com/#x')).toBeNull()
		expect(normalizeRpcUrl('rpc.example.com')).toBeNull()
		expect(normalizeRpcUrl('')).toBeNull()
	})
})

describe('validateCustomRpc', () => {
	test('distingue el motivo del rechazo', () => {
		expect(validateCustomRpc({}, 'tron', '')).toBe('invalid')
		expect(validateCustomRpc({}, 'tron', 'nada')).toBe('invalid')
		expect(validateCustomRpc({}, 'tron', 'http://x.io')).toBe('insecure')
		expect(validateCustomRpc({}, 'tron', 'https://a:b@x.io')).toBe('credentials')
		expect(validateCustomRpc({ tron: ['https://x.io'] }, 'tron', 'https://x.io/')).toBe('duplicate')
		const full = { tron: Array.from({ length: MAX_CUSTOM_RPCS_PER_CHAIN }, (_, i) => `https://n${i}.io`) }
		expect(validateCustomRpc(full, 'tron', 'https://otro.io')).toBe('limit')
		expect(validateCustomRpc({}, 'tron', 'https://x.io')).toBeNull()
	})
})

describe('add/removeCustomRpc', () => {
	test('añade normalizando y sin mutar el mapa original', () => {
		const before = { bsc: ['https://b.io'] }
		const after = addCustomRpc(before, 'tron', ' https://t.io/ ')
		expect(after).toEqual({ bsc: ['https://b.io'], tron: ['https://t.io'] })
		expect(before).toEqual({ bsc: ['https://b.io'] })
	})

	test('lanza con una URL inválida', () => {
		expect(() => addCustomRpc({}, 'tron', 'http://t.io')).toThrow('insecure')
	})

	test('quita la URL y borra la cadena si queda vacía', () => {
		const map = { tron: ['https://a.io', 'https://b.io'] }
		expect(removeCustomRpc(map, 'tron', 'https://a.io')).toEqual({ tron: ['https://b.io'] })
		expect(removeCustomRpc({ tron: ['https://a.io'] }, 'tron', 'https://a.io')).toEqual({})
		expect(removeCustomRpc(map, 'tron', 'https://zzz.io')).toEqual(map)
	})
})

describe('applyCustomRpcs', () => {
	test('sin nodos custom devuelve el mismo objeto (identidad estable)', () => {
		const reg = registry()
		expect(applyCustomRpcs(reg, undefined)).toBe(reg)
		expect(applyCustomRpcs(reg, {})).toBe(reg)
		expect(applyCustomRpcs(reg, { solana: ['https://s.io'] })).toBe(reg)
		expect(applyCustomRpcs(reg, { tron: [] })).toBe(reg)
	})

	test('pone los nodos del usuario delante con owner user y priority por debajo de qvapay', () => {
		const reg = registry()
		const merged = applyCustomRpcs(reg, { tron: ['https://mio.io'] })
		expect(merged).not.toBe(reg)
		expect(reg.chains.tron.rpcs).toHaveLength(2) // no muta el original
		expect(merged.chains.tron.rpcs[0]).toEqual({ url: 'https://mio.io', owner: CUSTOM_RPC_OWNER, priority: CUSTOM_RPC_PRIORITY })
		expect(CUSTOM_RPC_PRIORITY).toBeLessThan(0)
		expect(merged.chains.tron.rpcs).toHaveLength(3)
	})

	test('una URL que ya está en el registro se reemplaza por la del usuario (una sola entrada)', () => {
		const merged = applyCustomRpcs(registry(), { tron: ['https://api.trongrid.io'] })
		const urls = merged.chains.tron.rpcs.map(r => r.url)
		expect(urls).toEqual(['https://api.trongrid.io', 'https://tron.qvapay.com'])
		expect(merged.chains.tron.rpcs[0].owner).toBe(CUSTOM_RPC_OWNER)
	})

	test('el router elige el nodo del usuario aunque el de qvapay esté encendido', () => {
		const merged = applyCustomRpcs(registry(), { tron: ['https://mio.io'] })
		const router = createRpcRouter(() => merged)
		expect(router.pickRpc('tron').url).toBe('https://mio.io')
	})
})
