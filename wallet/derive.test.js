/**
 * @jest-environment node
 *
 * Vectores conocidos de derivación. El mnemonic de prueba es el estándar de
 * la spec BIP-84 ("abandon … about"); las direcciones esperadas están
 * verificadas contra Trust Wallet, MetaMask y la propia spec — si esto pasa,
 * importar la misma frase en cualquier wallet da las mismas direcciones.
 */
import { createMnemonic, isValidMnemonic, mnemonicToSeed, normalizeMnemonic, pickQuizPositions } from './seed'
import { deriveAddresses, derivePrivateKey, DERIVATION_PATHS } from './derive'

const toHex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('seed', () => {
	test('genera mnemonics de 12 palabras válidos y distintos', () => {
		const a = createMnemonic()
		const b = createMnemonic()
		expect(a.split(' ')).toHaveLength(12)
		expect(isValidMnemonic(a)).toBe(true)
		expect(a).not.toBe(b)
	})

	test('valida el checksum, no solo las palabras', () => {
		expect(isValidMnemonic(TEST_MNEMONIC)).toBe(true)
		// misma lista de palabras, checksum roto
		expect(isValidMnemonic(TEST_MNEMONIC.replace('about', 'abandon'))).toBe(false)
		expect(isValidMnemonic('palabras fuera de lista bip39 x y z w q r t u')).toBe(false)
	})

	test('normaliza mayúsculas y espacios del input del usuario', () => {
		expect(normalizeMnemonic('  Abandon   ABANDON\tabandon ')).toBe('abandon abandon abandon')
		expect(isValidMnemonic(`  ${TEST_MNEMONIC.toUpperCase()}  `)).toBe(true)
	})

	test('mnemonicToSeed devuelve los 64 bytes de la spec BIP-39', () => {
		const seed = mnemonicToSeed(TEST_MNEMONIC)
		expect(seed).toHaveLength(64)
		// Primeros bytes del vector público de la spec BIP-84 (seed sin passphrase)
		expect(toHex(seed.slice(0, 8))).toBe('5eb00bbddcf06908')
	})

	test('el quiz elige posiciones distintas y ordenadas', () => {
		const positions = pickQuizPositions(12, 3)
		expect(positions).toHaveLength(3)
		expect(new Set(positions).size).toBe(3)
		expect([...positions].sort((a, b) => a - b)).toEqual(positions)
		positions.forEach(p => { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(12) })
	})
})

describe('deriveAddresses — vectores conocidos', () => {
	const addresses = deriveAddresses(mnemonicToSeed(TEST_MNEMONIC))

	test("EVM m/44'/60'/0'/0/0 (ETH/BSC/Base comparten dirección)", () => {
		expect(addresses.evm).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')
	})

	test("TRON m/44'/195'/0'/0/0", () => {
		expect(addresses.tron).toBe('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH')
	})

	test("BTC m/84'/0'/0'/0/0 (primer address de la spec BIP-84)", () => {
		expect(addresses.btc).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
	})

	test('STX: cuenta 0 de Leather/Xverse (m/44\'/5757\'/0\'/0/0, c32check SP…)', () => {
		expect(addresses.stx).toBe('SPC5KHM41H6WHAST7MWWDD807YSPRQKJ69FSH54J')
		expect(addresses.stxPublicKey).toMatch(/^0[23][0-9a-f]{64}$/)
	})
})

describe('derivePrivateKey', () => {
	test('claves de 32 bytes, distintas por familia, deterministas', () => {
		const seed = mnemonicToSeed(TEST_MNEMONIC)
		const keys = Object.keys(DERIVATION_PATHS).map(family => derivePrivateKey(seed, family))
		keys.forEach(k => expect(k).toHaveLength(32))
		expect(new Set(keys.map(toHex)).size).toBe(keys.length)
		expect(derivePrivateKey(seed, 'evm')).toEqual(derivePrivateKey(seed, 'evm'))
	})

	test("la privada EVM del vector es la publicada de la frase de prueba", () => {
		const seed = mnemonicToSeed(TEST_MNEMONIC)
		expect(toHex(derivePrivateKey(seed, 'evm')))
			.toBe('1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727')
	})
})
