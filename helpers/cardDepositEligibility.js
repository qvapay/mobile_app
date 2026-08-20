/**
 * Elegibilidad para depositar balance con tarjeta (moneda CARD, Stripe).
 *
 * Espejo CLIENTE de `isCardDepositEligible` del backend
 * (~/webs/qpweb/scripts/store/card-eligibility.js): KYC aprobado + Telegram
 * verificado + teléfono verificado + cuenta con >= 30 días + (VIP o
 * trustscore > 90). El backend añade además el gate de geolocalización
 * (cf-ipcountry != CU), que el cliente no puede conocer — por eso esto solo
 * decide si se PINTA la opción; el gate real e infalsificable vive en
 * `POST /api/topup` (rechaza con 400 y mensaje genérico).
 *
 * Lógica pura sin imports nativos: testeable en `@jest-environment node`.
 */

export const CARD_MIN_ACCOUNT_DAYS = 30

const DAY_MS = 86_400_000

/**
 * Decide si el usuario puede ver la opción de depósito con tarjeta.
 *
 * @param {Object} user - Usuario de AuthContext (perfil de `/user/extended`).
 * @returns {boolean} true si cumple el criterio conocido por el cliente.
 */
export function isCardDepositEligible(user) {
	if (!user) { return false }

	if (!user.kyc) { return false }                 // KYC aprobado
	if (user.telegram_id == null) { return false }  // Telegram verificado
	if (!user.phone_verified) { return false }      // teléfono verificado

	const created = user.created_at ? new Date(user.created_at) : null
	if (!created || isNaN(created.getTime())) { return false }
	if ((Date.now() - created.getTime()) / DAY_MS < CARD_MIN_ACCOUNT_DAYS) { return false }

	return !!user.vip || Number(user.trustscore ?? 0) > 90
}

/**
 * Quita la moneda CARD de un catálogo agrupado de useCoins cuando el usuario
 * no es elegible (grupos `{ name, coins: [...] }`); grupos vacíos se eliminan.
 *
 * @param {Array} catalog - Catálogo agrupado de useCoins.
 * @param {boolean} eligible - Resultado de isCardDepositEligible.
 * @returns {Array} Catálogo filtrado (misma referencia si no hay cambios).
 */
export function filterCardFromCatalog(catalog, eligible) {
	if (eligible || !Array.isArray(catalog)) { return catalog }
	let changed = false
	const filtered = catalog
		.map(group => {
			if (!group?.coins?.some(c => c.tick === 'CARD')) { return group }
			changed = true
			return { ...group, coins: group.coins.filter(c => c.tick !== 'CARD') }
		})
		.filter(group => !group?.coins || group.coins.length > 0)
	return changed ? filtered : catalog
}
