/**
 * Unit tests for the in-app review throttle — node environment with the
 * native review module and AsyncStorage mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
jest.mock('react-native-in-app-review', () => ({
	isAvailable: jest.fn(),
	RequestInAppReview: jest.fn(),
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
}))

import InAppReview from 'react-native-in-app-review'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { requestReview, maybeRequestReview } from './inAppReview'

const LAST_REQUEST_KEY = '@qvapay:lastReviewRequest'
const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-07T12:00:00.000Z').getTime()

beforeAll(() => { jest.useFakeTimers({ now: NOW }) })
afterAll(() => { jest.useRealTimers() })

beforeEach(() => {
	jest.clearAllMocks()
	InAppReview.isAvailable.mockReturnValue(true)
	InAppReview.RequestInAppReview.mockResolvedValue(true)
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
})

describe('requestReview', () => {
	test('requests the dialog and records the attempt timestamp', async () => {
		await expect(requestReview()).resolves.toEqual({ shown: true })
		expect(InAppReview.RequestInAppReview).toHaveBeenCalled()
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(LAST_REQUEST_KEY, String(NOW))
	})

	test('reports unavailable without requesting', async () => {
		InAppReview.isAvailable.mockReturnValue(false)
		await expect(requestReview()).resolves.toEqual({ shown: false, reason: 'unavailable' })
		expect(InAppReview.RequestInAppReview).not.toHaveBeenCalled()
	})

	test('a native error resolves to { shown: false } instead of throwing', async () => {
		InAppReview.RequestInAppReview.mockRejectedValue(new Error('quota'))
		await expect(requestReview()).resolves.toEqual({ shown: false, reason: 'error' })
	})
})

describe('maybeRequestReview', () => {
	test('suppressed inside the 90-day cooldown', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(NOW - 89 * DAY_MS))
		await expect(maybeRequestReview()).resolves.toEqual({ shown: false, reason: 'cooldown' })
		expect(InAppReview.RequestInAppReview).not.toHaveBeenCalled()
	})

	test('requests again once the cooldown expired', async () => {
		AsyncStorage.getItem.mockResolvedValue(String(NOW - 91 * DAY_MS))
		await expect(maybeRequestReview()).resolves.toEqual({ shown: true })
	})

	test('first-ever call requests immediately', async () => {
		await expect(maybeRequestReview()).resolves.toEqual({ shown: true })
	})
})
