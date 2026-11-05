/**
 * Estado de la verificación del SSN (bloque de «Datos de tu cuenta»). PURO: deriva
 * la vista de `ssn_verification` de la ficha, traduce `block_reason` a la acción que
 * desatasca y clasifica los errores de `POST /user/cip/verify-ssn`.
 *
 * Quien decide es el servidor (`can_start`, `block_reason`); aquí no se repite la
 * cadena de requisitos (GOLD, KYC, ficha…), solo se le pone pantalla.
 */

import type { SsnBlockReason, SsnVerification, UserCip } from '../../../../types/domain'
import type { SsnVerifyResult } from '../../../../api/userApi'

/**
 * - `verified`: pill, fecha y acceso a Depositar.
 * - `ready`: puede empezar; `retry`: puede empezar pero el último intento no casó.
 * - `blocked`: el servidor dice por qué no (`blockReason`).
 */
export type SsnPhase = 'verified' | 'ready' | 'retry' | 'blocked'

export type SsnView = {
	phase: SsnPhase
	attemptsLeft: number
	verifiedAt: string | null
	blockReason: SsnBlockReason | null
	/** Prosa del servidor (español) — fallback cuando no hay traducción del código. */
	message: string | null
}

/** Qué hace el botón del estado bloqueado. `field` resalta un campo de la ficha. */
export type SsnBlockAction =
	| { kind: 'gold' }
	| { kind: 'kyc' }
	| { kind: 'field', field: 'usPerson' | 'ssn' | 'address' }
	| { kind: 'support' }
	| { kind: 'none' }

export function deriveSsnView(ssn: SsnVerification | null | undefined): SsnView {
	const base = {
		attemptsLeft: Math.max(0, Number(ssn?.attempts_left ?? 0)),
		verifiedAt: ssn?.verified_at ?? null,
		blockReason: null as SsnBlockReason | null,
		message: null as string | null,
	}
	if (!ssn) { return { ...base, phase: 'blocked', blockReason: 'UNAVAILABLE' } }
	if (ssn.status === 'verified') { return { ...base, phase: 'verified' } }
	if (ssn.can_start) { return { ...base, phase: ssn.status === 'no_match' || ssn.status === 'partial' ? 'retry' : 'ready' } }
	return { ...base, phase: 'blocked', blockReason: ssn.block_reason ?? 'UNAVAILABLE', message: ssn.message ?? null }
}

export function blockActionFor(reason: SsnBlockReason | null | undefined): SsnBlockAction {
	switch (reason) {
		case 'GOLD_REQUIRED': return { kind: 'gold' }
		case 'KYC_REQUIRED':
		case 'DOCUMENT_REQUIRED': return { kind: 'kyc' }
		case 'NOT_US_PERSON': return { kind: 'field', field: 'usPerson' }
		case 'SSN_MISSING': return { kind: 'field', field: 'ssn' }
		case 'ADDRESS_REQUIRED': return { kind: 'field', field: 'address' }
		case 'ATTEMPTS_EXHAUSTED': return { kind: 'support' }
		default: return { kind: 'none' }
	}
}

/** Fallo de la verificación, ya clasificado para la pantalla. */
export type SsnVerifyFailure = {
	kind: 'no_match' | 'rate_limited' | 'unavailable' | 'blocked' | 'unknown'
	/** Intentos que quedan según el servidor (viene en 409 y en los 403), o null. */
	attemptsLeft: number | null
	blockReason: SsnBlockReason | null
}

const BLOCK_REASONS: ReadonlySet<string> = new Set<SsnBlockReason>([
	'GOLD_REQUIRED', 'KYC_REQUIRED', 'NOT_US_PERSON', 'SSN_MISSING', 'DOCUMENT_REQUIRED',
	'ADDRESS_REQUIRED', 'ATTEMPTS_EXHAUSTED', 'SDN_BLOCKED', 'STAFF_ACCOUNT', 'UNAVAILABLE',
])

/**
 * Clasifica el error de `verifySsn` por `code` del body y, sin código, por HTTP.
 *
 * @param status - HTTP de la respuesta (undefined = red/500).
 * @param details - Body crudo del error (`{ error, code, attempts_left? }`).
 */
export function classifySsnVerifyError(status: number | undefined, details: unknown): SsnVerifyFailure {
	const body = (details ?? {}) as { code?: unknown, attempts_left?: unknown }
	const code = typeof body.code === 'string' ? body.code : null
	const attemptsLeft = typeof body.attempts_left === 'number' ? Math.max(0, body.attempts_left) : null
	const failure = (kind: SsnVerifyFailure['kind'], blockReason: SsnBlockReason | null = null): SsnVerifyFailure => ({ kind, attemptsLeft, blockReason })

	if (code === 'SSN_NO_MATCH' || code === 'SSN_PARTIAL_MATCH') { return failure('no_match') }
	if (code === 'RATE_LIMITED') { return failure('rate_limited') }
	if (code === 'SSN_VERIFY_UNAVAILABLE') { return failure('unavailable') }
	if (code && BLOCK_REASONS.has(code)) { return failure('blocked', code as SsnBlockReason) }
	if (status === 409) { return failure('no_match') }
	if (status === 429) { return failure('rate_limited') }
	if (status === 503) { return failure('unavailable') }
	if (status === 403) { return failure('blocked') }
	return failure('unknown')
}

/** La ficha tras un 200 de verify-ssn, para `setQueryData` sin esperar al refetch. */
export function applyVerified(cip: UserCip, result: SsnVerifyResult | null | undefined): UserCip {
	return {
		...cip,
		ssn_verification: {
			...cip.ssn_verification,
			status: 'verified',
			verified_at: result?.verified_at ?? new Date().toISOString(),
			attempts_left: typeof result?.attempts_left === 'number' ? result.attempts_left : cip.ssn_verification.attempts_left,
			can_start: false,
			block_reason: null,
			message: null,
		},
	}
}
