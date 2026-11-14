/**
 * Qué wallet hay en el teléfono al arrancar (lógica pura). Lo que se fija aquí:
 *
 * - Una wallet cuya seed no se deja leer NO se enseña como sana (Android copia los datos a
 *   un teléfono nuevo, pero no las claves que los descifran).
 * - Un fallo de lectura NUNCA se convierte en «no hay wallet»: ahí la app ofrecía crear o
 *   importar, y la seed que seguía en el Keychain se pisaba.
 * - En lo normal la seed ni se descifra: responde por ella un testigo sin nada secreto.
 * @jest-environment node
 */
import { hydrateWallet, parseWalletMeta, sameWallet } from './walletHydration'

const ADDRESSES = { evm: '0xAbC0000000000000000000000000000000000001', tron: 'TXyz1', btc: 'bc1qaaa', stx: 'SP111', stxPublicKey: '02aa', sol: 'So1111' }
const OTHER = { evm: '0xDeF0000000000000000000000000000000000002', tron: 'TXyz2', btc: 'bc1qbbb', stx: 'SP222', stxPublicKey: '02bb', sol: 'So2222' }
const META = JSON.stringify({ addresses: ADDRESSES, backedUp: false })
const PHRASE = 'frase de la wallet uno'

/** Un teléfono sano: metadata, seed legible y testigo que la avala. Cada test cambia lo suyo. */
const phone = (overrides = {}) => ({
	readMeta: jest.fn(async () => META),
	seedEntry: jest.fn(async () => 'present'),
	readCheck: jest.fn(async () => ADDRESSES.evm.toLowerCase()),
	readMnemonic: jest.fn(async () => PHRASE),
	isValidMnemonic: jest.fn(() => true),
	derive: jest.fn(mnemonic => (mnemonic === PHRASE ? ADDRESSES : OTHER)),
	...overrides,
})

describe('lo normal', () => {
	test('con el testigo en regla la wallet está lista y la seed NI SE LEE', async () => {
		const deps = phone()
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: false }, verified: false })
		expect(deps.readMnemonic).not.toHaveBeenCalled()
		expect(deps.derive).not.toHaveBeenCalled()
	})

	test('sin seed en el Keychain no hay wallet, diga lo que diga la metadata', async () => {
		const deps = phone({ seedEntry: async () => 'absent' })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'none' })
		expect(deps.readMnemonic).not.toHaveBeenCalled()
	})

	test('teléfono limpio: ni metadata ni seed', async () => {
		expect(await hydrateWallet(phone({ readMeta: async () => null, seedEntry: async () => 'absent' }))).toEqual({ kind: 'none' })
	})
})

describe('sin testigo que valga se comprueba la seed de verdad', () => {
	test('primera vez tras actualizar (no hay testigo): se lee, se da por buena y se conserva el estado del backup', async () => {
		const deps = phone({ readCheck: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: false }, verified: true })
		expect(deps.readMnemonic).toHaveBeenCalledTimes(1)
	})

	test('un testigo de OTRA dirección no avala nada', async () => {
		const deps = phone({ readCheck: async () => OTHER.evm.toLowerCase() })
		expect((await hydrateWallet(deps)).verified).toBe(true)
		expect(deps.readMnemonic).toHaveBeenCalledTimes(1)
	})

	test('el testigo se compara sin distinguir mayúsculas (la EVM lleva checksum)', async () => {
		const deps = phone({ readCheck: async () => ADDRESSES.evm.toUpperCase() })
		expect((await hydrateWallet(deps)).verified).toBe(false)
	})

	test('metadata de antes de Stacks o Solana: se re-deriva aunque el testigo coincida', async () => {
		const old = JSON.stringify({ addresses: { evm: ADDRESSES.evm, tron: ADDRESSES.tron, btc: ADDRESSES.btc }, backedUp: true })
		const deps = phone({ readMeta: async () => old })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: true }, verified: true })
	})

	test('seed sin metadata (reinstalar en iOS, disco limpio): se deriva y el backup se da por hecho', async () => {
		const deps = phone({ readMeta: async () => null, readCheck: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: true }, verified: true })
	})

	test('metadata de OTRA seed: manda la seed que hay en el Keychain', async () => {
		const deps = phone({ readMeta: async () => JSON.stringify({ addresses: OTHER, backedUp: false }), readCheck: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: true }, verified: true })
	})
})

describe('wallet sin llaves: no se enseña como sana', () => {
	test('Android tras pasar de teléfono: la entrada existe, ni el testigo ni la seed se dejan leer', async () => {
		const deps = phone({ readCheck: async () => null, readMnemonic: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'recovery', recovery: { addresses: ADDRESSES, reason: 'unreadable' } })
	})

	test('sin metadata tampoco se inventa: hay algo y no se sabe qué', async () => {
		const deps = phone({ readMeta: async () => null, readCheck: async () => null, readMnemonic: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'recovery', recovery: { addresses: null, reason: 'unreadable' } })
	})

	test('lo leído no es una frase (entrada corrupta): tampoco vale', async () => {
		const deps = phone({ readCheck: async () => null, isValidMnemonic: () => false })
		expect(await hydrateWallet(deps)).toMatchObject({ kind: 'recovery', recovery: { reason: 'unreadable' } })
		expect(deps.derive).not.toHaveBeenCalled()
	})
})

describe('un fallo NUNCA es «no hay wallet»', () => {
	test('el Keychain no responde: no se sabe, y se conservan las direcciones conocidas', async () => {
		const deps = phone({ seedEntry: async () => 'unknown' })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'recovery', recovery: { addresses: ADDRESSES, reason: 'unknown' } })
	})

	test('el Keychain no responde y tampoco hay metadata', async () => {
		const deps = phone({ seedEntry: async () => 'unknown', readMeta: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'recovery', recovery: { addresses: null, reason: 'unknown' } })
	})

	test('AsyncStorage revienta pero la seed está: la wallet sale de la seed, no «sin wallet»', async () => {
		const deps = phone({ readMeta: async () => { throw new Error('disk') } })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: true }, verified: true })
	})

	test.each(['{', 'null', '[]', '"texto"', '{"addresses":null}', '{"addresses":{}}', '{"addresses":{"evm":""}}', '{"backedUp":true}'])('metadata corrupta (%s) con seed legible: igual', async (raw) => {
		const deps = phone({ readMeta: async () => raw })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'ready', meta: { addresses: ADDRESSES, backedUp: true }, verified: true })
	})

	test('AsyncStorage revienta Y la seed no se deja leer: recovery, jamás «sin wallet»', async () => {
		const deps = phone({ readMeta: async () => { throw new Error('disk') }, readMnemonic: async () => null })
		expect(await hydrateWallet(deps)).toEqual({ kind: 'recovery', recovery: { addresses: null, reason: 'unreadable' } })
	})
})

describe('piezas', () => {
	test('parseWalletMeta: backedUp solo es false si lo dice', () => {
		expect(parseWalletMeta(META)).toEqual({ addresses: ADDRESSES, backedUp: false })
		expect(parseWalletMeta(JSON.stringify({ addresses: ADDRESSES })).backedUp).toBe(true)
		expect(parseWalletMeta(JSON.stringify({ addresses: ADDRESSES, backedUp: 'no' })).backedUp).toBe(true)
		expect(parseWalletMeta(null)).toBeNull()
		expect(parseWalletMeta('')).toBeNull()
	})

	test('sameWallet compara por la dirección EVM, sin mayúsculas', () => {
		expect(sameWallet(ADDRESSES, { ...OTHER, evm: ADDRESSES.evm.toLowerCase() })).toBe(true)
		expect(sameWallet(ADDRESSES, OTHER)).toBe(false)
	})
})
