// IAP helpers for react-native-iap (StoreKit / Play Billing): Gold Check
// subscriptions + mobile top-ups sold as consumable one-time products.
// Store setup differs per platform: iOS uses two separate App Store products,
// Android a single Play subscription ('gold_check') with two base plans.
import { Platform } from 'react-native'
import type { ProductSubscription, PurchaseError } from 'react-native-iap'
import i18n from '../i18n'

/** Plan de Gold Check tal como lo maneja la UI. */
export type GoldPlan = 'monthly' | 'yearly'

// Product IDs per platform
const IAP_SKUS_IOS = [
	'com.qvapay.goldcheck.monthly',
	'com.qvapay.goldcheck.yearly',
]

const IAP_SKUS_ANDROID = ['gold_check']

/**
 * Subscription SKUs to fetch from the store on the current platform
 * (undefined only on platforms without a store build).
 */
export const IAP_SKUS: string[] | undefined = Platform.select({
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
 * Consumable top-up SKUs to fetch from the store on the current platform
 * (undefined only on platforms without a store build).
 */
export const TOPUP_SKUS: string[] | undefined = Platform.select({
	ios: TOPUP_SKUS_IOS,
	android: TOPUP_SKUS_ANDROID,
})

/** Entrada del catálogo de recargas: monto CUP entregado + label del picker. */
export type TopupInfo = { amountCUP: number, label: string }

// Catálogo de recargas: mapea el SKU de la tienda al monto CUP que entrega.
const TOPUP_CATALOG_IOS: Record<string, TopupInfo> = {
	'com.qvapay.topup.100cup':  { amountCUP: 100,  label: '$100 CUP' },
	'com.qvapay.topup.250cup':  { amountCUP: 250,  label: '$250 CUP' },
	'com.qvapay.topup.500cup':  { amountCUP: 500,  label: '$500 CUP' },
	'com.qvapay.topup.1000cup': { amountCUP: 1000, label: '$1000 CUP' },
	'com.qvapay.topup.2000cup': { amountCUP: 2000, label: '$2000 CUP' },
}

const TOPUP_CATALOG_ANDROID: Record<string, TopupInfo> = {
	'100cuptopup':  { amountCUP: 100,  label: '$100 CUP' },
	'250cuptopup':  { amountCUP: 250,  label: '$250 CUP' },
	'500cuptopup':  { amountCUP: 500,  label: '$500 CUP' },
	'1000cuptopup': { amountCUP: 1000, label: '$1000 CUP' },
	'2000cuptopup': { amountCUP: 2000, label: '$2000 CUP' },
}

/**
 * Top-up catalog for the current platform, keyed by store SKU.
 */
export const TOPUP_CATALOG: Record<string, TopupInfo> | undefined = Platform.select({
	ios: TOPUP_CATALOG_IOS,
	android: TOPUP_CATALOG_ANDROID,
})

/**
 * Looks up the CUP amount/label a top-up SKU delivers.
 * @param sku - Store product ID on the current platform.
 * @returns Catalog entry, or null for unknown SKUs.
 */
export const getTopupInfo = (sku: string): TopupInfo | null => TOPUP_CATALOG?.[sku] ?? null

/**
 * Maps a Gold Check plan name to the store product ID.
 * On Android both plans live under the single 'gold_check' subscription — the
 * plan is selected via its base-plan offer token instead (see getAndroidOfferToken).
 * @param plan - 'monthly' or 'yearly'.
 * @returns Store product ID for the current platform.
 */
export const getProductId = (plan: GoldPlan): string => {
	if (Platform.OS === 'ios') { return plan === 'yearly' ? 'com.qvapay.goldcheck.yearly' : 'com.qvapay.goldcheck.monthly' }
	return 'gold_check'
}

// Cast local documentado: los .d.ts de react-native-iap >= 14 tipan el shape
// OpenIAP (`id`, `subscriptionOfferDetailsAndroid`), pero en runtime Android
// las suscripciones siguen llegando con el shape legacy que este código lee
// (`productId`, `subscriptionOfferDetails`). Se mantiene el runtime verbatim.
type LegacyAndroidSubscription = {
	productId?: string
	subscriptionOfferDetails?: { basePlanId?: string, offerToken?: string }[] | null
}

/**
 * Extracts the offerToken of the matching base plan ('gold-check-monthly' /
 * 'gold-check-yearly') from the fetched Play subscription details. Play
 * Billing requires this token when purchasing an Android subscription.
 * @param plan - 'monthly' or 'yearly'.
 * @param subscriptions - Result of react-native-iap's getSubscriptions().
 * @returns The offerToken, or undefined on iOS / when the offer is missing.
 */
export const getAndroidOfferToken = (plan: GoldPlan, subscriptions: ProductSubscription[] | null | undefined): string | undefined => {
	if (Platform.OS !== 'android' || !subscriptions?.length) return undefined
	const sub = (subscriptions as LegacyAndroidSubscription[]).find((s) => s.productId === 'gold_check')
	if (!sub?.subscriptionOfferDetails?.length) return undefined
	const basePlanId = plan === 'yearly' ? 'gold-check-yearly' : 'gold-check-monthly'
	const offer = sub.subscriptionOfferDetails.find((o) => o.basePlanId === basePlanId)
	return offer?.offerToken
}

/**
 * Error de IAP tal como lo leen estos helpers: el PurchaseError de la lib u
 * objetos legacy/planos con `code`/`responseCode` (los tests los simulan así).
 */
export type IapErrorLike = {
	code?: string | null
	responseCode?: string | number | null
	message?: string | null
} | PurchaseError | null | undefined

/**
 * Detects Play Billing's "you already own this item" — for consumables it means
 * a previous purchase was never consumed and is blocking the SKU.
 * @param error - IAP error carrying `code` (or `responseCode`).
 */
export const isAlreadyOwnedError = (error: IapErrorLike): boolean => {
	const code = error?.code || error?.responseCode
	return code === 'already-owned' || code === 'E_ALREADY_OWNED'
}

/**
 * Maps a react-native-iap error to a localized user-facing message.
 * @param error - IAP error carrying `code` (or `responseCode`).
 * @returns Message to toast, or null for E_USER_CANCELLED (silenced on purpose).
 */
export const getIAPErrorMessage = (error: IapErrorLike): string | null => {
	if (!error) return i18n.t('hooks.iap.unknownError')
	const code = error.code || error.responseCode
	const messages: Record<string, string | null> = {
		// Códigos OpenIAP de react-native-iap >= 14 (kebab-case)
		'user-cancelled': null, // silenciar cancelacion del usuario
		'item-unavailable': i18n.t('hooks.iap.itemUnavailable'),
		'sku-not-found': i18n.t('hooks.iap.itemUnavailable'),
		'network-error': i18n.t('hooks.iap.connectionError'),
		'service-error': i18n.t('hooks.iap.serviceUnavailable'),
		'billing-unavailable': i18n.t('hooks.iap.serviceUnavailable'),
		'developer-error': i18n.t('hooks.iap.configurationError'),
		'already-owned': i18n.t('hooks.iap.alreadyOwned'),
		'deferred-payment': i18n.t('hooks.iap.paymentPending'),
		// Códigos E_* de versiones anteriores de la lib
		E_USER_CANCELLED: null,
		E_ITEM_UNAVAILABLE: i18n.t('hooks.iap.itemUnavailable'),
		E_NETWORK_ERROR: i18n.t('hooks.iap.connectionError'),
		E_SERVICE_ERROR: i18n.t('hooks.iap.serviceUnavailable'),
		E_DEVELOPER_ERROR: i18n.t('hooks.iap.configurationError'),
		E_ALREADY_OWNED: i18n.t('hooks.iap.alreadyOwned'),
		E_DEFERRED_PAYMENT: i18n.t('hooks.iap.paymentPending'),
	}
	// `in` en vez de `??`: el null de E_USER_CANCELLED es un valor válido (silencio),
	// no una entrada ausente
	if ((code as string) in messages) return messages[code as string]
	return error.message ?? i18n.t('hooks.iap.purchaseFailed')
}
