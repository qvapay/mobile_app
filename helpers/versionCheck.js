// Store-update detection that drives ui/UpdatePromptModal (see useAppNavigation).
import { Linking, Platform } from 'react-native'
import VersionCheck from 'react-native-version-check'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LAST_PROMPT_KEY = '@qvapay:lastVersionPrompt'
const COOLDOWN_DAYS = 3

const BUNDLE_ID = 'com.qvapay'

/**
 * Compares the installed version against the newest one published for
 * com.qvapay on the current platform's store (App Store lookup / Play Store
 * page scrape via react-native-version-check). Never throws — network or
 * store failures resolve to `{ needsUpdate: false }`.
 * @returns {Promise<{ needsUpdate: boolean, currentVersion?: string,
 *   latestVersion?: string, storeUrl?: string, reason?: 'no-latest'|'error' }>}
 */
const checkForUpdate = async () => {
	try {
		const provider = Platform.OS === 'ios' ? 'appStore' : 'playStore'
		const [currentVersion, latestVersion, storeUrl] = await Promise.all([
			Promise.resolve(VersionCheck.getCurrentVersion()),
			VersionCheck.getLatestVersion({ provider, packageName: BUNDLE_ID, bundleId: BUNDLE_ID }),
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

/**
 * Store check gated by a 3-day cooldown so users aren't re-nagged on every
 * launch. The cooldown counts from the last time the modal was actually shown
 * (see markPromptShown), not from the last check.
 * @returns {Promise<object>} Same shape as checkForUpdate; `reason: 'cooldown'`
 *   when suppressed by the cooldown.
 */
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

/** Records that the update prompt was shown now, starting the 3-day cooldown. */
export const markPromptShown = async () => { try { await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now())) } catch { /* ignore */ } }

/**
 * Opens the store page returned by the version check.
 * @param {string} url - `storeUrl` from maybePromptUpdate.
 */
export const openStore = async (url) => { try { if (url) await Linking.openURL(url) } catch { /* ignore */ } }
