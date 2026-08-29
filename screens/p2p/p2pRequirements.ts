/**
 * Requisitos de acceso al P2P, en un módulo puro (sin imports de react-native)
 * para poder testearlo bajo `@jest-environment node`.
 *
 * El backend comprueba los mismos cuatro antes de servir `/p2p/index` y
 * `/p2p/create`, y responde 400 con la razón en prosa — no hay código máquina,
 * así que el mapeo mensaje → requisito vive aquí.
 */

import type { User } from '../../types/domain'

/** Los cuatro requisitos que gatean el P2P (el orden es el de la pantalla). */
export type P2PRequirementKey = 'p2p_enabled' | 'kyc' | 'phone' | 'telegram'

/** Requisitos que el perfil local NO cumple. Vacío = se puede pedir el mercado. */
export const missingP2PRequirements = (user: User | null | undefined): P2PRequirementKey[] => {
	const missing: P2PRequirementKey[] = []
	if (!user?.p2p_enabled) { missing.push('p2p_enabled') }
	if (!user?.kyc) { missing.push('kyc') }
	if (!user?.phone_verified) { missing.push('phone') }
	if (!user?.telegram_id) { missing.push('telegram') }
	return missing
}

// Las frases exactas del backend (index + create). Se exige además que el
// mensaje mencione P2P: los cuatro lo hacen, y así un 400 de validación de
// filtros (page/orderBy/best_rate) no se confunde con un requisito.
const ERROR_PATTERNS: [P2PRequirementKey, RegExp][] = [
	['kyc', /kyc/i],
	['telegram', /telegram/i],
	['phone', /tel[ée]fono|phone/i],
	['p2p_enabled', /habilitado|not enabled/i],
]

/**
 * Traduce el 400 del backend al requisito que falta.
 *
 * Red de seguridad para el perfil local desfasado (caché vieja, verificación
 * hecha en otro dispositivo): si el servidor dice que falta el KYC, la pantalla
 * lo pinta aunque `user.kyc` diga lo contrario.
 *
 * @param error - Prosa de error del backend.
 * @param status - Código HTTP de la respuesta.
 * @returns El requisito señalado, o null si el 400 es por otra cosa.
 */
export const requirementFromApiError = (error?: string | null, status?: number): P2PRequirementKey | null => {
	if (status !== 400 || !error || !/p2p/i.test(error)) { return null }
	for (const [key, pattern] of ERROR_PATTERNS) {
		if (pattern.test(error)) { return key }
	}
	return null
}
