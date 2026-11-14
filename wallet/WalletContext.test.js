/**
 * Estado de la wallet. Lo que se fija aquí, con el Keychain y el disco simulados y la
 * derivación REAL:
 *
 * - Una seed que ya está en el teléfono no se pisa: ni porque el disco falló al arrancar,
 *   ni porque el contexto no la vio, ni porque el Keychain no contestó.
 * - Una wallet cuyas llaves no se dejan leer no se enseña como sana; se restaura solo con
 *   SU frase, o se elimina.
 * - Eliminar solo cuenta si el Keychain confirma que la seed ya no está.
 * @jest-environment node
 */
const mockAppState = { currentState: 'active', handlers: [] }
jest.mock('react-native', () => ({
	AppState: {
		get currentState() { return mockAppState.currentState },
		addEventListener: jest.fn((_event, handler) => {
			mockAppState.handlers.push(handler)
			return { remove: () => { mockAppState.handlers = mockAppState.handlers.filter(h => h !== handler) } }
		}),
	},
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}))
jest.mock('./keystore', () => ({
	getWalletCheck: jest.fn(),
	getWalletMnemonic: jest.fn(),
	removeWalletCheck: jest.fn(),
	removeWalletId: jest.fn(),
	removeWalletMnemonic: jest.fn(),
	setWalletCheck: jest.fn(),
	setWalletMnemonic: jest.fn(),
	walletSeedEntry: jest.fn(),
}))
const mockRouter = { probe: jest.fn(async () => {}) }
jest.mock('./registry/appRpcRouter', () => ({ useAppRpcRouter: () => mockRouter }))
jest.mock('../api/walletApi', () => ({ walletApi: { registerAddresses: jest.fn(async () => ({ success: true })) } }))
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, user: null }) }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getWalletCheck, getWalletMnemonic, removeWalletCheck, removeWalletId, removeWalletMnemonic, setWalletCheck, setWalletMnemonic, walletSeedEntry } from './keystore'
import { deriveAddresses } from './derive'
import { mnemonicToSeed } from './seed'
import { WalletProvider, useWallet } from './WalletContext'

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const OTHER_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const ADDRESSES = deriveAddresses(mnemonicToSeed(PHRASE))
const META_KEY = '@qpwallet:meta'

// ── El teléfono ──
let disk          // AsyncStorage
let diskBroken    // getItem lanza
let seed          // la frase que hay en el Keychain (null = ninguna)
let readable      // ¿se dejan leer las entradas del Keychain? (false = teléfono migrado, o bloqueado)
let keychainDown  // el Keychain ni contesta a «¿hay seed?»
let check         // el testigo
let deleteFails   // el borrado de la seed no surte efecto

const storedMeta = () => (disk[META_KEY] ? JSON.parse(disk[META_KEY]) : null)
/** Deja el teléfono con la wallet de PHRASE ya creada y respaldada. */
const withWallet = ({ witness = true, backedUp = true } = {}) => {
	seed = PHRASE
	disk[META_KEY] = JSON.stringify({ addresses: ADDRESSES, backedUp })
	check = witness ? ADDRESSES.evm.toLowerCase() : null
}

let tree
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
const renderWallet = async () => {
	const result = { current: null }
	const Harness = () => { result.current = useWallet(); return null }
	await act(async () => { tree = create(<WalletProvider><Harness /></WalletProvider>) })
	await settle()
	return result
}
const call = async (fn) => {
	let value
	await act(async () => { value = await fn() })
	await settle()
	return value
}
const appState = async (state) => {
	mockAppState.currentState = state
	await act(async () => { mockAppState.handlers.slice().forEach(handler => handler(state)) })
	await settle()
}

beforeEach(() => {
	jest.clearAllMocks()
	mockAppState.currentState = 'active'
	mockAppState.handlers = []
	disk = {}; diskBroken = false; seed = null; readable = true; keychainDown = false; check = null; deleteFails = false

	AsyncStorage.getItem.mockImplementation(async key => { if (diskBroken) throw new Error('disk'); return disk[key] ?? null })
	AsyncStorage.setItem.mockImplementation(async (key, value) => { disk[key] = value })
	AsyncStorage.removeItem.mockImplementation(async key => { delete disk[key] })

	walletSeedEntry.mockImplementation(async () => (keychainDown ? 'unknown' : seed ? 'present' : 'absent'))
	getWalletMnemonic.mockImplementation(async () => (readable ? seed : null))
	// El real se niega a pisar una seed salvo `overwrite`; aquí igual, para que un fallo del contexto se vea
	setWalletMnemonic.mockImplementation(async (mnemonic, { overwrite = false } = {}) => {
		if (!overwrite && (keychainDown || seed)) return false
		seed = mnemonic
		readable = true
		return true
	})
	removeWalletMnemonic.mockImplementation(async () => { if (deleteFails) return false; seed = null; return true })
	getWalletCheck.mockImplementation(async () => (readable ? check : null))
	setWalletCheck.mockImplementation(async address => { check = address.toLowerCase(); return true })
	removeWalletCheck.mockImplementation(async () => { check = null })
	removeWalletId.mockImplementation(async () => {})
})
afterEach(() => { act(() => { tree?.unmount() }) })

describe('arranque', () => {
	test('wallet sana: lista, y la seed ni se lee (responde el testigo)', async () => {
		withWallet()
		const wallet = await renderWallet()
		expect(wallet.current).toMatchObject({ isReady: true, hasWallet: true, isBackedUp: true, recovery: null, addresses: ADDRESSES })
		expect(getWalletMnemonic).not.toHaveBeenCalled()
	})

	test('primera vez tras actualizar (sin testigo): se lee una vez y queda el testigo para la próxima', async () => {
		withWallet({ witness: false, backedUp: false })
		const wallet = await renderWallet()
		expect(wallet.current).toMatchObject({ hasWallet: true, isBackedUp: false, recovery: null })
		expect(getWalletMnemonic).toHaveBeenCalledTimes(1)
		expect(check).toBe(ADDRESSES.evm.toLowerCase())
	})

	test('teléfono limpio: sin wallet y sin recovery', async () => {
		const wallet = await renderWallet()
		expect(wallet.current).toMatchObject({ isReady: true, hasWallet: false, recovery: null, addresses: null })
	})

	// Antes: cualquier fallo de la hidratación dejaba «sin wallet» y la app ofrecía crear o importar
	test('el disco falla al arrancar: la wallet sale de la seed, no «sin wallet»', async () => {
		withWallet()
		diskBroken = true
		const wallet = await renderWallet()
		expect(wallet.current).toMatchObject({ isReady: true, hasWallet: true, recovery: null, addresses: ADDRESSES })
	})

	test('seed sin metadata (reinstalar en iOS): la wallet reaparece, respaldada', async () => {
		seed = PHRASE
		const wallet = await renderWallet()
		expect(wallet.current).toMatchObject({ hasWallet: true, isBackedUp: true, addresses: ADDRESSES })
		expect(storedMeta()).toEqual({ addresses: ADDRESSES, backedUp: true })
	})
})

// Android copia los datos a un teléfono nuevo, pero no las claves del Keystore: la entrada
// de la seed existe y no se puede descifrar. Antes se veía la wallet entera, sin poder firmar
describe('wallet sin llaves (recovery)', () => {
	const migrated = async () => {
		withWallet()
		readable = false
		return renderWallet()
	}

	test('no se enseña como sana: ni direcciones ni saldos, y se dice qué pasa', async () => {
		const wallet = await migrated()
		expect(wallet.current).toMatchObject({ isReady: true, hasWallet: false, addresses: null, isBackedUp: false })
		expect(wallet.current.recovery).toEqual({ addresses: ADDRESSES, reason: 'unreadable' })
		// La metadata sigue en disco: es con lo que se comprueba la frase al restaurar
		expect(storedMeta().addresses).toEqual(ADDRESSES)
	})

	test('no se puede crear ni importar otra encima', async () => {
		const wallet = await migrated()
		expect(await call(() => wallet.current.createWallet())).toBeNull()
		expect(await call(() => wallet.current.importWallet(OTHER_PHRASE))).toBe(false)
		expect(setWalletMnemonic).not.toHaveBeenCalled()
		expect(seed).toBe(PHRASE)
	})

	test('restaurar solo acepta la frase de ESA wallet', async () => {
		const wallet = await migrated()
		expect(await call(() => wallet.current.restoreWallet('no es una frase'))).toBe('invalid')
		expect(await call(() => wallet.current.restoreWallet(OTHER_PHRASE))).toBe('mismatch')
		expect(setWalletMnemonic).not.toHaveBeenCalled()
		expect(wallet.current.hasWallet).toBe(false)

		expect(await call(() => wallet.current.restoreWallet(`  ${PHRASE.toUpperCase()}  `))).toBe('ok')
		expect(setWalletMnemonic).toHaveBeenCalledWith(PHRASE, { overwrite: true })
		expect(wallet.current).toMatchObject({ hasWallet: true, isBackedUp: true, recovery: null, addresses: ADDRESSES })
		expect(check).toBe(ADDRESSES.evm.toLowerCase())
	})

	test('sin saber qué wallet es, no se restaura a ciegas (podría pisarse otra)', async () => {
		seed = PHRASE
		readable = false
		const wallet = await renderWallet()
		expect(wallet.current.recovery).toEqual({ addresses: null, reason: 'unreadable' })
		expect(await call(() => wallet.current.restoreWallet(PHRASE))).toBe('unverifiable')
		expect(setWalletMnemonic).not.toHaveBeenCalled()
	})

	test('si el fallo era pasajero, al volver la app al frente la wallet vuelve sola', async () => {
		const wallet = await migrated()
		readable = true
		await appState('background')
		await appState('active')
		expect(wallet.current).toMatchObject({ hasWallet: true, recovery: null, addresses: ADDRESSES })
	})

	test('recheckKeys dice si ya es usable', async () => {
		const wallet = await migrated()
		expect(await call(() => wallet.current.recheckKeys())).toBe(false)
		readable = true
		expect(await call(() => wallet.current.recheckKeys())).toBe(true)
		expect(wallet.current.hasWallet).toBe(true)
	})

	test('se puede eliminar, y entonces sí se puede crear otra', async () => {
		const wallet = await migrated()
		expect(await call(() => wallet.current.deleteWallet())).toBe(true)
		expect(wallet.current).toMatchObject({ hasWallet: false, recovery: null })
		const created = await call(() => wallet.current.createWallet())
		expect(created.split(' ')).toHaveLength(12)
		expect(wallet.current.hasWallet).toBe(true)
	})

	test('el Keychain ni contesta: tampoco es «sin wallet»', async () => {
		withWallet()
		keychainDown = true
		const wallet = await renderWallet()
		expect(wallet.current.hasWallet).toBe(false)
		expect(wallet.current.recovery).toEqual({ addresses: ADDRESSES, reason: 'unknown' })
	})

	// iOS: un proceso arrancado en segundo plano con el teléfono bloqueado no puede leer el Keychain
	test('arranque en segundo plano con el Keychain cerrado: no decide nada hasta salir al frente', async () => {
		withWallet()
		readable = false
		mockAppState.currentState = 'background'
		const wallet = await renderWallet()
		expect(wallet.current).toMatchObject({ isReady: false, hasWallet: false, recovery: null })

		readable = true
		await appState('active')
		expect(wallet.current).toMatchObject({ isReady: true, hasWallet: true, recovery: null })
	})
})

describe('una seed que ya está no se pisa', () => {
	test('crear con una seed que el contexto no vio: se recoge en vez de pisarla', async () => {
		const wallet = await renderWallet()
		expect(wallet.current.hasWallet).toBe(false)
		// La seed estaba (o apareció) y el contexto sigue creyendo que no hay wallet
		seed = PHRASE
		expect(await call(() => wallet.current.createWallet())).toBeNull()
		expect(setWalletMnemonic).not.toHaveBeenCalled()
		expect(seed).toBe(PHRASE)
		expect(wallet.current).toMatchObject({ hasWallet: true, addresses: ADDRESSES })
	})

	test('importar, igual', async () => {
		const wallet = await renderWallet()
		seed = PHRASE
		expect(await call(() => wallet.current.importWallet(OTHER_PHRASE))).toBe(false)
		expect(setWalletMnemonic).not.toHaveBeenCalled()
		expect(seed).toBe(PHRASE)
	})

	test('si el Keychain no contesta, ni se crea ni se importa', async () => {
		const wallet = await renderWallet()
		keychainDown = true
		expect(await call(() => wallet.current.createWallet())).toBeNull()
		expect(await call(() => wallet.current.importWallet(PHRASE))).toBe(false)
		expect(setWalletMnemonic).not.toHaveBeenCalled()
		expect(wallet.current.recovery).toEqual({ addresses: null, reason: 'unknown' })
	})

	test('con wallet ya creada, crear e importar no hacen nada', async () => {
		withWallet()
		const wallet = await renderWallet()
		expect(await call(() => wallet.current.createWallet())).toBeNull()
		expect(await call(() => wallet.current.importWallet(OTHER_PHRASE))).toBe(false)
		expect(setWalletMnemonic).not.toHaveBeenCalled()
	})
})

describe('crear e importar en limpio', () => {
	test('crear: devuelve la frase una vez, guarda seed, testigo y metadata sin respaldar', async () => {
		const wallet = await renderWallet()
		const created = await call(() => wallet.current.createWallet())
		expect(created.split(' ')).toHaveLength(12)
		expect(seed).toBe(created)
		const addresses = deriveAddresses(mnemonicToSeed(created))
		expect(check).toBe(addresses.evm.toLowerCase())
		expect(storedMeta()).toEqual({ addresses, backedUp: false })
		expect(wallet.current).toMatchObject({ hasWallet: true, isBackedUp: false, addresses })
	})

	test('importar: queda respaldada', async () => {
		const wallet = await renderWallet()
		expect(await call(() => wallet.current.importWallet('no vale'))).toBe(false)
		expect(await call(() => wallet.current.importWallet(PHRASE))).toBe(true)
		expect(seed).toBe(PHRASE)
		expect(wallet.current).toMatchObject({ hasWallet: true, isBackedUp: true, addresses: ADDRESSES })
	})
})

describe('eliminar', () => {
	test('si el Keychain no confirma que la seed ya no está, la wallet NO se elimina', async () => {
		withWallet()
		deleteFails = true
		const wallet = await renderWallet()
		expect(await call(() => wallet.current.deleteWallet())).toBe(false)
		expect(wallet.current).toMatchObject({ hasWallet: true, addresses: ADDRESSES })
		expect(storedMeta()).not.toBeNull()
		expect(removeWalletId).not.toHaveBeenCalled()
		expect(removeWalletCheck).not.toHaveBeenCalled()
	})

	test('confirmado: se va la seed, el testigo, el ID de wallet y la metadata', async () => {
		withWallet()
		const wallet = await renderWallet()
		expect(await call(() => wallet.current.deleteWallet())).toBe(true)
		expect(wallet.current).toMatchObject({ hasWallet: false, recovery: null, addresses: null })
		expect(seed).toBeNull()
		expect(check).toBeNull()
		expect(storedMeta()).toBeNull()
		expect(removeWalletId).toHaveBeenCalledTimes(1)
	})
})
