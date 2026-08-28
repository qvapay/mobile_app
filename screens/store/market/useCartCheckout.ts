/**
 * Pago del carrito del marketplace: una orden POR LÍNEA, secuencial, con clave
 * de idempotencia por línea reutilizada en cada reintento.
 *
 * Se extrajo de `MarketCart.tsx` (cuerpo de ~410 líneas) para que la pantalla
 * se quede con el render y el carrito, y el checkout viva solo.
 *
 * Invariantes preservadas: la secuencialidad es A PROPÓSITO (cada orden abre
 * una transacción Serializable que puede escribir la fila de fees del usuario;
 * en paralelo se pisan), un 429 se reintenta con espera de 5s hasta 4 intentos,
 * y un error de saldo insuficiente ABORTA las líneas restantes (fallarían igual).
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Toast
import { toast } from 'sonner-native'

// Contexts
import { useAuth } from '../../../auth/AuthContext'

// Routes & API
import { ROUTES } from '../../../routes'
import { marketApi } from '../../../api/marketApi'
import { shopApi } from '../../../api/shopApi'
import { userApi } from '../../../api/userApi'

// UI helpers
import { buildAddressBody } from '../../../ui/store/NewAddressForm'

// Cart core
import { mapOrderError, isAbortingOrderError, makeIdemKey } from './marketCheckout'

import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { ShippingAddress } from '../../../ui/store/AddressPicker'
import type { UsAddressForm } from '../../../ui/store/NewAddressForm'
import type { CartEntry, CartLineStatus } from './marketCheckout'
import type { MarketOrderInput } from '../../../api/marketApi'
import type { ApiFailure, ApiSuccess } from '../../../types/api'

// `setTimeout` está tipado como `() => void`; el `resolve` de la promesa recibe
// un valor. Cast de tipos, el temporizador se arma igual.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve as () => void, ms))

/** Lo que el checkout necesita de la pantalla. */
type CartCheckoutArgs = {
	/** Líneas pagables (sin problema y no cobradas ya). */
	payable: CartEntry[]
	/** Hay artículos físicos: exigen dirección de envío en EE. UU. */
	anyPhysical: boolean
	useNewAddress: boolean
	selectedUuid: string | null
	form: UsAddressForm
	navigation: NativeStackNavigationProp<RootStackParamList, 'MarketCart'>
	/**
	 * Estado por línea, propiedad de la PANTALLA: `enrichCartItems` lo lee para
	 * derivar `payable`, así que si viviera aquí la dependencia sería circular.
	 */
	setStatuses: React.Dispatch<React.SetStateAction<Record<string, CartLineStatus>>>
	/** Saca la línea del carrito local tras cobrarla. */
	remove: (key: string) => void
	/** Revalidación batch contra `GET /shop/products` (tras un pago parcial). */
	revalidate: () => Promise<void>
	/** Registra la dirección recién creada en la pantalla. */
	onAddressCreated: (address: ShippingAddress) => void
}

/**
 * Checkout del carrito.
 *
 * @param args - Líneas a cobrar, datos de envío y callbacks de la pantalla.
 * @returns Estado del pago (por línea y global) y la acción `payAll`.
 */
export default function useCartCheckout({ payable, anyPhysical, useNewAddress, selectedUuid, form, navigation, setStatuses, remove, revalidate, onAddressCreated }: CartCheckoutArgs) {

	const { t } = useTranslation()
	const { updateUser } = useAuth()

	const [paying, setPaying] = useState(false)
	const [succeededCount, setSucceededCount] = useState(0)

	// Una clave de idempotencia por línea y por montaje: un reintento (incluso
	// tras un timeout) reutiliza la misma clave y el backend no duplica la orden.
	const idemRef = useRef<Record<string, string>>({})
	const idemKeyFor = (key: string) => {
		if (!idemRef.current[key]) idemRef.current[key] = makeIdemKey()
		return idemRef.current[key]
	}

	const payAll = async () => {
		setPaying(true)

		// Dirección nueva: se crea UNA vez y todas las órdenes físicas la reusan
		// (mandar new_address por orden duplicaría la dirección en cada compra)
		let addressUuid = !useNewAddress ? selectedUuid : null
		if (anyPhysical && !addressUuid && useNewAddress) {
			// `buildAddressBody` normaliza phone/line2 a `null` y añade `country`, y el
			// input de shopApi los declara `string?` sin `country`: incompatibilidad
			// REAL entre módulos ya migrados — se castea aquí, el body viaja intacto
			const res = await shopApi.createShippingAddress(buildAddressBody(form) as unknown as Parameters<typeof shopApi.createShippingAddress>[0])
			// `shopApi.createShippingAddress` devuelve `unknown`: solo se lee `address`
			const createdUuid = res.success ? (res.data as { address?: ShippingAddress } | undefined)?.address?.uuid : null
			if (!createdUuid) {
				toast.error(t('market.cart.toasts.addressErrorTitle'), { description: (res as ApiFailure).error || t('market.cart.toasts.addressSaveFailed') })
				setPaying(false)
				return
			}
			addressUuid = createdUuid
			onAddressCreated((res as ApiSuccess<{ address: ShippingAddress }>).data!.address)
		}

		let succeeded = 0
		let failed = 0
		let aborted = false
		// Secuencial a propósito: cada orden abre una transacción Serializable que
		// puede escribir la fila del usuario de fees — en paralelo se pisan
		for (const entry of payable) {
			if (aborted) break
			setStatuses(s => ({ ...s, [entry.key]: 'paying' }))
			const payload: MarketOrderInput = {
				product_uuid: entry.item.product_uuid,
				quantity: entry.qty,
				idempotency_key: idemKeyFor(entry.key),
			}
			if (entry.item.variant_uuid) payload.variant_uuid = entry.item.variant_uuid
			if (entry.isPhysical && addressUuid) payload.shipping_address_id = addressUuid

			let outcome: { ok: true } | { ok: false, error: string, raw?: string } | null = null
			for (let attempt = 0; attempt < 4; attempt++) {
				const res = await marketApi.createOrder(payload)
				if (res.status === 429) { await sleep(5000); continue }
				outcome = res.success ? { ok: true } : { ok: false, error: mapOrderError(res.status, res.error), raw: res.error }
				break
			}
			if (!outcome) outcome = { ok: false, error: t('market.checkout.errors.busy') }

			if (outcome.ok) {
				succeeded++
				setStatuses(s => ({ ...s, [entry.key]: 'done' }))
				remove(entry.key)
			} else {
				failed++
				setStatuses(s => ({ ...s, [entry.key]: { error: outcome.error } }))
				// Sin saldo, las líneas restantes fallarían igual: quedan intactas
				if (isAbortingOrderError(outcome.raw)) aborted = true
			}
		}

		setPaying(false)
		setSucceededCount(n => n + succeeded)

		// Refrescar el balance local tras el gasto
		if (succeeded > 0) {
			const profile = await userApi.getUserProfile()
			if (profile.success && profile.data) updateUser(profile.data)
		}

		if (failed === 0 && succeeded > 0) {
			toast.success(t('market.cart.toasts.confirmed', { count: succeeded }))
			navigation.replace(ROUTES.MARKET_ORDERS)
		} else if (succeeded > 0) {
			toast.warning(t('market.cart.toasts.partial', { count: succeeded, failed }))
			await revalidate()
		} else if (failed > 0) {
			toast.error(t('market.cart.toasts.allFailed'))
		}
	}

	return { paying, succeededCount, payAll }
}
