/**
 * Requisitos que el maker pone a quien aplique a su oferta P2P (fixed y por rango).
 * Módulo PURO (testeable bajo `@jest-environment node`), espejo de
 * `scripts/p2p/requirements-rules.js` de qpweb: los valores son CERRADOS y el
 * backend responde 400 `INVALID_REQUIREMENTS` a cualquier otro — cambiarlos exige
 * tocar LOS DOS repos.
 *
 * No confundir con `p2pRequirements.ts` (lo que el propio usuario necesita para
 * entrar al P2P: KYC, teléfono, Telegram).
 */

export type ApplicantRequirementKey = 'min_completed' | 'min_rating' | 'min_account_days' | 'min_trustscore'

/** Valores permitidos por requisito (el orden es el de la pantalla). */
export const REQUIREMENT_OPTIONS: Record<ApplicantRequirementKey, readonly number[]> = {
	min_completed: [5, 10, 25, 50, 100],
	min_rating: [4, 4.5],
	min_account_days: [7, 30, 90, 180],
	min_trustscore: [50, 85],
}

export const REQUIREMENT_KEYS = Object.keys(REQUIREMENT_OPTIONS) as ApplicantRequirementKey[]

/** Selección del formulario: `null` = sin ese requisito. */
export type ApplicantRequirements = Record<ApplicantRequirementKey, number | null>

export const EMPTY_REQUIREMENTS: ApplicantRequirements = { min_completed: null, min_rating: null, min_account_days: null, min_trustscore: null }

/** Solo las claves activas y con un valor permitido, listas para `requirements` de `/p2p/create`. */
export const requirementsPayload = (value: Partial<ApplicantRequirements> = {}): Partial<Record<ApplicantRequirementKey, number>> => {
	const out: Partial<Record<ApplicantRequirementKey, number>> = {}
	for (const key of REQUIREMENT_KEYS) {
		const v = value[key]
		if (v != null && REQUIREMENT_OPTIONS[key].includes(v)) { out[key] = v }
	}
	return out
}

/** Cuántos requisitos hay activos. */
export const activeRequirementsCount = (value: Partial<ApplicantRequirements> = {}) => Object.keys(requirementsPayload(value)).length

/** Límite del mensaje personalizado (GOLD), el mismo del wizard web. */
export const P2P_MESSAGE_MAX = 79
