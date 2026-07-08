/**
 * Unit tests for the device-contacts sync hook — node environment with
 * react-native, react-native-contacts, AsyncStorage, sonner-native and
 * userApi mocked (see keypadAmount.test.js for the jest 29/30 clash).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Alert: { alert: jest.fn() },
	Platform: { OS: 'android' },
	Linking: { openURL: jest.fn(), openSettings: jest.fn() },
	PermissionsAndroid: {
		check: jest.fn(),
		request: jest.fn(),
		PERMISSIONS: { READ_CONTACTS: 'android.permission.READ_CONTACTS' },
		RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
	},
}))
jest.mock('react-native-contacts', () => ({
	checkPermission: jest.fn(),
	requestPermission: jest.fn(),
	getAll: jest.fn(),
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeMany: jest.fn(),
}))
jest.mock('sonner-native', () => ({
	toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}))
jest.mock('../api/userApi', () => ({ userApi: { syncContacts: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { Alert, Platform, Linking, PermissionsAndroid } from 'react-native'
import Contacts from 'react-native-contacts'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { toast } from 'sonner-native'
import { userApi } from '../api/userApi'
import useDeviceContacts from './useDeviceContacts'

const KEYS = {
	MATCHED: 'device_contacts_matched',
	LAST_SYNC: 'device_contacts_last_sync',
	CONSENT: 'device_contacts_consent',
}
const NOW = new Date('2026-07-07T12:00:00.000Z').getTime()
const MINUTE_MS = 60 * 1000

// Minimal hook harness: renders the hook inside a throwaway component and
// exposes its latest return value through `result.current`.
const renderDeviceContacts = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = useDeviceContacts()
		return null
	}
	await act(async () => { create(<Harness />) })
	return result
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers({ now: NOW })
	jest.spyOn(console, 'warn').mockImplementation(() => {})
	Platform.OS = 'android'
	PermissionsAndroid.check.mockResolvedValue(true)
	PermissionsAndroid.request.mockResolvedValue('granted')
	Contacts.checkPermission.mockResolvedValue('authorized')
	Contacts.requestPermission.mockResolvedValue('authorized')
	Contacts.getAll.mockResolvedValue([])
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
	AsyncStorage.removeMany.mockResolvedValue()
	userApi.syncContacts.mockResolvedValue({ success: true, data: { matches: [] } })
})
afterEach(() => {
	jest.useRealTimers()
	console.warn.mockRestore()
})

describe('checkPermission', () => {
	test('android granted maps to authorized', async () => {
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.checkPermission() })
		expect(PermissionsAndroid.check).toHaveBeenCalledWith('android.permission.READ_CONTACTS')
		expect(status).toBe('authorized')
		expect(hook.current.permissionStatus).toBe('authorized')
	})

	test('android not granted maps to undefined', async () => {
		PermissionsAndroid.check.mockResolvedValue(false)
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.checkPermission() })
		expect(status).toBe('undefined')
		expect(hook.current.permissionStatus).toBe('undefined')
	})

	test('ios returns the native status when it resolves in time', async () => {
		Platform.OS = 'ios'
		Contacts.checkPermission.mockResolvedValue('limited')
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.checkPermission() })
		expect(status).toBe('limited')
		expect(hook.current.permissionStatus).toBe('limited')
	})

	test('ios falls back to undefined when checkPermission hangs past the 2s timeout', async () => {
		Platform.OS = 'ios'
		Contacts.checkPermission.mockReturnValue(new Promise(() => {})) // iOS 18+ hang
		const hook = await renderDeviceContacts()
		let status
		await act(async () => {
			const pending = hook.current.checkPermission()
			jest.advanceTimersByTime(2000)
			status = await pending
		})
		expect(status).toBe('undefined')
		expect(hook.current.permissionStatus).toBe('undefined')
	})

	test('a thrown native error resolves to undefined instead of crashing', async () => {
		PermissionsAndroid.check.mockRejectedValue(new Error('bridge down'))
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.checkPermission() })
		expect(status).toBe('undefined')
	})
})

describe('requestPermission', () => {
	test('with stored consent it skips the disclosure and asks the OS directly (android)', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) => (key === KEYS.CONSENT ? 'true' : null))
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.requestPermission() })
		expect(status).toBe('authorized')
		expect(hook.current.showDisclosure).toBe(false)
		expect(PermissionsAndroid.request).toHaveBeenCalledWith('android.permission.READ_CONTACTS')
	})

	test('with stored consent an OS denial resolves denied', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) => (key === KEYS.CONSENT ? 'true' : null))
		PermissionsAndroid.request.mockResolvedValue('denied')
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.requestPermission() })
		expect(status).toBe('denied')
		expect(hook.current.permissionStatus).toBe('denied')
	})

	test('ios already authorized stores consent silently and never shows the disclosure', async () => {
		Platform.OS = 'ios'
		Contacts.checkPermission.mockResolvedValue('authorized')
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.requestPermission() })
		expect(status).toBe('authorized')
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.CONSENT, 'true')
		expect(hook.current.showDisclosure).toBe(false)
		expect(Contacts.requestPermission).not.toHaveBeenCalled()
	})

	test('ios already denied resolves denied without the disclosure', async () => {
		Platform.OS = 'ios'
		Contacts.checkPermission.mockResolvedValue('denied')
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.requestPermission() })
		expect(status).toBe('denied')
		expect(hook.current.permissionStatus).toBe('denied')
		expect(hook.current.showDisclosure).toBe(false)
		expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(KEYS.CONSENT, 'true')
	})

	test('without consent it opens the disclosure and acceptDisclosure continues to the OS dialog', async () => {
		const hook = await renderDeviceContacts()
		let pending
		await act(async () => { pending = hook.current.requestPermission() })
		expect(hook.current.showDisclosure).toBe(true)
		expect(PermissionsAndroid.request).not.toHaveBeenCalled()

		await act(async () => { await hook.current.acceptDisclosure() })
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.CONSENT, 'true')
		expect(hook.current.showDisclosure).toBe(false)
		expect(PermissionsAndroid.request).toHaveBeenCalledWith('android.permission.READ_CONTACTS')
		await expect(pending).resolves.toBe('authorized')
		expect(hook.current.permissionStatus).toBe('authorized')
	})

	test('declineDisclosure resolves denied without touching the OS or storing consent', async () => {
		const hook = await renderDeviceContacts()
		let pending
		await act(async () => { pending = hook.current.requestPermission() })
		expect(hook.current.showDisclosure).toBe(true)

		await act(async () => { hook.current.declineDisclosure() })
		expect(hook.current.showDisclosure).toBe(false)
		expect(PermissionsAndroid.request).not.toHaveBeenCalled()
		expect(AsyncStorage.setItem).not.toHaveBeenCalled()
		await expect(pending).resolves.toBe('denied')
	})

	test('an OS request failure shows the settings alert and resolves denied', async () => {
		Platform.OS = 'ios'
		AsyncStorage.getItem.mockImplementation(async (key) => (key === KEYS.CONSENT ? 'true' : null))
		Contacts.requestPermission.mockRejectedValue(new Error('no dialog'))
		const hook = await renderDeviceContacts()
		let status
		await act(async () => { status = await hook.current.requestPermission() })
		expect(status).toBe('denied')
		expect(Alert.alert).toHaveBeenCalledWith(
			'Permiso de contactos',
			expect.any(String),
			expect.any(Array)
		)
	})
})

describe('syncContacts', () => {
	test('a sync inside the 15-minute cooldown only reloads the cache', async () => {
		const cached = [{ uuid: 'u1', deviceContactName: 'Ana', matchedPhone: '+5355512345' }]
		AsyncStorage.getItem.mockImplementation(async (key) => {
			if (key === KEYS.LAST_SYNC) return String(NOW - 5 * MINUTE_MS)
			if (key === KEYS.MATCHED) return JSON.stringify(cached)
			return null
		})
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts() })
		expect(Contacts.getAll).not.toHaveBeenCalled()
		expect(userApi.syncContacts).not.toHaveBeenCalled()
		expect(hook.current.matchedContacts).toEqual(cached)
		expect(hook.current.isSyncing).toBe(false)
	})

	test('force bypasses the cooldown', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) =>
			key === KEYS.LAST_SYNC ? String(NOW - 5 * MINUTE_MS) : null
		)
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(Contacts.getAll).toHaveBeenCalledTimes(1)
		expect(userApi.syncContacts).toHaveBeenCalledWith(['+5355512345'])
	})

	test('a stale last sync (past the cooldown) syncs again', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) =>
			key === KEYS.LAST_SYNC ? String(NOW - 16 * MINUTE_MS) : null
		)
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts() })
		expect(userApi.syncContacts).toHaveBeenCalledWith(['+5355512345'])
	})

	test('without permission it errors out and never reads the address book', async () => {
		PermissionsAndroid.check.mockResolvedValue(false)
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(hook.current.error).toBe('Permiso de contactos no concedido')
		expect(toast.error).toHaveBeenCalledWith('Permiso de contactos no concedido')
		expect(Contacts.getAll).not.toHaveBeenCalled()
		expect(hook.current.isSyncing).toBe(false)
	})

	test('normalizes phone numbers before uploading: formatting stripped, 00 becomes +, + prefixed, short numbers dropped, duplicates deduped', async () => {
		Contacts.getAll.mockResolvedValue([
			{
				givenName: 'Ana',
				familyName: 'Pérez',
				phoneNumbers: [
					{ number: '(305) 555-01 23' }, // formatted, no + → '+3055550123'
					{ number: '00341234567' },     // 00 prefix → '+341234567'
					{ number: '+1 23' },           // 3 digits → rejected
					{ number: null },              // unusable → rejected
				],
			},
			{ givenName: 'Dup', phoneNumbers: [{ number: '+305 555 0123' }] }, // dedupe with Ana's first number
			{ givenName: 'NoPhones' },
		])
		userApi.syncContacts.mockResolvedValue({
			success: true,
			data: { matches: [{ phone: '+3055550123', user: { uuid: 'u1', username: 'ana' } }] },
		})
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(userApi.syncContacts).toHaveBeenCalledTimes(1)
		expect(userApi.syncContacts).toHaveBeenCalledWith(['+3055550123', '+341234567'])
		// the first contact owning the number wins the name
		expect(hook.current.matchedContacts).toEqual([
			{ uuid: 'u1', username: 'ana', deviceContactName: 'Ana Pérez', matchedPhone: '+3055550123' },
		])
	})

	test('a company-only contact uses the company as its device name', async () => {
		Contacts.getAll.mockResolvedValue([
			{ company: 'Acme', phoneNumbers: [{ number: '+5551234567' }] },
		])
		userApi.syncContacts.mockResolvedValue({
			success: true,
			data: { matches: [{ phone: '+5551234567', user: { uuid: 'u2' } }] },
		})
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(hook.current.matchedContacts[0].deviceContactName).toBe('Acme')
	})

	test('a successful sync caches the matches and stamps the sync time', async () => {
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		userApi.syncContacts.mockResolvedValue({
			success: true,
			data: { matches: [{ phone: '+5355512345', user: { uuid: 'u1' } }] },
		})
		const onSyncComplete = jest.fn()
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true, onSyncComplete }) })
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(
			KEYS.MATCHED,
			JSON.stringify([{ uuid: 'u1', deviceContactName: 'Ana', matchedPhone: '+5355512345' }])
		)
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.LAST_SYNC, String(NOW))
		expect(toast.success).toHaveBeenCalledWith('Contactos sincronizados')
		expect(onSyncComplete).toHaveBeenCalledTimes(1)
		expect(hook.current.error).toBeNull()
		expect(hook.current.isSyncing).toBe(false)
	})

	test('auto-added contacts get their own pluralized toast', async () => {
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		userApi.syncContacts.mockResolvedValue({
			success: true,
			data: { matches: [], auto_added_count: 2 },
		})
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(toast.success).toHaveBeenCalledWith('2 contactos agregados automáticamente')
	})

	test('no matches yields the informational toast', async () => {
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(toast.info).toHaveBeenCalledWith('Ninguno de tus contactos usa QvaPay aún')
		expect(hook.current.matchedContacts).toEqual([])
	})

	test('an address book without usable phones caches an empty result and skips the API', async () => {
		Contacts.getAll.mockResolvedValue([{ givenName: 'Shorty', phoneNumbers: [{ number: '123' }] }])
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(userApi.syncContacts).not.toHaveBeenCalled()
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.MATCHED, JSON.stringify([]))
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.LAST_SYNC, String(NOW))
		expect(toast.info).toHaveBeenCalledWith('No se encontraron números de teléfono en tus contactos')
	})

	test('uploads in batches of 2000 and merges matches across batches', async () => {
		const contacts = Array.from({ length: 2001 }, (_, i) => ({
			givenName: `C${i}`,
			phoneNumbers: [{ number: `+34600${String(i).padStart(6, '0')}` }],
		}))
		Contacts.getAll.mockResolvedValue(contacts)
		userApi.syncContacts
			.mockResolvedValueOnce({
				success: true,
				data: { matches: [{ phone: '+34600000000', user: { uuid: 'u1' } }] },
			})
			.mockResolvedValueOnce({
				success: true,
				data: { matches: [{ phone: '+34600002000', user: { uuid: 'u2' } }] },
			})
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(userApi.syncContacts).toHaveBeenCalledTimes(2)
		expect(userApi.syncContacts.mock.calls[0][0]).toHaveLength(2000)
		expect(userApi.syncContacts.mock.calls[1][0]).toEqual(['+34600002000'])
		expect(hook.current.matchedContacts).toHaveLength(2)
	})

	test('an API failure sets the error, toasts and falls back to the cached matches', async () => {
		const cached = [{ uuid: 'old', deviceContactName: 'Cached', matchedPhone: '+123456' }]
		AsyncStorage.getItem.mockImplementation(async (key) =>
			key === KEYS.MATCHED ? JSON.stringify(cached) : null
		)
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		userApi.syncContacts.mockResolvedValue({ success: false, error: 'Rate limited' })
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.syncContacts({ force: true }) })
		expect(hook.current.error).toBe('Rate limited')
		expect(toast.error).toHaveBeenCalledWith('Error al sincronizar', { description: 'Rate limited' })
		expect(hook.current.matchedContacts).toEqual(cached)
		expect(hook.current.isSyncing).toBe(false)
	})

	test('concurrent calls are guarded — only one sync runs', async () => {
		Contacts.getAll.mockResolvedValue([
			{ givenName: 'Ana', phoneNumbers: [{ number: '+5355512345' }] },
		])
		const hook = await renderDeviceContacts()
		await act(async () => {
			await Promise.all([
				hook.current.syncContacts({ force: true }),
				hook.current.syncContacts({ force: true }),
			])
		})
		expect(Contacts.getAll).toHaveBeenCalledTimes(1)
		expect(userApi.syncContacts).toHaveBeenCalledTimes(1)
	})
})

describe('loadCachedMatches', () => {
	test('returns and publishes the cached list', async () => {
		const cached = [{ uuid: 'u1' }]
		AsyncStorage.getItem.mockImplementation(async (key) =>
			key === KEYS.MATCHED ? JSON.stringify(cached) : null
		)
		const hook = await renderDeviceContacts()
		let loaded
		await act(async () => { loaded = await hook.current.loadCachedMatches() })
		expect(loaded).toEqual(cached)
		expect(hook.current.matchedContacts).toEqual(cached)
	})

	test('returns an empty list when nothing is cached', async () => {
		const hook = await renderDeviceContacts()
		let loaded
		await act(async () => { loaded = await hook.current.loadCachedMatches() })
		expect(loaded).toEqual([])
	})

	test('corrupt cache JSON is swallowed and yields an empty list', async () => {
		AsyncStorage.getItem.mockResolvedValue('{not json')
		const hook = await renderDeviceContacts()
		let loaded
		await act(async () => { loaded = await hook.current.loadCachedMatches() })
		expect(loaded).toEqual([])
		expect(hook.current.matchedContacts).toEqual([])
	})
})

describe('clearSyncedData', () => {
	test('removes the three storage keys and empties the matches', async () => {
		AsyncStorage.getItem.mockImplementation(async (key) =>
			key === KEYS.MATCHED ? JSON.stringify([{ uuid: 'u1' }]) : null
		)
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.loadCachedMatches() })
		expect(hook.current.matchedContacts).toHaveLength(1)

		await act(async () => { await hook.current.clearSyncedData() })
		expect(AsyncStorage.removeMany).toHaveBeenCalledWith([KEYS.MATCHED, KEYS.LAST_SYNC, KEYS.CONSENT])
		expect(hook.current.matchedContacts).toEqual([])
	})

	test('a storage failure is swallowed', async () => {
		AsyncStorage.removeMany.mockRejectedValue(new Error('disk dead'))
		const hook = await renderDeviceContacts()
		await act(async () => { await hook.current.clearSyncedData() })
		expect(hook.current.matchedContacts).toEqual([])
	})
})

describe('openSettings', () => {
	test('ios opens the app-settings url', async () => {
		Platform.OS = 'ios'
		const hook = await renderDeviceContacts()
		await act(async () => { hook.current.openSettings() })
		expect(Linking.openURL).toHaveBeenCalledWith('app-settings:')
		expect(Linking.openSettings).not.toHaveBeenCalled()
	})

	test('android opens the system settings', async () => {
		const hook = await renderDeviceContacts()
		await act(async () => { hook.current.openSettings() })
		expect(Linking.openSettings).toHaveBeenCalled()
		expect(Linking.openURL).not.toHaveBeenCalled()
	})
})
