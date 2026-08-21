import { initStripe, initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native'

/**
 * Depósito con tarjeta (moneda CARD): monta y presenta el PaymentSheet nativo
 * de Stripe sobre el PaymentIntent que devolvió `POST /topup` (la respuesta
 * trae `client_secret` + `publishable_key` — cuenta de Stripe SEPARADA de la
 * de GOLD/tienda). El 3DS lo resuelve la propia hoja; el crédito real del
 * balance lo hace el webhook del backend y la pantalla lo ve llegar por SSE
 * (`useTransactionSSE`), igual que cualquier otro depósito.
 */

// La publishable key llega del servidor y no cambia entre órdenes: no
// reinicializar el SDK nativo en cada depósito.
let initializedKey = null

/**
 * Presenta el PaymentSheet para una orden de depósito CARD.
 *
 * @param {Object} params
 * @param {Object} params.topupData - Data de `POST /topup` (client_secret, publishable_key, value).
 * @param {Object} params.theme - Theme activo (colores del sheet).
 * @param {Object} params.user - Usuario autenticado (email de recibo).
 * @returns {Promise<{status: 'paid'|'canceled'|'failed', message?: string}>}
 */
export async function presentCardDeposit({ topupData, theme, user }) {

	const { client_secret, publishable_key } = topupData || {}
	if (!client_secret || !publishable_key) { return { status: 'failed', message: 'No se pudo iniciar el pago con tarjeta. Genera un nuevo depósito.' } }

	try {
		if (initializedKey !== publishable_key) {
			await initStripe({
				publishableKey: publishable_key,
				// Retorno de redirecciones 3DS fuera de la app (esquema ya registrado
				// para deep links); las tarjetas normales resuelven dentro de la hoja
				urlScheme: 'qvapay',
			})
			initializedKey = publishable_key
		}

		const isDark = theme.mode !== 'light'
		const { error: initError } = await initPaymentSheet({
			paymentIntentClientSecret: client_secret,
			merchantDisplayName: 'QvaPay',
			defaultBillingDetails: { email: user?.email || undefined },
			returnURL: 'qvapay://stripe-redirect',
			style: isDark ? 'alwaysDark' : 'alwaysLight',
			appearance: {
				colors: {
					primary: theme.colors.primary,
					background: theme.colors.background,
					componentBackground: theme.colors.surface,
					componentText: theme.colors.primaryText,
					primaryText: theme.colors.primaryText,
					secondaryText: theme.colors.secondaryText,
					placeholderText: theme.colors.tertiaryText,
					icon: theme.colors.secondaryText,
				},
				shapes: { borderRadius: 12 },
			},
		})
		if (initError) { return { status: 'failed', message: initError.localizedMessage || initError.message } }

		const { error } = await presentPaymentSheet()
		if (error) {
			if (error.code === 'Canceled') { return { status: 'canceled' } }
			return { status: 'failed', message: error.localizedMessage || error.message || 'No se pudo procesar el pago con tu tarjeta.' }
		}

		// La hoja confirmó el PaymentIntent; el balance se acredita cuando el
		// webhook procese el evento — la UI queda en "procesando" hasta el SSE
		return { status: 'paid' }
		
	} catch {
		return { status: 'failed', message: 'No se pudo procesar el pago con tu tarjeta.' }
	}
}
