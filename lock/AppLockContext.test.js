/**
 * Unit tests for the PIN-based app lock — node environment with the auth,
 * settings, Keychain helpers and AppState mocked (see keypadAmount.test.js
 * for why node env).
 * @jest-environment node
 */
let appStateHandler = null
jest.mock('react-native', () => ({
	AppState: {
		currentState: 'active',
		addEventListener: jest.fn((event, handler) => {
			appStateHandler = handler
			return { remove: jest.fn() }
		}),
	},
}))
// Marcador biométrico propio del bloqueo (Keychain en iOS, BiometricGate en Android): no existe en jest
jest.mock('../helpers/biometricMarker', () => ({
	hasBiometricMarker: jest.fn(async () => false),
	enableBiometricMarker: jest.fn(async () => true),
	disableBiometricMarker: jest.fn(async () => {}),
	authenticateBiometricMarker: jest.fn(async () => false),
}))
// Prueba de dueño del dispositivo (diálogo del sistema): no existe en jest
jest.mock('../helpers/deviceOwnerProof', () => ({
	confirmDeviceOwner: jest.fn(async () => 'success'),
	ownerProofPasses: (outcome) => outcome === 'success' || outcome === 'unavailable',
}))
// Solo «¿hay una seed en el Keychain?»: el resto del almacén no se usa aquí
jest.mock('../wallet/keystore', () => ({ walletSeedEntry: jest.fn(async () => 'absent') }))
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../api/client', () => ({
	getSupportedBiometryType: jest.fn(async () => null),
	getBiometricCredentials: jest.fn(),
	readAppLockPin: jest.fn(),
	setAppLockPin: jest.fn(),
	hasAppLockPin: jest.fn(),
	appLockPinStatus: jest.fn(),
	removeAppLockPin: jest.fn(),
	getPinAttemptsRecord: jest.fn(),
	setPinAttemptsRecord: jest.fn(),
	clearPinAttemptsRecord: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { useWallet } from '../wallet/WalletContext'
import { authenticateBiometricMarker, disableBiometricMarker, hasBiometricMarker } from '../helpers/biometricMarker'
import { confirmDeviceOwner } from '../helpers/deviceOwnerProof'
import { walletSeedEntry } from '../wallet/keystore'
import {
	getBiometricCredentials,
	readAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	appLockPinStatus,
	removeAppLockPin,
	getPinAttemptsRecord,
	setPinAttemptsRecord,
	clearPinAttemptsRecord,
} from '../api/client'
import { AppLockProvider, useAppLock } from './AppLockContext'

const updateSetting = jest.fn()

// El contador de fallos del PIN tal como queda en el Keychain (null = nunca se guardó)
let attemptsRecord = null
const storedAttempts = () => JSON.parse(attemptsRecord)
/** Deja en el Keychain `failures` fallos seguidos, el último hace `agoMs`. */
const seedAttempts = (failures, agoMs = 0) => { attemptsRecord = JSON.stringify({ f: failures, t: Date.now() - agoMs }) }

const renderAppLock = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useAppLock()
		return null
	}
	await act(async () => {
		create(
			<AppLockProvider>
				<Harness />
			</AppLockProvider>
		)
	})
	return result
}

const goBackgroundAndReturn = async (elapsedMs) => {
	await act(async () => { appStateHandler('background') })
	await act(async () => { jest.advanceTimersByTime(elapsedMs) })
	await act(async () => { appStateHandler('active') })
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	appStateHandler = null
	useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false })
	useWallet.mockReturnValue({ hasWallet: false, isReady: true })
	useSettings.mockReturnValue({
		security: { autoLockTimeout: 5 },
		isLoading: false,
		updateSetting,
	})
	hasAppLockPin.mockResolvedValue(false)
	readAppLockPin.mockResolvedValue(null)
	// «¿Hay un PIN que sirva?» sale de lo mismo que fija cada test: que la entrada exista
	// (hasAppLockPin) y que se deje leer (readAppLockPin)
	appLockPinStatus.mockImplementation(async () => {
		if (!(await hasAppLockPin())) return 'none'
		try { await readAppLockPin(); return 'set' } catch { return 'unreadable' }
	})
	setAppLockPin.mockResolvedValue(true)
	removeAppLockPin.mockResolvedValue(true)
	attemptsRecord = null
	getPinAttemptsRecord.mockImplementation(async () => attemptsRecord)
	setPinAttemptsRecord.mockImplementation(async (record) => { attemptsRecord = record; return true })
	clearPinAttemptsRecord.mockImplementation(async () => { attemptsRecord = null; return true })
	confirmDeviceOwner.mockResolvedValue('success')
	walletSeedEntry.mockResolvedValue('absent')
})
afterEach(() => { jest.useRealTimers() })

test('useAppLock throws outside an AppLockProvider', () => {
	const Naked = () => {
		useAppLock()
		return null
	}
	expect(() => { act(() => { create(<Naked />) }) }).toThrow('useAppLock must be used within an AppLockProvider')
})

describe('cold start', () => {
	test('locks immediately when authenticated and a PIN exists', async () => {
		hasAppLockPin.mockResolvedValue(true)
		const lock = await renderAppLock()
		expect(lock.current.appLockEnabled).toBe(true)
		expect(lock.current.isLocked).toBe(true)
	})

	test('stays unlocked without a stored PIN', async () => {
		const lock = await renderAppLock()
		expect(lock.current.appLockEnabled).toBe(false)
		expect(lock.current.isLocked).toBe(false)
	})

	// Novedades espera a `isReady` para presentarse: nunca puede verse «listo» con
	// el bloqueo aún sin poner (en iOS le quitaría el modal de delante)
	test('isReady flips only once the lock decision is made, never ahead of isLocked', async () => {
		let resolvePin
		hasAppLockPin.mockReturnValue(new Promise((resolve) => { resolvePin = resolve }))
		const seen = []
		const Harness = () => {
			const { isReady, isLocked } = useAppLock()
			seen.push({ isReady, isLocked })
			return null
		}
		await act(async () => { create(<AppLockProvider><Harness /></AppLockProvider>) })
		expect(seen.at(-1)).toEqual({ isReady: false, isLocked: false })

		await act(async () => { resolvePin(true) })
		expect(seen.at(-1)).toEqual({ isReady: true, isLocked: true })
		expect(seen.some(s => s.isReady && !s.isLocked)).toBe(false)
	})

	test('isReady also flips without a PIN', async () => {
		const lock = await renderAppLock()
		expect(lock.current.isReady).toBe(true)
	})

	test('isLocked is AND-ed with isAuthenticated — logging out dismisses the lock', async () => {
		hasAppLockPin.mockResolvedValue(true)
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(false)
	})

	test('without a session, a wallet on the phone still locks at cold start', async () => {
		hasAppLockPin.mockResolvedValue(true)
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		useWallet.mockReturnValue({ hasWallet: true, isReady: true })
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(true)
	})

	test('creating the wallet mid-session does not lock (the backup would be cut)', async () => {
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		// Mismo patrón que renderAppLock, pero conservando el árbol para re-renderizar
		const result = { current: null }
		const Harness = () => {
			result.current = useAppLock()
			return null
		}
		let tree
		await act(async () => { tree = create(<AppLockProvider><Harness /></AppLockProvider>) })
		await act(async () => { await result.current.enableAppLock('1234') })
		hasAppLockPin.mockResolvedValue(true)
		useWallet.mockReturnValue({ hasWallet: true, isReady: true })
		await act(async () => { tree.update(<AppLockProvider><Harness /></AppLockProvider>) })
		expect(result.current.isLocked).toBe(false)
		expect(result.current.appLockEnabled).toBe(true)
	})

	test('signing in mid-session (e.g. from wallet-only) does not re-lock', async () => {
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		useWallet.mockReturnValue({ hasWallet: true, isReady: true })
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const result = { current: null }
		const Harness = () => {
			result.current = useAppLock()
			return null
		}
		let tree
		await act(async () => { tree = create(<AppLockProvider><Harness /></AppLockProvider>) })
		expect(result.current.isLocked).toBe(true) // arranque en frío con wallet
		await act(async () => { await result.current.unlockWithPin('1234') })
		useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false })
		await act(async () => { tree.update(<AppLockProvider><Harness /></AppLockProvider>) })
		expect(result.current.isLocked).toBe(false)
	})

	test('a lock left behind by a dropped session does not resurface on a new guest wallet', async () => {
		hasAppLockPin.mockResolvedValue(true)
		const result = { current: null }
		const Harness = () => {
			result.current = useAppLock()
			return null
		}
		let tree
		const render = () => <AppLockProvider><Harness /></AppLockProvider>
		await act(async () => { tree = create(render()) })
		expect(result.current.isLocked).toBe(true) // cuenta + PIN en frío
		// La sesión cae con la pantalla de bloqueo delante y sin wallet
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		await act(async () => { tree.update(render()) })
		// Alta de wallet de invitado: el bloqueo viejo NO vuelve
		useWallet.mockReturnValue({ hasWallet: true, isReady: true })
		await act(async () => { tree.update(render()) })
		expect(result.current.isLocked).toBe(false)
	})

	// La seed está en el teléfono pero ahora no se deja leer (`recovery`): si no contara, ese
	// fallo se saltaría el bloqueo y al volver las llaves la wallet quedaría a la vista sin PIN
	test('without a session, a wallet whose keys cannot be read right now still locks', async () => {
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		useWallet.mockReturnValue({ hasWallet: false, recovery: { addresses: null, reason: 'unknown' }, isReady: true })
		hasAppLockPin.mockResolvedValue(true)
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(true)
	})

	test('waits for the wallet to hydrate before deciding', async () => {
		hasAppLockPin.mockResolvedValue(true)
		useWallet.mockReturnValue({ hasWallet: false, isReady: false })
		const lock = await renderAppLock()
		expect(hasAppLockPin).not.toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(false)
	})
})

describe('background/foreground auto-lock', () => {
	test('re-locks when the background stay reaches autoLockTimeout', async () => {
		hasAppLockPin.mockResolvedValue(true)
		const lock = await renderAppLock()
		await act(async () => { await lock.current.unlockWithPin('1234') }) // clear the cold-start lock
		readAppLockPin.mockResolvedValue('1234')
		await act(async () => { await lock.current.unlockWithPin('1234') })
		expect(lock.current.isLocked).toBe(false)

		await goBackgroundAndReturn(5 * 60 * 1000)
		expect(lock.current.isLocked).toBe(true)
	})

	test('a brief app switch does not lock', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		await act(async () => { await lock.current.unlockWithPin('1234') })

		await goBackgroundAndReturn(30 * 1000)
		expect(lock.current.isLocked).toBe(false)
	})

	test('never locks while app lock is disabled', async () => {
		const lock = await renderAppLock()
		await goBackgroundAndReturn(60 * 60 * 1000)
		expect(lock.current.isLocked).toBe(false)
	})
})

describe('unlockWithPin', () => {
	test('unlocks when the PIN matches the Keychain value', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin('1234') })
		expect(outcome).toEqual({ success: true })
		expect(lock.current.isLocked).toBe(false)
	})

	test('rejects a wrong PIN and stays locked', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin('0000') })
		expect(outcome).toEqual({ success: false, error: 'PIN incorrecto' })
		expect(lock.current.isLocked).toBe(true)
	})

	test('a Keychain read failure reports a verification error', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockRejectedValue(new Error('locked out'))
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin('1234') })
		expect(outcome).toEqual({ success: false, error: 'Error verificando PIN', unreadable: true })
	})
})

describe('unlockWithBiometrics', () => {
	test('unlocks when the user authenticates in our own prompt', async () => {
		hasAppLockPin.mockResolvedValue(true)
		hasBiometricMarker.mockResolvedValue(true)
		authenticateBiometricMarker.mockResolvedValue(true)
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithBiometrics() })
		expect(outcome).toEqual({ success: true })
		expect(lock.current.isLocked).toBe(false)
	})

	test('a cancelled prompt keeps the lock', async () => {
		hasAppLockPin.mockResolvedValue(true)
		hasBiometricMarker.mockResolvedValue(true)
		authenticateBiometricMarker.mockResolvedValue(false)
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithBiometrics() })
		expect(outcome).toEqual({ success: false, error: 'Autenticación biométrica cancelada' })
		expect(lock.current.isLocked).toBe(true)
	})

	// Aceptan el código del teléfono y, en Android, se leían sin diálogo en los 5 s
	// siguientes a desbloquear el móvil: sin marcador propio, solo el PIN
	test('the login credentials no longer unlock (no marker = PIN only)', async () => {
		hasAppLockPin.mockResolvedValue(true)
		hasBiometricMarker.mockResolvedValue(false)
		getBiometricCredentials.mockResolvedValue({ email: 'a@b.co', password: 'pw' })
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithBiometrics() })
		expect(outcome.success).toBe(false)
		expect(getBiometricCredentials).not.toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(true)
	})
})

describe('background cover', () => {
	const unlocked = async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		await act(async () => { await lock.current.unlockWithPin('1234') })
		return lock
	}

	test('going to background covers the app', async () => {
		const lock = await unlocked()
		expect(lock.current.isCovered).toBe(false)
		await act(async () => { appStateHandler('background') })
		expect(lock.current.isCovered).toBe(true)
		expect(lock.current.isLocked).toBe(false)
	})

	test('a brief stay uncovers on return, without locking', async () => {
		const lock = await unlocked()
		await goBackgroundAndReturn(30 * 1000)
		expect(lock.current.isCovered).toBe(false)
		expect(lock.current.isLocked).toBe(false)
	})

	// Mismo render: LockScreen pasa de cortina a bloqueo sin dejar ver la app entre medias
	test('past the timeout the cover turns into the lock in the same render', async () => {
		const lock = await unlocked()
		const seen = []
		await act(async () => { appStateHandler('background') })
		await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000) })
		await act(async () => { appStateHandler('active') })
		seen.push([lock.current.isCovered, lock.current.isLocked])
		expect(seen).toEqual([[false, true]])
	})

	// 'inactive' también salta con el propio Face ID (iOS): taparía la app al firmar
	test('inactive alone does not cover', async () => {
		const lock = await unlocked()
		await act(async () => { appStateHandler('inactive') })
		expect(lock.current.isCovered).toBe(false)
	})

	test('never covers while app lock is disabled', async () => {
		const lock = await renderAppLock()
		await act(async () => { appStateHandler('background') })
		expect(lock.current.isCovered).toBe(false)
	})
})

describe('enable / disable / change PIN', () => {
	test('enableAppLock stores the PIN and arms the lock WITHOUT locking now', async () => {
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.enableAppLock('9999') })
		expect(outcome).toEqual({ success: true })
		expect(setAppLockPin).toHaveBeenCalledWith('9999')
		expect(lock.current.appLockEnabled).toBe(true)
		expect(lock.current.isLocked).toBe(false)
	})

	test('manual lock() works once enabled', async () => {
		const lock = await renderAppLock()
		await act(async () => { await lock.current.enableAppLock('9999') })
		await act(async () => { lock.current.lock() })
		expect(lock.current.isLocked).toBe(true)
	})

	test('lock() is a no-op while disabled', async () => {
		const lock = await renderAppLock()
		await act(async () => { lock.current.lock() })
		expect(lock.current.isLocked).toBe(false)
	})

	test('disableAppLock with the current PIN removes it and unlocks', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(true)
		let outcome
		await act(async () => { outcome = await lock.current.disableAppLock('1234') })
		expect(outcome).toEqual({ success: true })
		expect(removeAppLockPin).toHaveBeenCalled()
		expect(disableBiometricMarker).toHaveBeenCalledWith('com.qvapay.applock.bio')
		expect(lock.current.appLockEnabled).toBe(false)
		expect(lock.current.isLocked).toBe(false)
	})

	// El PIN es lo único entre quien tenga el teléfono desbloqueado y la frase de la wallet:
	// antes bastaba con desactivar el bloqueo (sin PIN) y crear uno nuevo para verla
	describe('el PIN no se quita ni se pone sin su dueño', () => {
		test('disableAppLock: sin el PIN actual (o con uno malo) no quita nada', async () => {
			hasAppLockPin.mockResolvedValue(true)
			readAppLockPin.mockResolvedValue('1234')
			const lock = await renderAppLock()
			let outcome
			for (const attempt of ['0000', '', undefined]) {
				await act(async () => { outcome = await lock.current.disableAppLock(attempt) })
				expect(outcome).toEqual({ success: false, error: 'PIN incorrecto' })
			}
			// Un PIN que no se pudo leer del Keychain tampoco deja pasar a un PIN vacío
			readAppLockPin.mockResolvedValue(null)
			await act(async () => { outcome = await lock.current.disableAppLock(null) })
			expect(outcome.success).toBe(false)
			expect(removeAppLockPin).not.toHaveBeenCalled()
			expect(lock.current.appLockEnabled).toBe(true)
		})

		test('disableAppLock: con una wallet en el teléfono no se puede, ni con el PIN correcto', async () => {
			hasAppLockPin.mockResolvedValue(true)
			readAppLockPin.mockResolvedValue('1234')
			useWallet.mockReturnValue({ hasWallet: true, isReady: true })
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.disableAppLock('1234') })
			expect(outcome.success).toBe(false)
			expect(outcome.error).toMatch(/wallet/)
			expect(removeAppLockPin).not.toHaveBeenCalled()
			expect(lock.current.appLockEnabled).toBe(true)
		})

		test('disableAppLock: una seed en el Keychain que el contexto no cargó también cuenta', async () => {
			hasAppLockPin.mockResolvedValue(true)
			readAppLockPin.mockResolvedValue('1234')
			walletSeedEntry.mockResolvedValue('present')
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.disableAppLock('1234') })
			expect(outcome.success).toBe(false)
			expect(removeAppLockPin).not.toHaveBeenCalled()
		})

		test('enableAppLock: un PIN que ya existe no se pisa', async () => {
			hasAppLockPin.mockResolvedValue(true)
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.enableAppLock('9999') })
			expect(outcome.success).toBe(false)
			expect(outcome.error).toMatch(/Ya hay un PIN/)
			expect(setAppLockPin).not.toHaveBeenCalled()
		})

		test('enableAppLock: sin wallet no se pide la prueba de dueño', async () => {
			const lock = await renderAppLock()
			await act(async () => { await lock.current.enableAppLock('9999') })
			expect(confirmDeviceOwner).not.toHaveBeenCalled()
			expect(setAppLockPin).toHaveBeenCalledWith('9999')
		})

		test('enableAppLock: con wallet, el PIN solo se guarda tras la prueba de dueño del dispositivo', async () => {
			useWallet.mockReturnValue({ hasWallet: true, isReady: true })
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.enableAppLock('9999') })
			expect(confirmDeviceOwner).toHaveBeenCalledWith('Confirma que eres tú', 'Vas a crear el PIN que protege tu wallet')
			expect(outcome).toEqual({ success: true })
			expect(setAppLockPin).toHaveBeenCalledWith('9999')
		})

		test.each([
			['cancelled', /confirma con tu huella/],
			['error', /No pudimos confirmar/],
		])('enableAppLock: con wallet y la prueba en %s, no hay PIN', async (proof, message) => {
			useWallet.mockReturnValue({ hasWallet: true, isReady: true })
			confirmDeviceOwner.mockResolvedValue(proof)
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.enableAppLock('9999') })
			expect(outcome.success).toBe(false)
			expect(outcome.error).toMatch(message)
			expect(setAppLockPin).not.toHaveBeenCalled()
			expect(lock.current.appLockEnabled).toBe(false)
		})

		test('enableAppLock: en un teléfono sin bloqueo de pantalla no hay prueba posible y se deja crear', async () => {
			useWallet.mockReturnValue({ hasWallet: true, isReady: true })
			confirmDeviceOwner.mockResolvedValue('unavailable')
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.enableAppLock('9999') })
			expect(outcome).toEqual({ success: true })
		})

		test('enableAppLock: una seed en el Keychain que el contexto no cargó también exige la prueba', async () => {
			walletSeedEntry.mockResolvedValue('present')
			confirmDeviceOwner.mockResolvedValue('cancelled')
			const lock = await renderAppLock()
			let outcome
			await act(async () => { outcome = await lock.current.enableAppLock('9999') })
			expect(confirmDeviceOwner).toHaveBeenCalled()
			expect(outcome.success).toBe(false)
			expect(setAppLockPin).not.toHaveBeenCalled()
		})

		test('releaseUnusedAppLock: solo retira el PIN cuando ya no protege ni sesión ni wallet', async () => {
			hasAppLockPin.mockResolvedValue(true)
			// Con sesión: el PIN protege la cuenta
			let lock = await renderAppLock()
			let released
			await act(async () => { released = await lock.current.releaseUnusedAppLock() })
			expect(released).toBe(false)
			expect(removeAppLockPin).not.toHaveBeenCalled()

			// Sin sesión pero con la seed aún en el Keychain (el borrado falló): se queda
			useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
			walletSeedEntry.mockResolvedValue('present')
			lock = await renderAppLock()
			await act(async () => { released = await lock.current.releaseUnusedAppLock() })
			expect(released).toBe(false)
			expect(removeAppLockPin).not.toHaveBeenCalled()

			// Sin sesión y sin seed: ya no protege nada. Manda el Keychain, no el contexto,
			// que justo después de «Eliminar wallet» puede no haberse enterado todavía
			walletSeedEntry.mockResolvedValue('absent')
			useWallet.mockReturnValue({ hasWallet: true, isReady: true })
			lock = await renderAppLock()
			await act(async () => { released = await lock.current.releaseUnusedAppLock() })
			expect(released).toBe(true)
			expect(removeAppLockPin).toHaveBeenCalledTimes(1)
			expect(lock.current.appLockEnabled).toBe(false)
		})
	})

	test('changeAppLockPin verifies the current PIN first', async () => {
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.changeAppLockPin('0000', '5678') })
		expect(outcome).toEqual({ success: false, error: 'PIN actual incorrecto' })
		expect(setAppLockPin).not.toHaveBeenCalled()

		await act(async () => { outcome = await lock.current.changeAppLockPin('1234', '5678') })
		expect(outcome).toEqual({ success: true })
		expect(setAppLockPin).toHaveBeenCalledWith('5678')
	})

	test('updateAutoLockTimeout persists through settings', async () => {
		const lock = await renderAppLock()
		await act(async () => { await lock.current.updateAutoLockTimeout(10) })
		expect(updateSetting).toHaveBeenCalledWith('security', 'autoLockTimeout', 10)
	})
})

// El PIN son 4 dígitos y, con una wallet, lo único entre quien tenga el teléfono desbloqueado
// y la frase. Antes se podía probar sin fin: el bloqueo no contaba nada y el gate de la wallet
// solo cerraba su modal a los cinco fallos (se volvía a abrir). Las reglas están en pinAttempts;
// aquí, que TODA comparación pasa por ellas y que el contador vive en el Keychain
describe('límite de intentos del PIN', () => {
	const WAIT_30S = { success: false, error: 'Demasiados intentos. Espera 0:30.', locked: true }
	const OWNER_PROOF = { success: false, error: 'Demasiados intentos. Confirma que eres tú.', locked: true }

	const locked = async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		return renderAppLock()
	}
	const unlock = async (lock, pin) => {
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin(pin) })
		return outcome
	}

	test('cinco fallos abren una espera: ni el PIN correcto pasa hasta que se cumple', async () => {
		const lock = await locked()
		for (let i = 0; i < 4; i++) expect(await unlock(lock, '0000')).toEqual({ success: false, error: 'PIN incorrecto' })
		expect(await unlock(lock, '0000')).toEqual(WAIT_30S)
		expect(lock.current.pinAttempts.failures).toBe(5)

		// Durante la espera ni se lee el PIN: no hay nada que comparar
		readAppLockPin.mockClear()
		expect(await unlock(lock, '1234')).toEqual(WAIT_30S)
		expect(readAppLockPin).not.toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(true)
		expect(lock.current.pinAttempts.failures).toBe(5)

		await act(async () => { jest.advanceTimersByTime(30_000) })
		expect(await unlock(lock, '1234')).toEqual({ success: true })
		expect(lock.current.isLocked).toBe(false)
		// El PIN correcto devuelve los intentos, también en el Keychain
		expect(lock.current.pinAttempts.failures).toBe(0)
		expect(storedAttempts().f).toBe(0)
	})

	test('el intento se anota en el Keychain ANTES de leer el PIN (matar la app tras un fallo no lo borra)', async () => {
		const lock = await locked()
		readAppLockPin.mockClear()
		let seenAtRead = null
		readAppLockPin.mockImplementation(async () => { seenAtRead = storedAttempts().f; return '1234' })
		await unlock(lock, '0000')
		expect(seenAtRead).toBe(1)
		expect(setPinAttemptsRecord.mock.invocationCallOrder[0]).toBeLessThan(readAppLockPin.mock.invocationCallOrder[0])
	})

	test('si el intento no se puede anotar, el PIN no se compara', async () => {
		const lock = await locked()
		readAppLockPin.mockClear()
		setPinAttemptsRecord.mockResolvedValue(false)
		expect(await unlock(lock, '1234')).toEqual({ success: false, error: 'Error verificando PIN' })
		expect(readAppLockPin).not.toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(true)
	})

	test('un Keychain que no deja leer el PIN no cuenta como intento', async () => {
		const lock = await locked()
		readAppLockPin.mockRejectedValue(new Error('keystore'))
		for (let i = 0; i < 8; i++) expect(await unlock(lock, '1234')).toEqual({ success: false, error: 'Error verificando PIN', unreadable: true })
		expect(lock.current.pinAttempts.failures).toBe(0)
		expect(storedAttempts().f).toBe(0)
		// En cuanto vuelve a leerse, el PIN correcto entra a la primera
		readAppLockPin.mockResolvedValue('1234')
		expect(await unlock(lock, '1234')).toEqual({ success: true })
	})

	test('el contador sobrevive a cerrar la app', async () => {
		seedAttempts(7)
		const lock = await locked()
		expect(lock.current.pinAttempts.failures).toBe(7)
		expect(await unlock(lock, '1234')).toEqual({ success: false, error: 'Demasiados intentos. Espera 5:00.', locked: true })
		expect(lock.current.isLocked).toBe(true)
	})

	test('al décimo fallo ya no vale esperar: solo la prueba de dueño del dispositivo devuelve los intentos', async () => {
		seedAttempts(10)
		const lock = await locked()
		expect(await unlock(lock, '1234')).toEqual(OWNER_PROOF)
		// Ni un día después (el reloj del teléfono se adelanta desde Ajustes)
		await act(async () => { jest.advanceTimersByTime(24 * 3600_000) })
		expect(await unlock(lock, '1234')).toEqual(OWNER_PROOF)
		expect(confirmDeviceOwner).not.toHaveBeenCalled()

		// Cancelar el diálogo no devuelve nada
		confirmDeviceOwner.mockResolvedValue('cancelled')
		let proof
		await act(async () => { proof = await lock.current.proveDeviceOwner() })
		expect(proof).toBe('cancelled')
		expect(await unlock(lock, '1234')).toEqual(OWNER_PROOF)

		confirmDeviceOwner.mockResolvedValue('success')
		await act(async () => { proof = await lock.current.proveDeviceOwner() })
		expect(proof).toBe('success')
		expect(confirmDeviceOwner).toHaveBeenLastCalledWith('Confirma que eres tú', 'Demasiados intentos con tu PIN de QvaPay')
		expect(storedAttempts().f).toBe(0)
		// La prueba devuelve los intentos, NO desbloquea: sigue haciendo falta el PIN
		expect(lock.current.isLocked).toBe(true)
		expect(await unlock(lock, '0000')).toEqual({ success: false, error: 'PIN incorrecto' })
		expect(await unlock(lock, '1234')).toEqual({ success: true })
	})

	test('teléfono sin bloqueo de pantalla: la prueba no existe, no devuelve intentos y queda una hora de espera', async () => {
		seedAttempts(10)
		const lock = await locked()
		confirmDeviceOwner.mockResolvedValue('unavailable')
		await act(async () => { await lock.current.proveDeviceOwner() })
		expect(lock.current.ownerProofAvailable).toBe(false)
		expect(lock.current.pinAttempts.failures).toBe(10)
		expect(await unlock(lock, '1234')).toEqual({ success: false, error: 'Demasiados intentos. Espera 60:00.', locked: true })
		await act(async () => { jest.advanceTimersByTime(3600_000) })
		expect(await unlock(lock, '1234')).toEqual({ success: true })
	})

	test('al volver a la app se vuelve a creer en la prueba (pudo ponerse un bloqueo de pantalla)', async () => {
		seedAttempts(10)
		const lock = await locked()
		confirmDeviceOwner.mockResolvedValue('unavailable')
		await act(async () => { await lock.current.proveDeviceOwner() })
		expect(lock.current.ownerProofAvailable).toBe(false)
		await act(async () => { appStateHandler('background') })
		await act(async () => { appStateHandler('active') })
		expect(lock.current.ownerProofAvailable).toBe(true)
	})

	test('la biometría del bloqueo devuelve los intentos', async () => {
		seedAttempts(7)
		const lock = await locked()
		hasBiometricMarker.mockResolvedValue(true)
		authenticateBiometricMarker.mockResolvedValue(true)
		await act(async () => { await lock.current.unlockWithBiometrics() })
		expect(lock.current.isLocked).toBe(false)
		expect(lock.current.pinAttempts.failures).toBe(0)
		expect(storedAttempts().f).toBe(0)
	})

	test('una biometría cancelada no devuelve nada', async () => {
		seedAttempts(7)
		const lock = await locked()
		hasBiometricMarker.mockResolvedValue(true)
		authenticateBiometricMarker.mockResolvedValue(false)
		await act(async () => { await lock.current.unlockWithBiometrics() })
		expect(lock.current.pinAttempts.failures).toBe(7)
	})

	test('cambiar y desactivar el PIN pasan por el mismo límite', async () => {
		seedAttempts(5)
		const lock = await locked()
		let outcome
		await act(async () => { outcome = await lock.current.changeAppLockPin('1234', '5678') })
		expect(outcome).toEqual(WAIT_30S)
		expect(setAppLockPin).not.toHaveBeenCalled()
		await act(async () => { outcome = await lock.current.disableAppLock('1234') })
		expect(outcome).toEqual(WAIT_30S)
		expect(removeAppLockPin).not.toHaveBeenCalled()
	})

	test('probar PINs desde «Cambiar PIN» también cuenta', async () => {
		const lock = await locked()
		let outcome
		for (let i = 0; i < 5; i++) await act(async () => { outcome = await lock.current.changeAppLockPin('0000', '5678') })
		expect(outcome).toEqual(WAIT_30S)
		expect(await unlock(lock, '1234')).toEqual(WAIT_30S)
	})

	test('en Ajustes la prueba de dueño se pide ahí mismo: sin ella no se compara nada', async () => {
		seedAttempts(10)
		const lock = await locked()
		readAppLockPin.mockClear()
		confirmDeviceOwner.mockResolvedValue('cancelled')
		let outcome
		await act(async () => { outcome = await lock.current.changeAppLockPin('1234', '5678') })
		expect(outcome).toEqual(OWNER_PROOF)
		expect(readAppLockPin).not.toHaveBeenCalled()
		expect(setAppLockPin).not.toHaveBeenCalled()

		confirmDeviceOwner.mockResolvedValue('success')
		await act(async () => { outcome = await lock.current.changeAppLockPin('1234', '5678') })
		expect(outcome).toEqual({ success: true })
		expect(setAppLockPin).toHaveBeenCalledWith('5678')
	})

	test('el gate de la wallet (verifyAppLockPin) comparte el contador con el bloqueo', async () => {
		const lock = await locked()
		let check
		for (let i = 0; i < 3; i++) await act(async () => { check = await lock.current.verifyAppLockPin('0000') })
		expect(check).toEqual({ ok: false, reason: 'wrong', gate: { kind: 'open', freeLeft: 2 } })
		await unlock(lock, '0000')
		await act(async () => { check = await lock.current.verifyAppLockPin('0000') })
		expect(check).toMatchObject({ ok: false, reason: 'wrong', gate: { kind: 'wait', remainingMs: 30_000 } })
		// Cerrado para los dos: ni el PIN correcto
		await act(async () => { check = await lock.current.verifyAppLockPin('1234') })
		expect(check).toMatchObject({ ok: false, reason: 'locked', gate: { kind: 'wait' } })
		expect(await unlock(lock, '1234')).toEqual(WAIT_30S)
	})

	test('el PIN correcto en el gate de la wallet devuelve los intentos y no toca el bloqueo', async () => {
		seedAttempts(4)
		const lock = await locked()
		let check
		await act(async () => { check = await lock.current.verifyAppLockPin('1234') })
		expect(check).toEqual({ ok: true })
		expect(storedAttempts().f).toBe(0)
		expect(lock.current.isLocked).toBe(true)
	})

	test('dos comprobaciones a la vez no se pisan: cuentan las dos', async () => {
		const lock = await locked()
		await act(async () => { await Promise.all([lock.current.unlockWithPin('0000'), lock.current.unlockWithPin('1111')]) })
		expect(lock.current.pinAttempts.failures).toBe(2)
		expect(storedAttempts().f).toBe(2)
	})

	test('reloj atrasado: un último fallo «en el futuro» se fija a ahora, se guarda y la espera corre', async () => {
		// Falló con el reloj dos horas adelantado y luego se corrigió
		seedAttempts(6, -2 * 3600_000)
		const lock = await locked()
		expect(storedAttempts()).toEqual({ f: 6, t: Date.now() })
		expect(await unlock(lock, '1234')).toEqual({ success: false, error: 'Demasiados intentos. Espera 1:00.', locked: true })
		await act(async () => { jest.advanceTimersByTime(60_000) })
		expect(await unlock(lock, '1234')).toEqual({ success: true })
	})

	test('quitar el PIN retira el contador, y un PIN nuevo empieza de cero', async () => {
		seedAttempts(3)
		const lock = await locked()
		let outcome
		await act(async () => { outcome = await lock.current.disableAppLock('1234') })
		expect(outcome).toEqual({ success: true })
		expect(clearPinAttemptsRecord).toHaveBeenCalled()
		expect(lock.current.pinAttempts.failures).toBe(0)

		// Fallos sueltos sin PIN (no deberían existir, pero el Keychain de iOS sobrevive a reinstalar)
		seedAttempts(9)
		hasAppLockPin.mockResolvedValue(false)
		clearPinAttemptsRecord.mockClear()
		await act(async () => { outcome = await lock.current.enableAppLock('4321') })
		expect(outcome).toEqual({ success: true })
		expect(clearPinAttemptsRecord).toHaveBeenCalled()
		expect(attemptsRecord).toBeNull()
	})

	test('un contador ilegible en el Keychain no deja fuera al dueño', async () => {
		attemptsRecord = 'basura'
		const lock = await locked()
		expect(lock.current.pinAttempts.failures).toBe(0)
		expect(await unlock(lock, '1234')).toEqual({ success: true })
	})
})

// En Android, al pasar de un teléfono a otro, el PIN viaja cifrado y sin su clave: la entrada
// existe y nadie puede acertarla. Antes la app se quedaba en el bloqueo para siempre
describe('PIN que no se deja leer', () => {
	const unreadablePin = () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockRejectedValue(new Error('keystore'))
	}

	test('resetUnreadablePin: tras la prueba de dueño lo retira y abre', async () => {
		unreadablePin()
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(true)
		let outcome
		await act(async () => { outcome = await lock.current.resetUnreadablePin() })
		expect(outcome).toEqual({ success: true })
		expect(confirmDeviceOwner).toHaveBeenCalledWith('Confirma que eres tú', 'Vas a restablecer el PIN de QvaPay')
		expect(removeAppLockPin).toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(false)
		expect(lock.current.appLockEnabled).toBe(false)
	})

	test.each([['cancelled', { success: false }], ['error', { success: false, error: 'No pudimos confirmar que este teléfono es tuyo. Inténtalo de nuevo.' }]])('resetUnreadablePin: con la prueba en %s no se toca nada', async (proof, expected) => {
		unreadablePin()
		confirmDeviceOwner.mockResolvedValue(proof)
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.resetUnreadablePin() })
		expect(outcome).toEqual(expected)
		expect(removeAppLockPin).not.toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(true)
	})

	test('resetUnreadablePin: un PIN que SÍ se lee no se quita por aquí, ni se pide prueba alguna', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.resetUnreadablePin() })
		expect(outcome).toEqual({ success: false, error: 'Error verificando PIN' })
		expect(confirmDeviceOwner).not.toHaveBeenCalled()
		expect(removeAppLockPin).not.toHaveBeenCalled()
		expect(lock.current.isLocked).toBe(true)
	})

	test('enableAppLock: se puede sustituir (no protege nada); con wallet, tras la prueba de dueño', async () => {
		unreadablePin()
		walletSeedEntry.mockResolvedValue('present')
		confirmDeviceOwner.mockResolvedValue('cancelled')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.enableAppLock('4321') })
		expect(outcome.success).toBe(false)
		expect(setAppLockPin).not.toHaveBeenCalled()

		confirmDeviceOwner.mockResolvedValue('success')
		await act(async () => { outcome = await lock.current.enableAppLock('4321') })
		expect(outcome).toEqual({ success: true })
		expect(setAppLockPin).toHaveBeenCalledWith('4321')
	})

	test('enableAppLock: uno que se lee sigue sin poder pisarse', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.enableAppLock('4321') })
		expect(outcome).toEqual({ success: false, error: 'Ya hay un PIN. Para cambiarlo, usa «Cambiar PIN».' })
		expect(setAppLockPin).not.toHaveBeenCalled()
	})
})

// «¿Hay una wallet?» tiene tres respuestas. Si el Keychain no contesta no se sabe, y lo que
// no se sabe se protege: antes ese fallo contaba como «no hay wallet»
describe('el Keychain no dice si hay wallet', () => {
	beforeEach(() => { walletSeedEntry.mockResolvedValue('unknown') })

	test('desactivar el bloqueo: no se puede', async () => {
		hasAppLockPin.mockResolvedValue(true)
		readAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.disableAppLock('1234') })
		expect(outcome.success).toBe(false)
		expect(removeAppLockPin).not.toHaveBeenCalled()
	})

	test('crear el PIN: exige la prueba de dueño', async () => {
		confirmDeviceOwner.mockResolvedValue('cancelled')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.enableAppLock('1234') })
		expect(outcome.success).toBe(false)
		expect(confirmDeviceOwner).toHaveBeenCalledTimes(1)
		expect(setAppLockPin).not.toHaveBeenCalled()
	})

	test('releaseUnusedAppLock: el PIN se queda', async () => {
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		hasAppLockPin.mockResolvedValue(true)
		const lock = await renderAppLock()
		let released
		await act(async () => { released = await lock.current.releaseUnusedAppLock() })
		expect(released).toBe(false)
		expect(removeAppLockPin).not.toHaveBeenCalled()
	})
})
