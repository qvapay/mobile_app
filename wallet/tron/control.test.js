/**
 * @jest-environment node
 *
 * ¿La frase controla la cuenta TRON? El caso real es el de los E2E: la cuenta
 * de "abandon … about" (m/44'/195'/0'/0/0) tiene USDT a la vista y el permiso de
 * dueño en otra dirección. Respuesta de mainnet congelada el 2026-10-16; los hex
 * salen de un base58check hecho a mano, no del código que se prueba.
 */
import { comparableTronAddress, getTronAccountControl, tronAccountControl } from './control'

const OWN = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'
const OWN_HEX = '41c8599111f29c1e1e061265b4af93ea1f274ad78a'
const THIEF = 'TUmdykWXNWHbRk3V4wFGKGHKMdh6jHzijm'
const THIEF_HEX = '41ce3a3f9bf96e8bffc550d96d6f8dd06d4a4eb633'

// /wallet/getaccount con visible: true, tal cual (recortado a lo que se lee)
const HIJACKED = {
	address: OWN,
	owner_permission: { permission_name: 'lol', threshold: 1, keys: [{ address: THIEF, weight: 1 }] },
	active_permission: [{ type: 'Active', id: 2, permission_name: 'kek', threshold: 1, operations: '7fff1fc0033ec30f000000000000000000000000000000000000000000000000', keys: [{ address: THIEF, weight: 1 }] }],
}

describe('comparableTronAddress', () => {
	it('base58 y hex 41… de la misma dirección dan lo mismo', () => {
		expect(comparableTronAddress(OWN)).toBe(OWN_HEX.slice(2))
		expect(comparableTronAddress(OWN_HEX)).toBe(OWN_HEX.slice(2))
		expect(comparableTronAddress(OWN_HEX.toUpperCase())).toBe(OWN_HEX.slice(2))
	})

	it('lo que no decodifica se compara tal cual', () => {
		expect(comparableTronAddress('no-es-una-direccion')).toBe('no-es-una-direccion')
		// checksum roto: última letra cambiada
		expect(comparableTronAddress(`${OWN.slice(0, -1)}J`)).toBe(`${OWN.slice(0, -1)}J`)
	})
})

describe('tronAccountControl', () => {
	it('cuenta de "abandon … about": el dueño es otra dirección', () => {
		expect(tronAccountControl(HIJACKED, OWN)).toEqual({ controlled: false, controllers: [THIEF] })
	})

	it('nodo que devuelve hex aunque se pida visible: sigue detectando al otro dueño', () => {
		const hex = { owner_permission: { threshold: 1, keys: [{ address: THIEF_HEX, weight: 1 }] } }
		expect(tronAccountControl(hex, OWN)).toEqual({ controlled: false, controllers: [THIEF_HEX] })
	})

	it('cuenta nunca activada ({}) o sin permisos explícitos: es propia', () => {
		expect(tronAccountControl({}, OWN)).toEqual({ controlled: true })
		expect(tronAccountControl(null, OWN)).toEqual({ controlled: true })
		expect(tronAccountControl({ owner_permission: { threshold: 1, keys: [] } }, OWN)).toEqual({ controlled: true })
	})

	it('permiso de dueño por defecto (su propia clave): es propia, también en hex', () => {
		expect(tronAccountControl({ owner_permission: { permission_name: 'owner', threshold: 1, keys: [{ address: OWN, weight: 1 }] } }, OWN)).toEqual({ controlled: true })
		expect(tronAccountControl({ owner_permission: { threshold: 1, keys: [{ address: OWN_HEX, weight: 1 }] } }, OWN)).toEqual({ controlled: true })
	})

	it('multifirma en la que la frase sola no llega al umbral: no la controla', () => {
		const multisig = { owner_permission: { threshold: 2, keys: [{ address: OWN, weight: 1 }, { address: THIEF, weight: 1 }] } }
		expect(tronAccountControl(multisig, OWN)).toEqual({ controlled: false, controllers: [THIEF] })
	})

	it('multifirma en la que la frase sola SÍ llega: la controla', () => {
		const multisig = { owner_permission: { threshold: 2, keys: [{ address: OWN, weight: '2' }, { address: THIEF, weight: 1 }] } }
		expect(tronAccountControl(multisig, OWN)).toEqual({ controlled: true })
	})

	it('solo cuenta el dueño: un permiso activo con la frase no basta si el dueño es otro', () => {
		const activeOnly = { owner_permission: HIJACKED.owner_permission, active_permission: [{ id: 2, threshold: 1, keys: [{ address: OWN, weight: 1 }] }] }
		expect(tronAccountControl(activeOnly, OWN).controlled).toBe(false)
	})

	it('controladores sin repetir', () => {
		const dup = { owner_permission: { threshold: 3, keys: [{ address: THIEF, weight: 1 }, { address: THIEF_HEX, weight: 1 }, { address: THIEF, weight: 1 }] } }
		expect(tronAccountControl(dup, OWN)).toEqual({ controlled: false, controllers: [THIEF, THIEF_HEX] })
	})
})

describe('getTronAccountControl', () => {
	afterEach(() => { delete global.fetch })

	it('pregunta /wallet/getaccount con visible: true y decide con su respuesta', async () => {
		const calls = []
		global.fetch = jest.fn(async (url, init) => {
			calls.push({ url, body: JSON.parse(init.body) })
			return { ok: true, status: 200, json: async () => HIJACKED, text: async () => JSON.stringify(HIJACKED) }
		})
		const result = await getTronAccountControl({ url: 'https://tron.example/' }, OWN)
		expect(result).toEqual({ controlled: false, controllers: [THIEF] })
		expect(calls[0].url).toBe('https://tron.example/wallet/getaccount')
		expect(calls[0].body).toEqual({ address: OWN, visible: true })
	})
})
