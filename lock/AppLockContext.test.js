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
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../settings/SettingsContext', () => ({ useSettings: jest.fn() }))
jest.mock('../api/client', () => ({
	getBiometricCredentials: jest.fn(),
	getAppLockPin: jest.fn(),
	setAppLockPin: jest.fn(),
	hasAppLockPin: jest.fn(),
	removeAppLockPin: jest.fn(),
}))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import {
	getBiometricCredentials,
	getAppLockPin,
	setAppLockPin,
	hasAppLockPin,
	removeAppLockPin,
} from '../api/client'
import { AppLockProvider, useAppLock } from './AppLockContext'

const updateSetting = jest.fn()

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
	useSettings.mockReturnValue({
		security: { autoLockTimeout: 5 },
		isLoading: false,
		updateSetting,
	})
	hasAppLockPin.mockResolvedValue(false)
	getAppLockPin.mockResolvedValue(null)
	setAppLockPin.mockResolvedValue(true)
	removeAppLockPin.mockResolvedValue(true)
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

	test('isLocked is AND-ed with isAuthenticated — logging out dismisses the lock', async () => {
		hasAppLockPin.mockResolvedValue(true)
		useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(false)
	})
})

describe('background/foreground auto-lock', () => {
	test('re-locks when the background stay reaches autoLockTimeout', async () => {
		hasAppLockPin.mockResolvedValue(true)
		const lock = await renderAppLock()
		await act(async () => { await lock.current.unlockWithPin('1234') }) // clear the cold-start lock
		getAppLockPin.mockResolvedValue('1234')
		await act(async () => { await lock.current.unlockWithPin('1234') })
		expect(lock.current.isLocked).toBe(false)

		await goBackgroundAndReturn(5 * 60 * 1000)
		expect(lock.current.isLocked).toBe(true)
	})

	test('a brief app switch does not lock', async () => {
		hasAppLockPin.mockResolvedValue(true)
		getAppLockPin.mockResolvedValue('1234')
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
		getAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin('1234') })
		expect(outcome).toEqual({ success: true })
		expect(lock.current.isLocked).toBe(false)
	})

	test('rejects a wrong PIN and stays locked', async () => {
		hasAppLockPin.mockResolvedValue(true)
		getAppLockPin.mockResolvedValue('1234')
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin('0000') })
		expect(outcome).toEqual({ success: false, error: 'PIN incorrecto' })
		expect(lock.current.isLocked).toBe(true)
	})

	test('a Keychain read failure reports a verification error', async () => {
		hasAppLockPin.mockResolvedValue(true)
		getAppLockPin.mockRejectedValue(new Error('locked out'))
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithPin('1234') })
		expect(outcome).toEqual({ success: false, error: 'Error verificando PIN' })
	})
})

describe('unlockWithBiometrics', () => {
	test('unlocks when the biometric-protected entry could be read', async () => {
		hasAppLockPin.mockResolvedValue(true)
		getBiometricCredentials.mockResolvedValue({ email: 'a@b.co', password: 'pw' })
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithBiometrics() })
		expect(outcome).toEqual({ success: true })
		expect(lock.current.isLocked).toBe(false)
	})

	test('a cancelled prompt keeps the lock', async () => {
		hasAppLockPin.mockResolvedValue(true)
		getBiometricCredentials.mockResolvedValue(null)
		const lock = await renderAppLock()
		let outcome
		await act(async () => { outcome = await lock.current.unlockWithBiometrics() })
		expect(outcome).toEqual({ success: false, error: 'Autenticación biométrica cancelada' })
		expect(lock.current.isLocked).toBe(true)
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

	test('disableAppLock removes the PIN and unlocks', async () => {
		hasAppLockPin.mockResolvedValue(true)
		const lock = await renderAppLock()
		expect(lock.current.isLocked).toBe(true)
		let outcome
		await act(async () => { outcome = await lock.current.disableAppLock() })
		expect(outcome).toEqual({ success: true })
		expect(removeAppLockPin).toHaveBeenCalled()
		expect(lock.current.appLockEnabled).toBe(false)
		expect(lock.current.isLocked).toBe(false)
	})

	test('changeAppLockPin verifies the current PIN first', async () => {
		getAppLockPin.mockResolvedValue('1234')
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
