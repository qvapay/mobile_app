import { useCallback, useRef, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

// API
import { pixApi } from '../../../api/pixApi'
import type { PixCheckoutInput } from '../../../api/pixApi'

// Routes / i18n
import { ROUTES } from '../../../routes'
import { getDateLocale } from '../../../i18n'

// Lógica
import { PIX_ELIGIBILITY_KEY, usePixEligibilityQuery } from './pixQueries'
import { claimCartLines, rememberCartLines, rememberUnconfirmedCartLines, settlePendingCartLines } from './pixCartLines'
import { classifyPixCheckoutError, formatBrl, resolvePixOffer } from './pixRules'
import type { PixOffer } from './pixRules'
import type { PixCharge, PixSurface } from '../../../types/domain'

/** Los campos de la compra (todo menos `source`, que lo pone el hook). */
export type PixPurchaseFields = Omit<PixCheckoutInput, 'source'>

type Args = {
	surface: PixSurface
	/** Lo que costaría con saldo, en USD. */
	base: number
	/** Solo se pregunta al servidor cuando la compra ya va a pagarse. */
	enabled: boolean
	/** Esta compra concreta nunca se paga con PIX, aunque la superficie esté abierta. */
	excluded?: boolean
	/** El precio no incluye algo que el servidor sí cobra (el envío del carrito). */
	estimate?: boolean
	/** Campos de la compra, o null si aún falta algo (quien la construye ya avisa). */
	buildBody: () => PixPurchaseFields | null | Promise<PixPurchaseFields | null>
	/** Pantallas que salen al terminar pagado, contando el QR (2 = también el wizard). */
	doneDepth?: number
	/**
	 * Solo el carrito: las líneas que se mandan. Se apuntan con el cobro al crearlo, porque al
	 * pagarse salen del carrito esas y no las que haya entonces (ver `pixCartLines`).
	 */
	cartKeys?: string[]
	/** Elegir PIX apaga el descuento en sats: no se aplica a un pago con PIX. */
	onChoose?: () => void
	/** El servidor exige el nombre del destinatario (recarga a Cuba). */
	onRecipientRequired?: () => void
}

export type PixPayment = {
	offer: PixOffer
	/** El usuario eligió pagar con PIX y ahora mismo se puede. */
	selected: boolean
	starting: boolean
	estimate: boolean
	holdHours: number | undefined
	payLabel: string
	choose: (usePix: boolean) => void
	openCpf: () => void
	openGold: () => void
	pay: () => Promise<void>
}

const HIDDEN: PixOffer = { kind: 'hidden' }

/**
 * Opción de pago con PIX de una compra, la misma en recargas, gift cards y carrito. Decide si se
 * ofrece (`GET /pix/eligibility`), crea el cobro y abre el QR. Un QR ya abierto no es un error: se
 * abre ese. Fuera de Brasil no pinta nada y la compra con saldo se queda como estaba.
 *
 * @param args - Compra, precio y callbacks de la pantalla.
 * @returns Estado de la opción y sus acciones.
 */
export default function usePixPayment({ surface, base, enabled, excluded = false, estimate = false, buildBody, doneDepth = 1, cartKeys, onChoose, onRecipientRequired }: Args): PixPayment {

	const { t } = useTranslation()
	const navigation = useNavigation()
	const queryClient = useQueryClient()

	const eligibility = usePixEligibilityQuery(enabled && !excluded)
	const holdHours = eligibility.data?.hold_hours

	const [wanted, setWanted] = useState(false)
	const [starting, setStarting] = useState(false)
	// El veto del servidor vale para ESTA compra: otra oferta vuelve a preguntar
	const [vetoedFor, setVetoedFor] = useState<string | null>(null)
	const purchaseKey = `${surface}:${base}`
	// Doble toque: el segundo chocaría con el límite de 1 llamada cada 10 s
	const inFlight = useRef(false)

	const offer = excluded || vetoedFor === purchaseKey ? HIDDEN : resolvePixOffer(eligibility.data, surface, base)
	const selected = wanted && offer.kind === 'ready'

	const refreshEligibility = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: PIX_ELIGIBILITY_KEY })
	}, [queryClient])

	// En el carrito, lo que se pagó con PIX sin el QR delante también sale de él
	const isCart = cartKeys !== undefined
	useFocusEffect(useCallback(() => {
		if (isCart) { settlePendingCartLines() }
	}, [isCart]))

	// Comprar GOLD o hacer el KYC cambia lo que se ofrece: al volver a la compra se pregunta otra vez
	const asking = enabled && !excluded
	useFocusEffect(useCallback(() => {
		if (asking) { queryClient.invalidateQueries({ queryKey: PIX_ELIGIBILITY_KEY }, { cancelRefetch: false }) }
	}, [asking, queryClient]))

	const choose = useCallback((usePix: boolean) => {
		setWanted(usePix)
		if (usePix) { onChoose?.() }
	}, [onChoose])

	// Al volver con el CPF verificado la opción ya sale elegida
	const openCpf = useCallback(() => {
		choose(true)
		navigation.navigate(ROUTES.CPF_VERIFICATION)
	}, [choose, navigation])

	const openGold = useCallback(() => {
		navigation.navigate(ROUTES.GOLD_CHECK)
	}, [navigation])

	const openCharge = useCallback((charge: PixCharge) => {
		navigation.navigate(ROUTES.PIX_CHECKOUT, { charge, holdHours, doneDepth })
	}, [doneDepth, holdHours, navigation])

	const messageFor = useCallback((code: string | null, fallback: string | undefined) => {
		const key = `store.pix.errors.${code}`
		return code && t(key) !== key ? t(key) : (fallback || t('store.pix.errors.generic'))
	}, [t])

	const pay = useCallback(async () => {
		if (inFlight.current) { return }
		inFlight.current = true
		setStarting(true)
		try {
			const body = await buildBody()
			if (!body) { return }
			const result = await pixApi.createCheckout({ ...body, source: surface })
			if (result.success) {
				if (result.data) {
					await rememberCartLines(result.data.uuid, cartKeys ?? [])
					openCharge(result.data)
				}
				return
			}
			// Sin respuesta, o con un 5xx, el cobro pudo crearse: el reintento lo recibirá en un 409
			if (cartKeys && (result.status === undefined || result.status >= 500)) { await rememberUnconfirmedCartLines(cartKeys) }
			const failure = classifyPixCheckoutError(result.status, result.details)
			switch (failure.kind) {
				case 'open':
					await claimCartLines(failure.charge)
					openCharge(failure.charge)
					break
				case 'cap': {
					const amount = failure.remaining === null ? null : `$${failure.remaining.toFixed(2)}`
					const date = failure.resetsAt ? new Date(failure.resetsAt).toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'long' }) : null
					toast.error(t('store.pix.errors.capTitle'), {
						description: amount ? (date ? t('store.pix.errors.capBody', { amount, date }) : t('store.pix.errors.capRemaining', { amount })) : undefined,
					})
					refreshEligibility()
					break
				}
				case 'cpf':
					refreshEligibility()
					openCpf()
					break
				case 'recipient':
					onRecipientRequired?.()
					toast.error(t('store.toasts.error'), { description: result.error })
					break
				case 'vetoed':
					setVetoedFor(purchaseKey)
					setWanted(false)
					toast.error(messageFor(failure.code, result.error))
					refreshEligibility()
					break
				default:
					toast.error(messageFor(failure.code, result.error))
			}
		} finally {
			inFlight.current = false
			setStarting(false)
		}
	}, [buildBody, cartKeys, messageFor, onRecipientRequired, openCharge, openCpf, purchaseKey, refreshEligibility, surface, t])

	const price = offer.kind === 'ready' ? formatBrl(offer.quote.totalBrl) : ''

	return {
		offer,
		selected,
		starting,
		estimate,
		holdHours,
		payLabel: t('store.pix.payAmount', { amount: estimate ? `≈ ${price}` : price }),
		choose,
		openCpf,
		openGold,
		pay,
	}
}
