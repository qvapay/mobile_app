import { Linking, Platform } from 'react-native'
import VersionCheck from 'react-native-version-check'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LAST_PROMPT_KEY = '@qvapay:lastVersionPrompt'
const COOLDOWN_DAYS = 3

const BUNDLE_ID = 'com.qvapay'

export const checkForUpdate = async () => {
	try {
		const provider = Platform.OS === 'ios' ? 'appStore' : 'playStore'
		const [currentVersion, latestVersion, storeUrl] = await Promise.all([
			Promise.resolve(VersionCheck.getCurrentVersion()),
			VersionCheck.getLatestVersion({ provider, packageName: BUNDLE_ID, bundleId: BUNDLE_ID, ignoreErrors: true }),
			VersionCheck.getStoreUrl({ appID: BUNDLE_ID, packageName: BUNDLE_ID }),
		])
		if (!latestVersion) return { needsUpdate: false, reason: 'no-latest' }
		const result = await VersionCheck.needUpdate({ currentVersion, latestVersion })
		return {
			needsUpdate: !!result?.isNeeded,
			currentVersion,
			latestVersion,
			storeUrl,
		}
	} catch { return { needsUpdate: false, reason: 'error' } }
}

export const maybePromptUpdate = async () => {
	try {
		const last = await AsyncStorage.getItem(LAST_PROMPT_KEY)
		if (last) {
			const daysSince = (Date.now() - Number(last)) / (1000 * 60 * 60 * 24)
			if (daysSince < COOLDOWN_DAYS) return { needsUpdate: false, reason: 'cooldown' }
		}
		return checkForUpdate()
	} catch { return { needsUpdate: false, reason: 'error' } }
}

export const markPromptShown = async () => { try { await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now())) } catch { /* ignore */ } }

export const openStore = async (url) => { try { if (url) await Linking.openURL(url) } catch { /* ignore */ } }
