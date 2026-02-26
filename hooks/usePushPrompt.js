import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OneSignal } from 'react-native-onesignal'
import { userApi } from '../api/userApi'

const STORAGE_KEYS = {
	POST_TX_SHOWN: 'push_prompt_post_tx_shown',
	BANNER_DISMISS_COUNT: 'push_banner_dismiss_count',
	BANNER_LAST_DISMISS: 'push_banner_last_dismiss',
	ONBOARD_PROMPT_SHOWN: 'push_onboard_prompt_shown',
}

const MAX_BANNER_DISMISSALS = 3
const BANNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000 // 1 week

const usePushPrompt = () => {
	
	const [isPushEnabled, setIsPushEnabled] = useState(true)
	const [postTxShown, setPostTxShown] = useState(true)
	const [bannerDismissCount, setBannerDismissCount] = useState(MAX_BANNER_DISMISSALS)
	const [bannerLastDismiss, setBannerLastDismiss] = useState(0)
	const [onboardShown, setOnboardShown] = useState(true)
	const [ready, setReady] = useState(false)

	useEffect(() => {
		const load = async () => {
			try {
				const hasPermission = await OneSignal.Notifications.getPermissionAsync()
				setIsPushEnabled(hasPermission)

				const [ptx, bdc, bld, obs] = await AsyncStorage.multiGet([
					STORAGE_KEYS.POST_TX_SHOWN,
					STORAGE_KEYS.BANNER_DISMISS_COUNT,
					STORAGE_KEYS.BANNER_LAST_DISMISS,
					STORAGE_KEYS.ONBOARD_PROMPT_SHOWN,
				])

				setPostTxShown(ptx[1] === 'true')
				setBannerDismissCount(parseInt(bdc[1] || '0', 10))
				setBannerLastDismiss(parseInt(bld[1] || '0', 10))
				setOnboardShown(obs[1] === 'true')
			} catch { /* storage read failed */ }
			finally { setReady(true) }
		}
		load()
	}, [])

	const shouldShowPostTxPrompt = ready && !isPushEnabled && !postTxShown
	const shouldShowRedDot = ready && !isPushEnabled
	const shouldShowOnboardPrompt = ready && !onboardShown

	const shouldShowBanner = ready && !isPushEnabled
		&& bannerDismissCount < MAX_BANNER_DISMISSALS
		&& (Date.now() - bannerLastDismiss > BANNER_COOLDOWN_MS)

	const enablePush = useCallback(async () => {
		try {
			OneSignal.Notifications.requestPermission(true)
			OneSignal.User.pushSubscription.optIn()
			await userApi.updateNotificationSettings({ push_enabled: true })
			setIsPushEnabled(true)
		} catch { /* push enable failed */ }
	}, [])

	const dismissPostTxPrompt = useCallback(async () => {
		setPostTxShown(true)
		await AsyncStorage.setItem(STORAGE_KEYS.POST_TX_SHOWN, 'true')
	}, [])

	const dismissBanner = useCallback(async () => {
		const newCount = bannerDismissCount + 1
		const now = Date.now()
		setBannerDismissCount(newCount)
		setBannerLastDismiss(now)
		await AsyncStorage.multiSet([
			[STORAGE_KEYS.BANNER_DISMISS_COUNT, String(newCount)],
			[STORAGE_KEYS.BANNER_LAST_DISMISS, String(now)],
		])
	}, [bannerDismissCount])

	const dismissOnboardPrompt = useCallback(async () => {
		setOnboardShown(true)
		await AsyncStorage.setItem(STORAGE_KEYS.ONBOARD_PROMPT_SHOWN, 'true')
	}, [])

	return {
		isPushEnabled,
		shouldShowPostTxPrompt,
		shouldShowBanner,
		shouldShowRedDot,
		shouldShowOnboardPrompt,
		enablePush,
		dismissPostTxPrompt,
		dismissBanner,
		dismissOnboardPrompt,
	}
}

export default usePushPrompt
