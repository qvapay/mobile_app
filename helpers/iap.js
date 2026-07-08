// Gold Check subscription helpers for react-native-iap (StoreKit / Play Billing).
// Store setup differs per platform: iOS uses two separate App Store products,
// Android a single Play subscription ('gold_check') with two base plans.
import { Platform } from 'react-native'

// Product IDs per platform
const IAP_SKUS_IOS = [
	'com.qvapay.goldcheck.monthly',
	'com.qvapay.goldcheck.yearly',
]

const IAP_SKUS_ANDROID = ['gold_check']

/**
 * Subscription SKUs to fetch from the store on the current platform.
 * @type {string[]}
 */
export const IAP_SKUS = Platform.select({
	ios: IAP_SKUS_IOS,
	android: IAP_SKUS_ANDROID,
})

/**
 * Maps a Gold Check plan name to the store product ID.
 * On Android both plans live under the single 'gold_check' subscription — the
 * plan is selected via its base-plan offer token instead (see getAndroidOfferToken).
 * @param {'monthly'|'yearly'} plan
 * @returns {string} Store product ID for the current platform.
 */
export const getProductId = (plan) => {
	if (Platform.OS === 'ios') { return plan === 'yearly' ? 'com.qvapay.goldcheck.yearly' : 'com.qvapay.goldcheck.monthly' }
	return 'gold_check'
}

/**
 * Extracts the offerToken of the matching base plan ('gold-check-monthly' /
 * 'gold-check-yearly') from the fetched Play subscription details. Play
 * Billing requires this token when purchasing an Android subscription.
 * @param {'monthly'|'yearly'} plan
 * @param {Array<object>} subscriptions - Result of react-native-iap's getSubscriptions().
 * @returns {string|undefined} The offerToken, or undefined on iOS / when the offer is missing.
 */
export const getAndroidOfferToken = (plan, subscriptions) => {
	if (Platform.OS !== 'android' || !subscriptions?.length) return undefined
	const sub = subscriptions.find((s) => s.productId === 'gold_check')
	if (!sub?.subscriptionOfferDetails?.length) return undefined
	const basePlanId = plan === 'yearly' ? 'gold-check-yearly' : 'gold-check-monthly'
	const offer = sub.subscriptionOfferDetails.find((o) => o.basePlanId === basePlanId)
	return offer?.offerToken
}

/**
 * Maps a react-native-iap error to a Spanish user-facing message.
 * @param {object|null} error - IAP error carrying `code` (or `responseCode`).
 * @returns {string|null} Message to toast, or null for E_USER_CANCELLED (silenced on purpose).
 */
export const getIAPErrorMessage = (error) => {
	if (!error) return 'Error desconocido'
	const code = error.code || error.responseCode
	const messages = {
		E_USER_CANCELLED: null, // silenciar cancelacion del usuario
		E_ITEM_UNAVAILABLE: 'Este producto no está disponible en tu región',
		E_NETWORK_ERROR: 'Error de conexión. Verifica tu internet',
		E_SERVICE_ERROR: 'El servicio de pagos no está disponible',
		E_DEVELOPER_ERROR: 'Error de configuración. Contacta soporte',
		E_ALREADY_OWNED: 'Ya tienes una suscripción activa',
		E_DEFERRED_PAYMENT: 'El pago está pendiente de aprobación',
	}
	return messages[code] ?? error.message ?? 'Error al procesar la compra'
}
