/**
 * Contribuidores de la app (easter egg del pie de Ajustes). PURO: cero react-native,
 * se testea en entorno node.
 *
 * La fuente es la lista pública de GitHub del repo `qvapay/mobile_app`. Se queda
 * fuera todo lo que no sea una persona: bots (`type: 'Bot'`, dependabot) y los
 * agentes de IA (Claude firma como `Co-Authored-By` y hoy no aparece, pero si
 * GitHub algún día lo enlaza a una cuenta, tampoco queremos verlo aquí).
 */

export type GithubContributor = {
	login: string
	avatar_url: string
	html_url: string
	contributions: number
	type?: string
}

export const CONTRIBUTORS_REPO_URL = 'https://github.com/qvapay/mobile_app'

export const CONTRIBUTORS_URL = 'https://api.github.com/repos/qvapay/mobile_app/contributors?per_page=100'

/** Logins que nunca cuentan como personas, por si GitHub los lista como `User`. */
export const EXCLUDED_LOGIN = /claude|anthropic|cursor|copilot|\[bot\]|-bot$/i

/** Dos toques en menos de esto = doble toque. */
export const DOUBLE_TAP_MS = 350

const isContributor = (value: unknown): value is GithubContributor => {
	if (!value || typeof value !== 'object') return false
	const c = value as Record<string, unknown>
	return typeof c.login === 'string' && c.login.length > 0
		&& typeof c.avatar_url === 'string' && c.avatar_url.startsWith('https://')
		&& typeof c.html_url === 'string' && c.html_url.startsWith('https://')
}

/**
 * Deja solo personas, ordenadas por contribuciones. Un payload que no sea un array
 * (el `{ message }` de GitHub al pasarse de cuota, un JSON truncado) devuelve `[]`.
 */
export const filterContributors = (raw: unknown): GithubContributor[] => {
	if (!Array.isArray(raw)) return []
	return raw
		.filter(isContributor)
		.filter(c => (c.type ?? 'User') === 'User' && !EXCLUDED_LOGIN.test(c.login))
		.map(c => ({ login: c.login, avatar_url: c.avatar_url, html_url: c.html_url, contributions: Number(c.contributions) || 0, type: 'User' }))
		.sort((a, b) => b.contributions - a.contributions)
}

/** GitHub sirve el avatar al tamaño pedido con `s=`; evita bajar el de 460 px para una fila. */
export const avatarUrl = (contributor: Pick<GithubContributor, 'avatar_url'>, size = 96): string => {
	const sep = contributor.avatar_url.includes('?') ? '&' : '?'
	return `${contributor.avatar_url}${sep}s=${size}`
}

/** `lastTapAt` es el instante del toque anterior (null si no lo hubo o ya se consumió). */
export const isDoubleTap = (lastTapAt: number | null, now: number): boolean =>
	lastTapAt !== null && now - lastTapAt >= 0 && now - lastTapAt <= DOUBLE_TAP_MS
