/**
 * Display-name sanitizing: emojis in user names are a GOLD-only perk.
 * Pure module (no RN imports) so it's testable under `@jest-environment node`.
 *
 * The backend enforces the same rule; this is the client-side mirror so
 * cached/legacy names with emojis never render for non-gold users.
 */

// Keycap sequences (1️⃣, #️⃣, *️⃣) — strip the whole sequence so the digit doesn't survive alone
const KEYCAP_RE = /[0-9#*]️?⃣/gu

// Emoji & pictograph codepoints, plus the invisible glue that composes them
// (ZWJ, variation selectors, combining keycap, tag characters for flag sequences)
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu

/**
 * Removes emojis (and their composing characters) from a string,
 * collapsing any leftover whitespace.
 *
 * @param {string} text - Raw text possibly containing emojis.
 * @returns {string} Text without emojis, trimmed.
 */
export const stripEmojis = (text) => {
	if (!text) return ''
	return String(text)
		.replace(KEYCAP_RE, '')
		.replace(EMOJI_RE, '')
		.replace(/\s{2,}/g, ' ')
		.trim()
}

/**
 * Name to render for a user: gold users keep their emojis, everyone else
 * gets them stripped. Falls back to the @username if the name was only emojis.
 *
 * @param {object} [user] - User object ({ name, username, golden_check }).
 * @returns {string} Sanitized display name.
 */
export const displayName = (user) => {
	const name = user?.name || ''
	if (user?.golden_check) return name
	return stripEmojis(name) || user?.username || ''
}

/**
 * Same rule for "name lastname" renders (search results, contacts).
 *
 * @param {object} [user] - User object ({ name, lastname, username, golden_check }).
 * @returns {string} Sanitized full name.
 */
export const displayFullName = (user) => {
	const full = [user?.name, user?.lastname].filter(Boolean).join(' ')
	if (user?.golden_check) return full
	return stripEmojis(full) || user?.username || ''
}
