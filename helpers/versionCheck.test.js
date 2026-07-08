/**
 * Unit tests for the store-update prompt gate — node environment with the
 * native deps mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Linking: { openURL: jest.fn() },
	Platform: { OS: 'ios' },
}))
jest.mock('react-native-version-check', () => ({
	getCurrentVersion: jest.fn(),
	getLatestVersion: jest.fn(),
	getStoreUrl: jest.fn(),
	needUpdate: jest.fn(),
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
}))

import { Linking } from 'react-native'
import VersionCheck from 'react-native-version-check'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { maybePromptUpdate, markPromptShown, openStore } from './versionCheck'

const LAST_PROMPT_KEY = '@qvapay:lastVersionPrompt'
const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-07T12:00:00.000Z').getTime()

beforeAll(() => { jest.useFakeTimers({ now: NOW }) })
afterAll(() => { jest.useRealTimers() })

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
	VersionCheck.getCurrentVersion.mockReturnValue('1.8.5')
	VersionCheck.getLatestVersion.mockResolvedValue('1.9.0')
	VersionCheck.getStoreUrl.mockResolvedValue('https://apps.apple.com/app/qvapay')
	VersionCheck.needUpdate.mockResolvedValue({ isNeeded: true })
})

describe('maybePromptUpdate', () => {
	test('reports an available update with versions and store url', async () => {
		await expect(maybePromptUpdate()).resolves.toEqual({
			needsUpdate: true,
			currentVersion: '1.8.5',
			latestVersion: '1.9.0',
			storeUrl: 'https://apps.apple.com/app/qvapay',
		})
	})

	test('no update needed when the store version is not newer', async () => {
		VersionCheck.needUpdate.mockResolvedValue({ isNeeded: false })
		const result = await maybePromptUpdate()
		expect(result.needsUpdate).toBe(false)
	})

	test('suppressed inside the 3-day cooldown window', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(NOW - 2 * DAY_MS))
		await expect(maybePromptUpdate()).resolves.toEqual({ needsUpdate: false, reason: 'cooldown' })
		expect(VersionCheck.getLatestVersion).not.toHaveBeenCalled()
	})

	test('checks again once the cooldown expired', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(NOW - 4 * DAY_MS))
		const result = await maybePromptUpdate()
		expect(result.needsUpdate).toBe(true)
	})

	test('no latest version resolves to no-latest instead of throwing', async () => {
		VersionCheck.getLatestVersion.mockResolvedValue(null)
		await expect(maybePromptUpdate()).resolves.toEqual({ needsUpdate: false, reason: 'no-latest' })
	})

	test('store/network failures resolve to { needsUpdate: false } (never throws)', async () => {
		VersionCheck.getLatestVersion.mockRejectedValue(new Error('offline'))
		await expect(maybePromptUpdate()).resolves.toEqual({ needsUpdate: false, reason: 'error' })
	})

	test('AsyncStorage failures also resolve to error', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('storage broken'))
		await expect(maybePromptUpdate()).resolves.toEqual({ needsUpdate: false, reason: 'error' })
	})
})

describe('markPromptShown', () => {
	test('records the current timestamp under the cooldown key', async () => {
		AsyncStorage.setItem.mockResolvedValue()
		await markPromptShown()
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(LAST_PROMPT_KEY, String(NOW))
	})

	test('ignores storage errors', async () => {
		AsyncStorage.setItem.mockRejectedValue(new Error('full'))
		await expect(markPromptShown()).resolves.toBeUndefined()
	})
})

describe('openStore', () => {
	test('opens the given store url', async () => {
		Linking.openURL.mockResolvedValue()
		await openStore('https://apps.apple.com/app/qvapay')
		expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/qvapay')
	})

	test('does nothing for empty urls and swallows errors', async () => {
		await openStore(undefined)
		expect(Linking.openURL).not.toHaveBeenCalled()
		Linking.openURL.mockRejectedValue(new Error('boom'))
		await expect(openStore('x://y')).resolves.toBeUndefined()
	})
})
