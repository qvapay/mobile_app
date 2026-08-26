import { initStripe, initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native'
import i18n from '../../i18n'

import type { Theme } from '../../theme/ThemeContext'
import type { User } from '../../types/domain'

/** Campos de la orden `POST /topup` que necesita la hoja de pago. */
export type CardTopupData = {
	client_secret?: string
	publishable_key?: string
} | null | undefined

export type CardDepositParams = {
	topupData: CardTopupData
	theme: Theme
	user: User | null | undefined
}

/** Resultado de presentar el PaymentSheet. */
export type CardDepositResult = {
	status: 'paid' | 'canceled' | 'failed'
	message?: string
}

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
let initializedKey: string | null = null

/**
 * Presenta el PaymentSheet para una orden de depósito CARD.
 *
 * @param params.topupData - Data de `POST /topup` (client_secret, publishable_key, value).
 * @param params.theme - Theme activo (colores del sheet).
 * @param params.user - Usuario autenticado (email de recibo).
 */
export async function presentCardDeposit({ topupData, theme, user }: CardDepositParams): Promise<CardDepositResult> {

	const { client_secret, publishable_key } = topupData || {}
	if (!client_secret || !publishable_key) { return { status: 'failed', message: i18n.t('add.cardSheet.initFailed') } }

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

		// OJO (pre-existente, NO tocado): el theme expone `isDark`, no `mode`, así
		// que `mode` es siempre undefined y esta hoja se pinta SIEMPRE en oscuro,
		// incluso en tema claro. Se conserva tal cual con un cast local.
		const isDark = (theme as Theme & { mode?: 'light' | 'dark' }).mode !== 'light'
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
			return { status: 'failed', message: error.localizedMessage || error.message || i18n.t('add.cardSheet.processFailed') }
		}

		// La hoja confirmó el PaymentIntent; el balance se acredita cuando el
		// webhook procese el evento — la UI queda en "procesando" hasta el SSE
		return { status: 'paid' }
		
	} catch {
		return { status: 'failed', message: i18n.t('add.cardSheet.processFailed') }
	}
}
