import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import AsyncStorage from '@react-native-async-storage/async-storage'

const CONSUMED_KEY = '@qvapay:installReferrerConsumed'
const ATTRIBUTION_KEY = '@qvapay:installAttribution'

// Only paths the app knows how to open (see linking.js / useAppNavigation parsers)
const VALID_LINK_PREFIXES = ['/p2p/', '/pay/', '/store/']

/**
 * Parses the raw Google Play Install Referrer string into campaign attribution.
 * Expected shape: `utm_source=telegram&utm_campaign=tasas&qp_link=%2Fp2p%2F<uuid>&invite=<username>`.
 * The whole string may arrive URL-encoded one extra time (Play passes the
 * `referrer` param through verbatim), so a `%3D`-only string is decoded first.
 * @param {string} raw - Referrer string from the Play Install Referrer API
 * @returns {{ utmSource: string|null, utmMedium: string|null, utmCampaign: string|null, qpLink: string|null, invite: string|null }|null}
 *   Parsed attribution, or null for organic installs and unusable strings.
 */
export const parseInstallReferrer = (raw) => {

	if (!raw || typeof raw !== 'string') return null
	let referrer = raw.trim()
	if (!referrer || referrer === 'unknown') return null
	// Double-encoded referrer: no bare "=" but encoded ones — decode once more
	if (!referrer.includes('=') && referrer.includes('%3D')) { try { referrer = decodeURIComponent(referrer) } catch { return null } }

	const params = {}
	for (const pair of referrer.split('&')) {
		const eq = pair.indexOf('=')
		if (eq <= 0) continue
		try {
			params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1))
		} catch { /* skip malformed pair */ }
	}

	const utmSource = params.utm_source || null
	const utmMedium = params.utm_medium || null
	if (utmSource === 'google-play' && utmMedium === 'organic') return null

	let qpLink = params.qp_link || null
	if (qpLink && !VALID_LINK_PREFIXES.some(prefix => qpLink.startsWith(prefix))) qpLink = null

	const attribution = {
		utmSource,
		utmMedium,
		utmCampaign: params.utm_campaign || null,
		qpLink,
		invite: params.invite || null,
	}
	const meaningful = attribution.utmSource || attribution.utmCampaign || attribution.qpLink || attribution.invite
	return meaningful ? attribution : null
}

/**
 * Maps a free-form utm_source onto the backend's registration source enum
 * (`sms|telegram|x|facebook|link` — POST /auth/register rejects anything else
 * with a 400, so unknown campaign sources collapse to the generic `link`).
 * @param {string|null|undefined} utmSource - utm_source from the install referrer
 * @returns {string|undefined} A valid enum value, or undefined when there is no source
 */
export const mapSourceToEnum = (utmSource) => {
	if (!utmSource) return undefined
	const source = utmSource.toLowerCase()
	if (source === 'telegram') return 'telegram'
	if (source === 'facebook' || source === 'fb') return 'facebook'
	if (source === 'x' || source === 'twitter') return 'x'
	if (source === 'sms') return 'sms'
	return 'link'
}

/**
 * Reads the Play Install Referrer once per install (Android only) and persists
 * the parsed attribution. Subsequent calls (and every call on iOS) resolve to
 * null. Errors never propagate — a failed read just retries on the next launch.
 * @returns {Promise<ReturnType<typeof parseInstallReferrer>>} The attribution captured on this call, or null.
 */
export const consumeInstallReferrer = async () => {
	if (Platform.OS !== 'android') return null
	try {
		if (await AsyncStorage.getItem(CONSUMED_KEY)) return null
		const raw = await DeviceInfo.getInstallReferrer()
		const attribution = parseInstallReferrer(raw)
		if (attribution) await AsyncStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution))
		await AsyncStorage.setItem(CONSUMED_KEY, '1')
		return attribution
	} catch { return null }
}

/**
 * Returns the attribution captured by `consumeInstallReferrer()` on the first
 * launch, for flows that run later (e.g. the register wizard picking up the
 * inviter's code and the acquisition source).
 * @returns {Promise<ReturnType<typeof parseInstallReferrer>>}
 */
export const getStoredAttribution = async () => {
	try {
		const stored = await AsyncStorage.getItem(ATTRIBUTION_KEY)
		return stored ? JSON.parse(stored) : null
	} catch { return null }
}
