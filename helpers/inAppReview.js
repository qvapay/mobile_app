import InAppReview from 'react-native-in-app-review'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LAST_REQUEST_KEY = '@qvapay:lastReviewRequest'
// Our own throttle, on top of the stores' internal quotas
const COOLDOWN_DAYS = 90

/**
 * Requests the native in-app review dialog (StoreKit rating sheet on iOS,
 * Play In-App Review on Android) and records the attempt timestamp.
 * Both OSes quota the dialog and may silently skip it, so `shown: true` only
 * means the request was made without error — never block UX on it.
 * @returns {Promise<{ shown: boolean, reason?: 'unavailable'|'error' }>}
 */
export const requestReview = async () => {
	try {
		if (!InAppReview.isAvailable()) return { shown: false, reason: 'unavailable' }
		await InAppReview.RequestInAppReview()
		await AsyncStorage.setItem(LAST_REQUEST_KEY, String(Date.now()))
		return { shown: true }
	} catch { return { shown: false, reason: 'error' } }
}

/**
 * Requests a review only if none was requested in the last 90 days.
 * Call this from "happy moment" flows (e.g. after a successful transaction).
 * @returns {Promise<{ shown: boolean, reason?: 'cooldown'|'unavailable'|'error' }>}
 */
export const maybeRequestReview = async () => {
	const last = await AsyncStorage.getItem(LAST_REQUEST_KEY)
	if (last) {
		const daysSince = (Date.now() - Number(last)) / (1000 * 60 * 60 * 24)
		if (daysSince < COOLDOWN_DAYS) return { shown: false, reason: 'cooldown' }
	}
	return requestReview()
}
