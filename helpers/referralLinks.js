// Builders for the referral invite links shared from settings/Referals.
// Android gets the Play Store URL with the invite embedded in the Install
// Referrer (auto-applied on the invitee's register — see installReferrer.js);
// iPhone/desktop fall back to the web register URL, which carries the inviter's
// username in the path. Swap in the App Store URL here once the iOS app leaves
// TestFlight (no public listing as of 2026-08).

const PLAY_STORE_BASE = 'https://play.google.com/store/apps/details?id=com.qvapay'
const WEB_REGISTER_BASE = 'https://www.qvapay.com/register'

/**
 * Builds the Play Store install link with the referral embedded in the
 * `referrer` param (single URL-encoded, as Play expects). On the invitee's
 * first launch `consumeInstallReferrer()` reads it back and the register
 * wizard prefills the invite code and acquisition source.
 * @param {string} username - The inviter's username
 * @param {string} [source] - Share channel (telegram|x|facebook|sms|link)
 * @returns {string} Play Store URL with referral attribution
 */
export const buildPlayReferralLink = (username, source = 'link') => {
	const referrer = `invite=${username}&utm_source=${source}&utm_medium=referral&utm_campaign=referidos`
	return `${PLAY_STORE_BASE}&referrer=${encodeURIComponent(referrer)}`
}

/**
 * Builds the web register link with the inviter's username in the path —
 * the fallback for iPhone and desktop while there is no App Store listing.
 * @param {string} username - The inviter's username
 * @param {string} [source] - Share channel tag appended as query param
 * @returns {string} Web registration URL
 */
export const buildWebReferralLink = (username, source) =>
	`${WEB_REGISTER_BASE}/${username}${source ? `?source=${source}` : ''}`

/**
 * Composes the multiplatform invite message shared through the social
 * buttons: Play link (referral auto-applied) + web link for everyone else,
 * with the code spelled out for paths that can't carry it.
 * @param {string} username - The inviter's username
 * @param {string} [source] - Share channel (tags both links)
 * @returns {string} Ready-to-share message
 */
export const buildReferralMessage = (username, source) => [
	`Únete a QvaPay con mi código de invitación: ${username}`,
	`📲 Android: ${buildPlayReferralLink(username, source)}`,
	`🌐 iPhone y web: ${buildWebReferralLink(username, source)}`,
].join('\n')
