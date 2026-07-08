/**
 * Unit tests for the push-notification prompt gating — node environment with
 * OneSignal, AsyncStorage and userApi mocked (see keypadAmount.test.js).
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	getMany: jest.fn(),
	setItem: jest.fn(),
	setMany: jest.fn(),
}))
jest.mock('react-native-onesignal', () => ({
	OneSignal: {
		Notifications: {
			getPermissionAsync: jest.fn(),
			requestPermission: jest.fn(),
		},
		User: { pushSubscription: { optIn: jest.fn() } },
	},
}))
jest.mock('../api/userApi', () => ({ userApi: { updateNotificationSettings: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OneSignal } from 'react-native-onesignal'
import { userApi } from '../api/userApi'
import usePushPrompt from './usePushPrompt'

const KEYS = {
	POST_TX_SHOWN: 'push_prompt_post_tx_shown',
	BANNER_DISMISS_COUNT: 'push_banner_dismiss_count',
	BANNER_LAST_DISMISS: 'push_banner_last_dismiss',
	ONBOARD_PROMPT_SHOWN: 'push_onboard_prompt_shown',
}
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-07T12:00:00.000Z').getTime()

const renderPushPrompt = async () => {
	const result = { current: null }
	const Harness = () => {
		result.current = usePushPrompt()
		return null
	}
	await act(async () => { create(<Harness />) })
	return result
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers({ now: NOW })
	OneSignal.Notifications.getPermissionAsync.mockResolvedValue(false)
	OneSignal.Notifications.requestPermission.mockResolvedValue(true)
	AsyncStorage.getMany.mockResolvedValue({})
	AsyncStorage.setItem.mockResolvedValue()
	AsyncStorage.setMany.mockResolvedValue()
	userApi.updateNotificationSettings.mockResolvedValue({ success: true })
})
afterEach(() => { jest.useRealTimers() })

test('with push already granted no surface prompts', async () => {
	OneSignal.Notifications.getPermissionAsync.mockResolvedValue(true)
	const prompt = await renderPushPrompt()
	expect(prompt.current.isPushEnabled).toBe(true)
	expect(prompt.current.shouldShowPostTxPrompt).toBe(false)
	expect(prompt.current.shouldShowBanner).toBe(false)
	expect(prompt.current.shouldShowRedDot).toBe(false)
})

test('first run without permission shows every surface', async () => {
	const prompt = await renderPushPrompt()
	expect(prompt.current.shouldShowPostTxPrompt).toBe(true)
	expect(prompt.current.shouldShowBanner).toBe(true)
	expect(prompt.current.shouldShowRedDot).toBe(true)
	expect(prompt.current.shouldShowOnboardPrompt).toBe(true)
})

test('stored flags suppress the one-time prompts', async () => {
	AsyncStorage.getMany.mockResolvedValue({
		[KEYS.POST_TX_SHOWN]: 'true',
		[KEYS.ONBOARD_PROMPT_SHOWN]: 'true',
	})
	const prompt = await renderPushPrompt()
	expect(prompt.current.shouldShowPostTxPrompt).toBe(false)
	expect(prompt.current.shouldShowOnboardPrompt).toBe(false)
	expect(prompt.current.shouldShowRedDot).toBe(true) // red dot persists
})

test('the banner disappears for good after 3 dismissals', async () => {
	AsyncStorage.getMany.mockResolvedValue({
		[KEYS.BANNER_DISMISS_COUNT]: '3',
		[KEYS.BANNER_LAST_DISMISS]: String(NOW - 10 * WEEK_MS),
	})
	const prompt = await renderPushPrompt()
	expect(prompt.current.shouldShowBanner).toBe(false)
})

test('the banner honors the 1-week cooldown between shows', async () => {
	AsyncStorage.getMany.mockResolvedValue({
		[KEYS.BANNER_DISMISS_COUNT]: '1',
		[KEYS.BANNER_LAST_DISMISS]: String(NOW - WEEK_MS + 60000),
	})
	const cooling = await renderPushPrompt()
	expect(cooling.current.shouldShowBanner).toBe(false)

	AsyncStorage.getMany.mockResolvedValue({
		[KEYS.BANNER_DISMISS_COUNT]: '1',
		[KEYS.BANNER_LAST_DISMISS]: String(NOW - WEEK_MS - 60000),
	})
	const cooled = await renderPushPrompt()
	expect(cooled.current.shouldShowBanner).toBe(true)
})

test('dismissBanner increments the count and persists both keys', async () => {
	const prompt = await renderPushPrompt()
	await act(async () => { await prompt.current.dismissBanner() })
	expect(prompt.current.shouldShowBanner).toBe(false) // cooldown starts now
	expect(AsyncStorage.setMany).toHaveBeenCalledWith({
		[KEYS.BANNER_DISMISS_COUNT]: '1',
		[KEYS.BANNER_LAST_DISMISS]: String(NOW),
	})
})

test('dismissPostTxPrompt and dismissOnboardPrompt persist their one-time flags', async () => {
	const prompt = await renderPushPrompt()
	await act(async () => { await prompt.current.dismissPostTxPrompt() })
	expect(prompt.current.shouldShowPostTxPrompt).toBe(false)
	expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.POST_TX_SHOWN, 'true')

	await act(async () => { await prompt.current.dismissOnboardPrompt() })
	expect(prompt.current.shouldShowOnboardPrompt).toBe(false)
	expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEYS.ONBOARD_PROMPT_SHOWN, 'true')
})

test('enablePush requests the OS permission, opts into OneSignal and flags the backend', async () => {
	const prompt = await renderPushPrompt()
	await act(async () => { await prompt.current.enablePush() })
	expect(OneSignal.Notifications.requestPermission).toHaveBeenCalledWith(true)
	expect(OneSignal.User.pushSubscription.optIn).toHaveBeenCalled()
	expect(userApi.updateNotificationSettings).toHaveBeenCalledWith({ push_enabled: true })
	expect(prompt.current.isPushEnabled).toBe(true)
	expect(prompt.current.shouldShowRedDot).toBe(false)
})

test('a denied permission keeps the surfaces on', async () => {
	OneSignal.Notifications.requestPermission.mockResolvedValue(false)
	const prompt = await renderPushPrompt()
	await act(async () => { await prompt.current.enablePush() })
	expect(prompt.current.isPushEnabled).toBe(false)
	expect(prompt.current.shouldShowRedDot).toBe(true)
})

test('an enablePush failure is swallowed', async () => {
	OneSignal.Notifications.requestPermission.mockRejectedValue(new Error('no dialog'))
	const prompt = await renderPushPrompt()
	await act(async () => { await prompt.current.enablePush() })
	expect(prompt.current.isPushEnabled).toBe(false)
})
