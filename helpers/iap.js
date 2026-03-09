import { Platform } from 'react-native'

// Product IDs por plataforma
const IAP_SKUS_IOS = [
	'com.qvapay.goldcheck.monthly',
	'com.qvapay.goldcheck.yearly',
]

const IAP_SKUS_ANDROID = ['gold_check']

export const IAP_SKUS = Platform.select({
	ios: IAP_SKUS_IOS,
	android: IAP_SKUS_ANDROID,
})

// Mapea plan name al product ID correcto
export const getProductId = (plan) => {
	if (Platform.OS === 'ios') { return plan === 'yearly' ? 'com.qvapay.goldcheck.yearly' : 'com.qvapay.goldcheck.monthly' }
	return 'gold_check'
}

// Extrae el offerToken del basePlan correcto (requerido por Android)
export const getAndroidOfferToken = (plan, subscriptions) => {
	if (Platform.OS !== 'android' || !subscriptions?.length) return undefined
	const sub = subscriptions.find((s) => s.productId === 'gold_check')
	if (!sub?.subscriptionOfferDetails?.length) return undefined
	const basePlanId = plan === 'yearly' ? 'gold-check-yearly' : 'gold-check-monthly'
	const offer = sub.subscriptionOfferDetails.find((o) => o.basePlanId === basePlanId)
	return offer?.offerToken
}

// Mapea errores de react-native-iap a mensajes en español
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
