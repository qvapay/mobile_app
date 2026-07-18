// IAP helpers for react-native-iap (StoreKit / Play Billing): Gold Check
// subscriptions + mobile top-ups sold as consumable one-time products.
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

// SKUs de recargas móviles — one-time products consumibles. Cada monto es un
// producto distinto en la tienda; al crear uno nuevo en Play Console / App Store
// Connect solo hay que añadir su SKU aquí y su entrada al catálogo de abajo.
const TOPUP_SKUS_IOS = [
	'com.qvapay.topup.100cup',
	'com.qvapay.topup.250cup',
	'com.qvapay.topup.500cup',
	'com.qvapay.topup.1000cup',
	'com.qvapay.topup.2000cup',
]

const TOPUP_SKUS_ANDROID = [
	'100cuptopup',
	'250cuptopup',
	'500cuptopup',
	'1000cuptopup',
	'2000cuptopup',
]

/**
 * Consumable top-up SKUs to fetch from the store on the current platform.
 * @type {string[]}
 */
export const TOPUP_SKUS = Platform.select({
	ios: TOPUP_SKUS_IOS,
	android: TOPUP_SKUS_ANDROID,
})

// Catálogo de recargas: mapea el SKU de la tienda al monto CUP que entrega.
const TOPUP_CATALOG_IOS = {
	'com.qvapay.topup.100cup':  { amountCUP: 100,  label: '$100 CUP' },
	'com.qvapay.topup.250cup':  { amountCUP: 250,  label: '$250 CUP' },
	'com.qvapay.topup.500cup':  { amountCUP: 500,  label: '$500 CUP' },
	'com.qvapay.topup.1000cup': { amountCUP: 1000, label: '$1000 CUP' },
	'com.qvapay.topup.2000cup': { amountCUP: 2000, label: '$2000 CUP' },
}

const TOPUP_CATALOG_ANDROID = {
	'100cuptopup':  { amountCUP: 100,  label: '$100 CUP' },
	'250cuptopup':  { amountCUP: 250,  label: '$250 CUP' },
	'500cuptopup':  { amountCUP: 500,  label: '$500 CUP' },
	'1000cuptopup': { amountCUP: 1000, label: '$1000 CUP' },
	'2000cuptopup': { amountCUP: 2000, label: '$2000 CUP' },
}

/**
 * Top-up catalog for the current platform, keyed by store SKU.
 * @type {Object<string, {amountCUP: number, label: string}>}
 */
export const TOPUP_CATALOG = Platform.select({
	ios: TOPUP_CATALOG_IOS,
	android: TOPUP_CATALOG_ANDROID,
})

/**
 * Looks up the CUP amount/label a top-up SKU delivers.
 * @param {string} sku - Store product ID on the current platform.
 * @returns {{amountCUP: number, label: string}|null} Catalog entry, or null for unknown SKUs.
 */
export const getTopupInfo = (sku) => TOPUP_CATALOG?.[sku] ?? null

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
		E_ALREADY_OWNED: 'Ya tienes una compra activa de este producto',
		E_DEFERRED_PAYMENT: 'El pago está pendiente de aprobación',
	}
	// `in` en vez de `??`: el null de E_USER_CANCELLED es un valor válido (silencio),
	// no una entrada ausente
	if (code in messages) return messages[code]
	return error.message ?? 'Error al procesar la compra'
}
