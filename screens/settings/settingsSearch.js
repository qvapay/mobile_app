/**
 * Pure filtering logic for the Settings menu search box — kept free of React
 * Native imports so it can run under `@jest-environment node` (see
 * keypadAmount.js for the pattern).
 */

/**
 * Normalizes a string for accent- and case-insensitive matching:
 * lowercase + NFD decomposition with combining marks stripped, so
 * "Verificación" matches "verificacion" and vice versa.
 *
 * @param {string} value
 * @returns {string}
 */
const normalizeQuery = (value) => (value || '')
	.toLowerCase()
	.normalize('NFD')
	.replace(/[\u0300-\u036f]/g, '')

/**
 * Whether a catalog option matches an already-normalized query, by its
 * RESOLVED title (option.title is an i18n key since the catalog went
 * multilingual) or by any of its bilingual `keywords`.
 *
 * @param {{title: string, keywords?: string[]}} option
 * @param {string} normalizedQuery - Output of `normalizeQuery`, non-empty.
 * @param {(key: string) => string} [t] - i18n resolver; identity by default.
 * @returns {boolean}
 */
const matchesQuery = (option, normalizedQuery, t = (key) => key) => {
	if (normalizeQuery(t(option.title)).includes(normalizedQuery)) { return true }
	return (option.keywords || []).some(keyword => normalizeQuery(keyword).includes(normalizedQuery))
}

/**
 * Filters the settings catalog by a free-text query. Groups keep their title
 * and only their matching options; groups left empty are dropped entirely.
 * An empty or whitespace-only query returns the catalog untouched (same
 * reference, so the menu renders exactly as without a search). Titles are
 * matched in the ACTIVE language via `t` (the search box follows the UI
 * language); keywords are bilingual so either language always matches.
 *
 * @param {Object<string, {title: string, options: Array}>} settings - The catalog from settings.js.
 * @param {string} query - Raw user input.
 * @param {(key: string) => string} [t] - i18n resolver (e.g. `t` from useTranslation).
 * @returns {Object<string, {title: string, options: Array}>}
 */
const filterSettings = (settings, query, t = (key) => key) => {
	const normalized = normalizeQuery(query).trim()
	if (!normalized) { return settings }

	const filtered = {}
	for (const [key, group] of Object.entries(settings)) {
		const options = group.options.filter(option => matchesQuery(option, normalized, t))
		if (options.length > 0) { filtered[key] = { ...group, options } }
	}
	return filtered
}

export { normalizeQuery, matchesQuery, filterSettings }
