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
 * Whether a catalog option matches an already-normalized query,
 * by title or by any of its `keywords`.
 *
 * @param {{title: string, keywords?: string[]}} option
 * @param {string} normalizedQuery - Output of `normalizeQuery`, non-empty.
 * @returns {boolean}
 */
const matchesQuery = (option, normalizedQuery) => {
	if (normalizeQuery(option.title).includes(normalizedQuery)) { return true }
	return (option.keywords || []).some(keyword => normalizeQuery(keyword).includes(normalizedQuery))
}

/**
 * Filters the settings catalog by a free-text query. Groups keep their title
 * and only their matching options; groups left empty are dropped entirely.
 * An empty or whitespace-only query returns the catalog untouched (same
 * reference, so the menu renders exactly as without a search).
 *
 * @param {Object<string, {title: string, options: Array}>} settings - The catalog from settings.js.
 * @param {string} query - Raw user input.
 * @returns {Object<string, {title: string, options: Array}>}
 */
const filterSettings = (settings, query) => {
	const normalized = normalizeQuery(query).trim()
	if (!normalized) { return settings }

	const filtered = {}
	for (const [key, group] of Object.entries(settings)) {
		const options = group.options.filter(option => matchesQuery(option, normalized))
		if (options.length > 0) { filtered[key] = { ...group, options } }
	}
	return filtered
}

export { normalizeQuery, matchesQuery, filterSettings }
