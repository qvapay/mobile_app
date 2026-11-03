/**
 * Decide si hay Novedades que enseñar tras una actualización. PURO (cero
 * react-native): corre dentro de la reconciliación de navegación y en tests node.
 *
 * Reglas (HIG/Material): solo si la versión instalada trae manifiesto, solo si
 * es más nueva que la última vista, y NUNCA en una instalación nueva (el
 * onboarding ya graba la versión actual como vista al terminar). Si el usuario
 * se saltó varias versiones se enseña únicamente la más nueva.
 */
import type { WhatsNewRelease } from './releases'

const parseVersion = (v: unknown): number[] | null => {
	const s = String(v ?? '').trim()
	if (!/^\d+(\.\d+){0,3}$/.test(s)) return null
	return s.split('.').map(Number)
}

/** Comparación semver simplificada (`1.2` == `1.2.0`). NaN si alguna no es versión. */
export const compareSemver = (a: unknown, b: unknown): number => {
	const pa = parseVersion(a)
	const pb = parseVersion(b)
	if (!pa || !pb) return NaN
	const n = Math.max(pa.length, pb.length)
	for (let i = 0; i < n; i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0)
		if (d !== 0) return d < 0 ? -1 : 1
	}
	return 0
}

export type PickReleaseInput = {
	/** Versión instalada (`app.json`). */
	current: string
	/** Última versión cuyas novedades se vieron; `null`/`undefined` = instalación que viene de antes de esta pantalla. */
	lastSeen: string | null | undefined
	releases: WhatsNewRelease[]
}

/**
 * La release a enseñar: la más nueva con `version <= current` y, si ya se vio
 * alguna, `version > lastSeen`. `null` = nada que enseñar.
 */
export const pickRelease = ({ current, lastSeen, releases }: PickReleaseInput): WhatsNewRelease | null => {
	if (!parseVersion(current)) return null
	const seen = lastSeen && parseVersion(lastSeen) ? lastSeen : null
	let best: WhatsNewRelease | null = null
	for (const release of releases) {
		if (!release.slides.length) continue
		const cmpCurrent = compareSemver(release.version, current)
		if (Number.isNaN(cmpCurrent) || cmpCurrent > 0) continue
		if (seen && compareSemver(release.version, seen) <= 0) continue
		if (!best || compareSemver(release.version, best.version) > 0) best = release
	}
	return best
}

/** Manifiesto de una versión concreta (para repetir las novedades desde Ajustes). */
export const releaseForVersion = (version: string, releases: WhatsNewRelease[]): WhatsNewRelease | null =>
	releases.find(r => r.slides.length > 0 && compareSemver(r.version, version) === 0) ?? null
