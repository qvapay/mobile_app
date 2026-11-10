/**
 * Reglas PURAS de la verificación del CPF. Espejo de qpweb
 * `scripts/compliance/cpf-verification-rules.js` (`normalizeCpf`, `formatCpf`, `maskCpf`,
 * `isValidCpf`). Los dígitos verificadores se comprueban aquí para no gastar un intento en una
 * errata; quien decide si puede empezar es el servidor (`can_start`, `block_reason`).
 */

import type { CpfVerifyResult } from '../../../api/userApi'
import type { CpfBlockReason, CpfVerification, UserCip } from '../../../types/domain'

export const CPF_MASK_LENGTH = 14

export const normalizeCpf = (value: string | null | undefined): string => String(value ?? '').replace(/\D/g, '')

/** `000.000.000-00` mientras se teclea. */
export const formatCpf = (value: string | null | undefined): string => normalizeCpf(value)
	.slice(0, 11)
	.replace(/(\d{3})(\d)/, '$1.$2')
	.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
	.replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')

/** CPF verificado tal como se enseña: solo salen del servidor los dos últimos dígitos. */
export const maskCpf = (last2: string | null | undefined): string => `***.***.***-${String(last2 || '').padStart(2, '*')}`

// Dígito verificador (módulo 11)
const checkDigit = (digits: string, length: number): number => {
	let sum = 0
	for (let i = 0; i < length; i++) { sum += Number(digits[i]) * (length + 1 - i) }
	const rest = sum % 11
	return rest < 2 ? 0 : 11 - rest
}

export const isValidCpf = (value: string | null | undefined): boolean => {
	const digits = normalizeCpf(value)
	if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) { return false }
	return checkDigit(digits, 9) === Number(digits[9]) && checkDigit(digits, 10) === Number(digits[10])
}

/**
 * - `verified`: ya está hecho.
 * - `ready`: puede empezar; `retry`: puede empezar pero el último intento no casó.
 * - `blocked`: el servidor dice por qué no (`blockReason`).
 */
export type CpfPhase = 'verified' | 'ready' | 'retry' | 'blocked'

export type CpfView = {
	phase: CpfPhase
	attemptsLeft: number
	last2: string | null
	blockReason: CpfBlockReason | null
	/** Prosa del servidor (español): respaldo cuando no hay traducción del código. */
	message: string | null
}

/** Sin `cpf_verification` (qpweb sin desplegar) se trata como no disponible. */
export function deriveCpfView(cpf: CpfVerification | null | undefined): CpfView {
	const base = { attemptsLeft: Math.max(0, Number(cpf?.attempts_left ?? 0)), last2: cpf?.cpf_last2 ?? null, blockReason: null, message: null }
	if (!cpf) { return { ...base, phase: 'blocked', blockReason: 'UNAVAILABLE' } }
	if (cpf.status === 'verified') { return { ...base, phase: 'verified' } }
	if (cpf.can_start) { return { ...base, phase: cpf.status === 'none' ? 'ready' : 'retry' } }
	return { ...base, phase: 'blocked', blockReason: cpf.block_reason ?? 'UNAVAILABLE', message: cpf.message ?? null }
}

/** Salida del estado bloqueado: hacerse GOLD, rehacer el KYC, escribir a soporte o nada. */
export type CpfBlockAction = 'gold' | 'kyc' | 'support' | 'none'

export function cpfBlockAction(reason: CpfBlockReason | null | undefined): CpfBlockAction {
	if (reason === 'GOLD_REQUIRED') { return 'gold' }
	if (reason === 'KYC_REQUIRED' || reason === 'DOCUMENT_REQUIRED') { return 'kyc' }
	return reason === 'ATTEMPTS_EXHAUSTED' ? 'support' : 'none'
}

/** Fallo de la verificación, ya clasificado para la pantalla. */
export type CpfVerifyFailure = {
	/** `invalid`, `in_use`, `rate_limited` y `unavailable` no consumen intento. */
	kind: 'invalid' | 'no_match' | 'partial' | 'in_use' | 'rate_limited' | 'unavailable' | 'blocked' | 'unknown'
	/** Intentos que quedan según el servidor, o null si no los manda. */
	attemptsLeft: number | null
	blockReason: CpfBlockReason | null
}

const BLOCK_REASONS: ReadonlySet<string> = new Set<CpfBlockReason>([
	'GOLD_REQUIRED', 'KYC_REQUIRED', 'DOCUMENT_REQUIRED', 'MINOR', 'UNAVAILABLE', 'GEO_BR_REQUIRED', 'ATTEMPTS_EXHAUSTED', 'SDN_BLOCKED', 'STAFF_ACCOUNT',
])

/**
 * Clasifica el error de `verifyCpf` por `code` del body y, sin código, por HTTP.
 *
 * @param status - HTTP de la respuesta (undefined = red o 500).
 * @param details - Body crudo del error (`{ error, code, attempts_left? }`).
 */
export function classifyCpfVerifyError(status: number | undefined, details: unknown): CpfVerifyFailure {
	const body = (details ?? {}) as { code?: unknown, attempts_left?: unknown }
	const code = typeof body.code === 'string' ? body.code : null
	const attemptsLeft = typeof body.attempts_left === 'number' ? Math.max(0, body.attempts_left) : null
	const failure = (kind: CpfVerifyFailure['kind'], blockReason: CpfBlockReason | null = null): CpfVerifyFailure => ({ kind, attemptsLeft, blockReason })

	if (code === 'CPF_INVALID') { return failure('invalid') }
	if (code === 'CPF_NO_MATCH') { return failure('no_match') }
	if (code === 'CPF_PARTIAL_MATCH') { return failure('partial') }
	if (code === 'CPF_IN_USE') { return failure('in_use') }
	if (code === 'RATE_LIMITED') { return failure('rate_limited') }
	if (code === 'CPF_VERIFY_UNAVAILABLE') { return failure('unavailable') }
	if (code && BLOCK_REASONS.has(code)) { return failure('blocked', code as CpfBlockReason) }
	if (status === 429) { return failure('rate_limited') }
	if (status === 503) { return failure('unavailable') }
	if (status === 403) { return failure('blocked') }
	return failure('unknown')
}

/** La ficha tras un 200 de verify-cpf, para `setQueryData` sin esperar al refetch. */
export function applyCpfVerified(cip: UserCip, result: CpfVerifyResult | null | undefined): UserCip {
	return {
		...cip,
		cpf_verification: {
			status: 'verified',
			verified_at: result?.verified_at ?? null,
			cpf_last2: result?.cpf_last2 ?? null,
			attempts_left: result?.attempts_left ?? cip.cpf_verification?.attempts_left ?? 0,
			attempts_max: cip.cpf_verification?.attempts_max ?? 0,
			can_start: false,
			block_reason: null,
			message: null,
		},
	}
}
