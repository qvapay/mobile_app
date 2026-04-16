import InAppReview from 'react-native-in-app-review'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LAST_REQUEST_KEY = '@qvapay:lastReviewRequest'
const COOLDOWN_DAYS = 90

export const requestReview = async () => {
	try {
		if (!InAppReview.isAvailable()) return { shown: false, reason: 'unavailable' }
		await InAppReview.RequestInAppReview()
		await AsyncStorage.setItem(LAST_REQUEST_KEY, String(Date.now()))
		return { shown: true }
	} catch { return { shown: false, reason: 'error' } }
}

export const maybeRequestReview = async () => {
	const last = await AsyncStorage.getItem(LAST_REQUEST_KEY)
	if (last) {
		const daysSince = (Date.now() - Number(last)) / (1000 * 60 * 60 * 24)
		if (daysSince < COOLDOWN_DAYS) return { shown: false, reason: 'cooldown' }
	}
	return requestReview()
}
