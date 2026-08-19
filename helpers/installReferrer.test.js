/**
 * Unit tests for the install referrer attribution helper — node environment
 * with react-native, device-info and AsyncStorage mocked (see inAppReview.test.js).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Platform: { OS: 'android' },
}))
jest.mock('react-native-device-info', () => ({
	getInstallReferrer: jest.fn(),
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
}))

import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
	parseInstallReferrer,
	mapSourceToEnum,
	consumeInstallReferrer,
	getStoredAttribution,
} from './installReferrer'

const CONSUMED_KEY = '@qvapay:installReferrerConsumed'
const ATTRIBUTION_KEY = '@qvapay:installAttribution'

beforeEach(() => {
	jest.clearAllMocks()
	Platform.OS = 'android'
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
	DeviceInfo.getInstallReferrer.mockResolvedValue(null)
})

describe('parseInstallReferrer', () => {
	test('parses a full campaign referrer', () => {
		expect(parseInstallReferrer('utm_source=telegram&utm_medium=social&utm_campaign=tasas&qp_link=%2Fp2p%2Fabc-123&invite=erich')).toEqual({
			utmSource: 'telegram',
			utmMedium: 'social',
			utmCampaign: 'tasas',
			qpLink: '/p2p/abc-123',
			invite: 'erich',
		})
	})

	test('decodes a double-encoded referrer', () => {
		expect(parseInstallReferrer('utm_source%3Dtelegram%26utm_campaign%3Dtasas')).toEqual({
			utmSource: 'telegram',
			utmMedium: null,
			utmCampaign: 'tasas',
			qpLink: null,
			invite: null,
		})
	})

	test('organic Play installs return null', () => {
		expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toBeNull()
	})

	test('empty, unknown and meaningless strings return null', () => {
		expect(parseInstallReferrer('')).toBeNull()
		expect(parseInstallReferrer(null)).toBeNull()
		expect(parseInstallReferrer('unknown')).toBeNull()
		expect(parseInstallReferrer('gclid=xyz')).toBeNull()
	})

	test('discards qp_link outside the supported paths but keeps the rest', () => {
		expect(parseInstallReferrer('utm_campaign=phish&qp_link=%2Fsettings%2Fdanger')).toEqual({
			utmSource: null,
			utmMedium: null,
			utmCampaign: 'phish',
			qpLink: null,
			invite: null,
		})
	})

	test('invite alone is meaningful (referral links without campaign)', () => {
		expect(parseInstallReferrer('invite=erich')).toMatchObject({ invite: 'erich' })
	})
})

describe('mapSourceToEnum', () => {
	test('maps known sources onto the backend enum', () => {
		expect(mapSourceToEnum('telegram')).toBe('telegram')
		expect(mapSourceToEnum('Facebook')).toBe('facebook')
		expect(mapSourceToEnum('fb')).toBe('facebook')
		expect(mapSourceToEnum('twitter')).toBe('x')
		expect(mapSourceToEnum('x')).toBe('x')
		expect(mapSourceToEnum('sms')).toBe('sms')
	})

	test('unknown sources collapse to link, absent to undefined', () => {
		expect(mapSourceToEnum('newsletter')).toBe('link')
		expect(mapSourceToEnum(null)).toBeUndefined()
		expect(mapSourceToEnum('')).toBeUndefined()
	})
})

describe('consumeInstallReferrer', () => {
	test('reads, persists and marks consumed on first launch', async () => {
		DeviceInfo.getInstallReferrer.mockResolvedValue('utm_source=telegram&invite=erich')
		const attribution = await consumeInstallReferrer()
		expect(attribution).toMatchObject({ utmSource: 'telegram', invite: 'erich' })
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(ATTRIBUTION_KEY, JSON.stringify(attribution))
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(CONSUMED_KEY, '1')
	})

	test('second call is a no-op (one shot per install)', async () => {
		AsyncStorage.getItem.mockResolvedValue('1')
		await expect(consumeInstallReferrer()).resolves.toBeNull()
		expect(DeviceInfo.getInstallReferrer).not.toHaveBeenCalled()
	})

	test('organic referrer still marks consumed without persisting attribution', async () => {
		DeviceInfo.getInstallReferrer.mockResolvedValue('utm_source=google-play&utm_medium=organic')
		await expect(consumeInstallReferrer()).resolves.toBeNull()
		expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)
		expect(AsyncStorage.setItem).toHaveBeenCalledWith(CONSUMED_KEY, '1')
	})

	test('iOS resolves to null without touching anything', async () => {
		Platform.OS = 'ios'
		await expect(consumeInstallReferrer()).resolves.toBeNull()
		expect(DeviceInfo.getInstallReferrer).not.toHaveBeenCalled()
		expect(AsyncStorage.getItem).not.toHaveBeenCalled()
	})

	test('a native error resolves to null (retries next launch)', async () => {
		DeviceInfo.getInstallReferrer.mockRejectedValue(new Error('service unavailable'))
		await expect(consumeInstallReferrer()).resolves.toBeNull()
		expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(CONSUMED_KEY, '1')
	})
})

describe('getStoredAttribution', () => {
	test('returns the persisted attribution', async () => {
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ utmSource: 'telegram', invite: 'erich' }))
		await expect(getStoredAttribution()).resolves.toEqual({ utmSource: 'telegram', invite: 'erich' })
	})

	test('returns null when nothing stored or JSON is corrupt', async () => {
		await expect(getStoredAttribution()).resolves.toBeNull()
		AsyncStorage.getItem.mockResolvedValue('{corrupt')
		await expect(getStoredAttribution()).resolves.toBeNull()
	})
})
