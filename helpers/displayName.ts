/**
 * Display-name sanitizing: emojis in user names are a GOLD-only perk.
 * Pure module (no RN imports) so it's testable under `@jest-environment node`.
 *
 * The backend enforces the same rule; this is the client-side mirror so
 * cached/legacy names with emojis never render for non-gold users.
 */

/** Subset del usuario que estas funciones leen (User de domain lo cumple). */
type NamedUser = {
	name?: string | null
	lastname?: string | null
	username?: string | null
	golden_check?: boolean | number | null
}

// Keycap sequences (1️⃣, #️⃣, *️⃣) — strip the whole sequence so the digit doesn't survive alone
const KEYCAP_RE = /[0-9#*]️?⃣/gu

// Emoji & pictograph codepoints, plus the invisible glue that composes them
// (ZWJ, variation selectors, combining keycap, tag characters for flag sequences)
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu

/**
 * Removes emojis (and their composing characters) from a string,
 * collapsing any leftover whitespace.
 *
 * @param text - Raw text possibly containing emojis.
 * @returns Text without emojis, trimmed.
 */
export const stripEmojis = (text: string | null | undefined): string => {
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
 * @param user - User object (`name`, `username`, `golden_check`).
 * @returns Sanitized display name.
 */
export const displayName = (user: NamedUser | null | undefined): string => {
	const name = user?.name || ''
	if (user?.golden_check) return name
	return stripEmojis(name) || user?.username || ''
}

/**
 * Same rule for "name lastname" renders (search results, contacts).
 *
 * @param user - User object (`name`, `lastname`, `username`, `golden_check`).
 * @returns Sanitized full name.
 */
export const displayFullName = (user: NamedUser | null | undefined): string => {
	const full = [user?.name, user?.lastname].filter(Boolean).join(' ')
	if (user?.golden_check) return full
	return stripEmojis(full) || user?.username || ''
}
