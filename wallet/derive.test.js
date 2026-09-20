/**
 * @jest-environment node
 *
 * Vectores conocidos de derivación. El mnemonic de prueba es el estándar de
 * la spec BIP-84 ("abandon … about"); las direcciones esperadas están
 * verificadas contra Trust Wallet, MetaMask y la propia spec — si esto pasa,
 * importar la misma frase en cualquier wallet da las mismas direcciones.
 */
import { createMnemonic, isValidMnemonic, mnemonicToSeed, normalizeMnemonic, pickQuizPositions } from './seed'
import { deriveAddresses, deriveEd25519, derivePrivateKey, DERIVATION_PATHS } from './derive'

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

	test("SOL: cuenta 0 de Phantom/Solflare (SLIP-0010 ed25519 m/44'/501'/0'/0')", () => {
		expect(addresses.sol).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')
	})
})

describe('SLIP-0010 ed25519 — vectores de la spec (seed 000102…0f)', () => {
	const seed = Uint8Array.from({ length: 16 }, (_, i) => i)
	test("m, m/0' y m/0'/1'", () => {
		expect(toHex(deriveEd25519(seed, 'm').privateKey)).toBe('2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7')
		expect(toHex(deriveEd25519(seed, "m/0'").privateKey)).toBe('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3')
		expect(toHex(deriveEd25519(seed, "m/0'/1'").privateKey)).toBe('b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2')
	})
	test('rechaza índices no endurecidos', () => {
		expect(() => deriveEd25519(seed, "m/0'/1")).toThrow(/endurecidos/)
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
