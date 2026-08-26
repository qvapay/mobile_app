/**
 * Pure filtering logic for the Settings menu search box — kept free of React
 * Native imports so it can run under `@jest-environment node` (see
 * keypadAmount.js for the pattern). Los tipos se declaran LOCALES (estructurales)
 * a propósito: importar los de settings.ts arrastraría su import de iconos.
 */

/** Resolutor de i18n; por defecto la identidad (los tests lo inyectan). */
type Translator = (key: string) => string

/** Forma mínima de una fila del catálogo que el filtro necesita leer. */
export type SearchableOption = {
	title: string
	keywords?: string[]
}

/** Forma mínima de un grupo del catálogo. */
export type SearchableGroup = {
	title: string
	options: SearchableOption[]
}

/**
 * Normalizes a string for accent- and case-insensitive matching:
 * lowercase + NFD decomposition with combining marks stripped, so
 * "Verificación" matches "verificacion" and vice versa.
 */
const normalizeQuery = (value?: string | null): string => (value || '')
	.toLowerCase()
	.normalize('NFD')
	.replace(/[\u0300-\u036f]/g, '')

/**
 * Whether a catalog option matches an already-normalized query, by its
 * RESOLVED title (option.title is an i18n key since the catalog went
 * multilingual) or by any of its bilingual `keywords`.
 *
 * @param option
 * @param normalizedQuery - Output of `normalizeQuery`, non-empty.
 * @param t - i18n resolver; identity by default.
 */
const matchesQuery = (option: SearchableOption, normalizedQuery: string, t: Translator = (key) => key): boolean => {
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
 * @param settings - The catalog from settings.ts.
 * @param query - Raw user input.
 * @param t - i18n resolver (e.g. `t` from useTranslation).
 */
const filterSettings = <G extends SearchableGroup>(
	settings: Record<string, G>,
	query?: string | null,
	t: Translator = (key) => key,
): Record<string, G> => {
	const normalized = normalizeQuery(query).trim()
	if (!normalized) { return settings }

	const filtered: Record<string, G> = {}
	for (const [key, group] of Object.entries(settings)) {
		const options = group.options.filter(option => matchesQuery(option, normalized, t))
		// Cast: el spread de un genérico + override de `options` no se reduce a G
		// por sí solo, aunque la forma sea exactamente la de `group`.
		if (options.length > 0) { filtered[key] = { ...group, options } as G }
	}
	return filtered
}

export { normalizeQuery, matchesQuery, filterSettings }
