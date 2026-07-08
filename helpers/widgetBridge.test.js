/**
 * Unit tests for the home-screen widget bridge — node environment with the
 * SharedStorage native module mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	NativeModules: {
		SharedStorage: {
			setWidgetData: jest.fn(),
			reloadWidgets: jest.fn(),
		},
	},
	Platform: { OS: 'ios' },
}))

import { NativeModules, Platform } from 'react-native'
import { updateWidgetBalance, updateWidgetP2POffers, reloadWidgets } from './widgetBridge'

const { SharedStorage } = NativeModules
const NOW = new Date('2026-07-07T12:00:00.000Z').getTime()

beforeAll(() => { jest.useFakeTimers({ now: NOW }) })
afterAll(() => { jest.useRealTimers() })
beforeEach(() => {
	jest.clearAllMocks()
	SharedStorage.setWidgetData.mockResolvedValue()
	SharedStorage.reloadWidgets.mockResolvedValue()
	Platform.OS = 'ios'
})

describe('updateWidgetBalance', () => {
	test('writes the balance snapshot as JSON under the balance key', async () => {
		await updateWidgetBalance(123.45, 'erich')
		const [key, json] = SharedStorage.setWidgetData.mock.calls[0]
		expect(key).toBe('balance')
		expect(JSON.parse(json)).toEqual({ balance: 123.45, username: 'erich', updatedAt: NOW })
	})

	test('defaults nullish balance/username', async () => {
		await updateWidgetBalance(undefined, undefined)
		const json = JSON.parse(SharedStorage.setWidgetData.mock.calls[0][1])
		expect(json.balance).toBe(0)
		expect(json.username).toBe('')
	})

	test('fails silently when the native write throws', async () => {
		SharedStorage.setWidgetData.mockRejectedValue(new Error('no app group'))
		await expect(updateWidgetBalance(1, 'x')).resolves.toBeUndefined()
	})
})

describe('updateWidgetP2POffers', () => {
	const offer = (n) => ({
		uuid: `uuid-${n}`,
		type: 'buy',
		coin: 'BANK_MLC',
		amount: '10.00',
		receive: '9.50',
		status: 'open',
		details: { secret: 'not for the widget' },
	})

	test('trims to the first 5 offers with key fields only, keeping the total count', async () => {
		await updateWidgetP2POffers([1, 2, 3, 4, 5, 6, 7].map(offer))
		const json = JSON.parse(SharedStorage.setWidgetData.mock.calls[0][1])
		expect(SharedStorage.setWidgetData.mock.calls[0][0]).toBe('p2p_offers')
		expect(json.count).toBe(7)
		expect(json.offers).toHaveLength(5)
		expect(json.offers[0]).toEqual({
			uuid: 'uuid-1', type: 'buy', coin: 'BANK_MLC', amount: '10.00', receive: '9.50', status: 'open',
		})
	})

	test('handles a missing offer list', async () => {
		await updateWidgetP2POffers(undefined)
		const json = JSON.parse(SharedStorage.setWidgetData.mock.calls[0][1])
		expect(json).toMatchObject({ count: 0, offers: [] })
	})
})

describe('reloadWidgets', () => {
	test('reloads timelines on iOS', async () => {
		await reloadWidgets()
		expect(SharedStorage.reloadWidgets).toHaveBeenCalled()
	})

	test('is a no-op on Android (native side already refreshes)', async () => {
		Platform.OS = 'android'
		await reloadWidgets()
		expect(SharedStorage.reloadWidgets).not.toHaveBeenCalled()
	})

	test('swallows native errors', async () => {
		SharedStorage.reloadWidgets.mockRejectedValue(new Error('x'))
		await expect(reloadWidgets()).resolves.toBeUndefined()
	})
})
