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
 *
 * Todas las órdenes de una ejecución llevan el mismo `cart_key` (como la web): el
 * servidor cobra el envío una vez por tienda y despacha el lote junto.
 *
 * Tiendas que entregan a domicilio en Cuba: a un US person el servidor le exige la
 * atestación OFAC (`cuba_value`) en cada orden de esas líneas. Se pide ANTES de cobrar
 * si `cip.us_person` lo dice; y como el servidor cuenta además a quien tiene documento
 * o SSN de EE. UU. (una regla que ningún endpoint expone), un 400
 * `US_PERSON_ATTESTATION_REQUIRED` también abre el modal y reanuda el recorrido con
 * las MISMAS claves de idempotencia.
 */

import { useState, useRef, useEffect } from 'react'
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

// Compliance
import useOfacGate from '../../../hooks/useOfacGate'
import { useOfacChecks } from '../../../hooks/useOfacQueries'
import { whenNoModalPresented } from '../../../ui/modalPresence'

// UI helpers
import { buildAddressBody } from '../../../ui/store/shippingAddress'
import { supplierNeedsIdentification } from '../../../ui/store/cubaAddress'

// Cart core
import { mapOrderError, isAbortingOrderError, makeIdemKey, orderErrorCode, paymentSequence } from './marketCheckout'

import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { AddressCountry, AddressForm, ShippingAddress } from '../../../ui/store/shippingAddress'
import type { CartEntry, CartLineStatus, ShippingChoice } from './marketCheckout'
import type { MarketOrderInput } from '../../../api/marketApi'
import type { OfacCompliancePayload } from '../../../helpers/ofacCompliance'
import type { ApiFailure } from '../../../types/api'

// `setTimeout` está tipado como `() => void`; el `resolve` de la promesa recibe
// un valor. Cast de tipos, el temporizador se arma igual.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve as () => void, ms))

/** Resultado de una orden: cobrada, o fallida con su mensaje, su código y el texto crudo del servidor. */
type OrderOutcome = { ok: true } | { ok: false, error: string, code: string | null, raw?: string }

/** Lo que el checkout necesita de la pantalla. */
type CartCheckoutArgs = {
	/** Líneas pagables (sin problema y no cobradas ya). */
	payable: CartEntry[]
	/** Hay artículos físicos: exigen dirección de envío. */
	anyPhysical: boolean
	/** Dirección elegida: guardada, nueva (el formulario) o una cubana que se está completando. */
	choice: ShippingChoice | null
	form: AddressForm
	/** País del formulario de dirección nueva. */
	country: AddressCountry
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
	/** Registra en la pantalla la dirección recién creada o completada. */
	onAddressSaved: (address: ShippingAddress) => void
}

/**
 * Checkout del carrito.
 *
 * @param args - Líneas a cobrar, datos de envío y callbacks de la pantalla.
 * @returns Estado del pago (por línea y global), la acción `payAll` y las props del modal OFAC.
 */
export default function useCartCheckout({ payable, anyPhysical, choice, form, country, navigation, setStatuses, remove, revalidate, onAddressSaved }: CartCheckoutArgs) {

	const { t } = useTranslation()
	const { updateUser } = useAuth()
	const { resolveUsPerson, prefetchUsPerson } = useOfacChecks()
	const { requireAttestation, modalProps: ofacModalProps } = useOfacGate()

	const [paying, setPaying] = useState(false)
	const [succeededCount, setSucceededCount] = useState(0)

	// Una clave de idempotencia por línea y por montaje: un reintento (incluso
	// tras un timeout) reutiliza la misma clave y el backend no duplica la orden.
	const idemRef = useRef<Record<string, string>>({})
	const idemKeyFor = (key: string) => {
		if (!idemRef.current[key]) idemRef.current[key] = makeIdemKey()
		return idemRef.current[key]
	}

	// El lote del carrito: uno por montaje, como la web (los reintentos lo reutilizan)
	const cartKeyRef = useRef<string | null>(null)
	const cartKey = () => {
		if (!cartKeyRef.current) cartKeyRef.current = makeIdemKey()
		return cartKeyRef.current
	}

	// Atestación del intento: viaja en cada orden de una tienda que entrega en Cuba y se
	// reutiliza en los reintentos de esta pantalla
	const complianceRef = useRef<OfacCompliancePayload | null>(null)
	const hasCubaDelivery = payable.some(e => supplierNeedsIdentification(e.fresh?.supplier))
	useEffect(() => { if (hasCubaDelivery) prefetchUsPerson() }, [hasCubaDelivery, prefetchUsPerson])

	/**
	 * Dirección de la compra, también para el pago con PIX. Una nueva se crea UNA vez y todas las
	 * órdenes físicas la reusan (mandar new_address por orden duplicaría la dirección en cada compra);
	 * una cubana a medias se completa con un PATCH antes de cobrar.
	 *
	 * @returns `{ uuid }` (null si la compra no la necesita), o null si no se pudo guardar.
	 */
	const resolveAddress = async (): Promise<{ uuid: string | null } | null> => {
		if (!anyPhysical || !choice) return { uuid: null }
		if (choice.kind === 'saved') return { uuid: choice.uuid }
		// Completar solo se ofrece en direcciones de Cuba
		const body = buildAddressBody(form, choice.kind === 'edit' ? 'CU' : country)
		const res = choice.kind === 'edit'
			? await shopApi.updateShippingAddress(choice.uuid, body)
			: await shopApi.createShippingAddress(body)
		// `shopApi` devuelve `unknown`: solo se lee `address`
		const saved = res.success ? (res.data as { address?: ShippingAddress } | undefined)?.address : null
		if (!saved?.uuid) {
			toast.error(t('market.cart.toasts.addressErrorTitle'), { description: (res as ApiFailure).error || t('market.cart.toasts.addressSaveFailed') })
			return null
		}
		onAddressSaved(saved)
		return { uuid: saved.uuid }
	}

	// La continuación del modal llama a la ÚLTIMA versión de payAll: la del render en que se
	// pidió la atestación ya no sabe qué líneas se cobraron después
	const payAllRef = useRef<(carried?: number) => Promise<void>>(async () => { })

	/**
	 * Abre la atestación y, al certificar, sigue cobrando. Espera a que el modal de confirmación
	 * termine de irse: presentar uno mientras otro se va deja un modal zombi en iOS.
	 *
	 * @param carried - Compras ya confirmadas en esta ejecución (para el aviso final).
	 */
	const askAttestation = async (carried: number) => {
		await whenNoModalPresented()
		requireAttestation({ required: true, scope: 'cuba_value', context: 'market' }, (payload) => {
			complianceRef.current = payload
			payAllRef.current(carried)
		})
	}

	const payAll = async (carried = 0) => {
		setPaying(true)

		// Antes de crear la dirección ni cobrar nada: si quien compra se ha declarado US person
		if (hasCubaDelivery && !complianceRef.current && await resolveUsPerson()) {
			setPaying(false)
			await askAttestation(carried)
			return
		}

		const address = await resolveAddress()
		if (!address) {
			setPaying(false)
			return
		}
		const addressUuid = address.uuid

		let succeeded = 0
		let failed = 0
		let aborted = false
		let attestationNeeded = false
		// Secuencial a propósito: cada orden abre una transacción Serializable que
		// puede escribir la fila del usuario de fees — en paralelo se pisan
		for (const entry of paymentSequence(payable)) {
			if (aborted) break
			setStatuses(s => ({ ...s, [entry.key]: 'paying' }))
			const payload: MarketOrderInput = {
				product_uuid: entry.item.product_uuid,
				quantity: entry.qty,
				idempotency_key: idemKeyFor(entry.key),
				cart_key: cartKey(),
			}
			if (entry.item.variant_uuid) payload.variant_uuid = entry.item.variant_uuid
			if (entry.isPhysical && addressUuid) payload.shipping_address_id = addressUuid
			if (complianceRef.current && supplierNeedsIdentification(entry.fresh?.supplier)) payload.compliance = complianceRef.current

			let outcome: OrderOutcome | null = null
			for (let attempt = 0; attempt < 4; attempt++) {
				const res = await marketApi.createOrder(payload)
				if (res.status === 429) { await sleep(5000); continue }
				if (res.success) { outcome = { ok: true }; break }
				const code = orderErrorCode(res.details)
				outcome = { ok: false, error: mapOrderError(res.status, res.error, code), code, raw: res.error }
				break
			}
			const result: OrderOutcome = outcome || { ok: false, error: t('market.checkout.errors.busy'), code: null }

			if (result.ok) {
				succeeded++
				setStatuses(s => ({ ...s, [entry.key]: 'done' }))
				remove(entry.key)
				continue
			}
			setStatuses(s => ({ ...s, [entry.key]: { error: result.error } }))
			// El servidor considera US person a quien la app no: se pide la atestación y se
			// reanuda (esta línea y las que faltan) con las mismas claves. Si ya viajaba, es otro
			// problema y la línea se queda con su error
			if (result.code === 'US_PERSON_ATTESTATION_REQUIRED' && !payload.compliance) {
				attestationNeeded = true
				break
			}
			failed++
			// Sin saldo, las líneas restantes fallarían igual: quedan intactas
			if (isAbortingOrderError(result.raw)) aborted = true
		}

		setPaying(false)
		setSucceededCount(n => n + succeeded)

		// Refrescar el balance local tras el gasto
		if (succeeded > 0) {
			const profile = await userApi.getUserProfile()
			if (profile.success && profile.data) updateUser(profile.data)
		}

		if (attestationNeeded) {
			await askAttestation(carried + succeeded)
			return
		}

		const confirmed = carried + succeeded
		if (failed === 0 && confirmed > 0) {
			toast.success(t('market.cart.toasts.confirmed', { count: confirmed }))
			navigation.replace(ROUTES.MARKET_ORDERS)
		} else if (confirmed > 0) {
			toast.warning(t('market.cart.toasts.partial', { count: confirmed, failed }))
			await revalidate()
		} else if (failed > 0) {
			toast.error(t('market.cart.toasts.allFailed'))
		}
	}

	useEffect(() => { payAllRef.current = payAll })

	return { paying, succeededCount, payAll: () => payAll(), resolveAddress, ofacModalProps }
}
