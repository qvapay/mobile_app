/**
 * @jest-environment node
 */
import { splitAddress, isAddressLike } from './addressHighlight'

const TRON = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'

describe('isAddressLike', () => {
	test('acepta direcciones de las familias de la wallet', () => {
		expect(isAddressLike(TRON)).toBe(true)
		expect(isAddressLike('0x52908400098527886E0F7030069857D2E4169EE7')).toBe(true)
		expect(isAddressLike('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true)
	})

	test('rechaza texto libre, URIs, Lightning addresses y valores cortos', () => {
		expect(isAddressLike('mi cuenta de ahorro')).toBe(false)
		expect(isAddressLike('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false)
		expect(isAddressLike('satoshi@getalby.com')).toBe(false)
		expect(isAddressLike('ABCDEF123456')).toBe(false)
		expect(isAddressLike('')).toBe(false)
		expect(isAddressLike(null)).toBe(false)
	})
})

describe('splitAddress', () => {
	test('completa: extremos de 6 y el resto en medio', () => {
		expect(splitAddress(TRON)).toEqual({ head: 'TUEZSd', middle: 'KsoDHQMeZwihtdoBiN46zx', tail: 'hGWYdH' })
	})

	test('recortada: resalta los 6 de fuera y deja visibles los pedidos', () => {
		expect(splitAddress(TRON, { visible: { head: 6, tail: 6 } })).toEqual({ head: 'TUEZSd', middle: '…', tail: 'hGWYdH' })
		expect(splitAddress(TRON, { visible: { head: 10, tail: 10 } })).toEqual({ head: 'TUEZSd', middle: 'KsoD…46zx', tail: 'hGWYdH' })
	})

	test('si el recorte no ahorra nada, la deja entera', () => {
		const short = 'ABCDEFG123456'
		expect(splitAddress(short, { visible: { head: 6, tail: 6 } })).toEqual({ head: 'ABCDEF', middle: 'G', tail: '123456' })
	})

	test('lo que no parece dirección devuelve null', () => {
		expect(splitAddress('hola mundo esto no es')).toBeNull()
	})
})
