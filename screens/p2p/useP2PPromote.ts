import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

import { p2pApi } from '../../api/p2pApi'
import { useAuth } from '../../auth/AuthContext'
import { callWithDuplicateRetry, makeIdempotencyKey } from '../../helpers/idempotency'
import { p2pPromoKey, useP2PPromoQuery } from './p2pQueries'
import { classifyPromoError, promoBlock, promoEligible, promoPrice, promoUsd, slotFor } from './p2pPromo'

import type { P2PPromoOfferType, P2PPromoPayload, P2PPromoSlot } from '../../types/domain'
import type { PromoBlock } from './p2pPromo'

/** La puja tecleada vale para ESE mínimo: si el mínimo cambia, el campo vuelve a él. */
const bidKey = (slot: P2PPromoSlot) => `${slot.coin}:${slot.offer_type}:${slot.min_bid}`
const leadKey = (coin: string, type: P2PPromoOfferType) => `${coin}:${type}`

/**
 * Estado y envío de la pantalla del puesto promocionado (`GET`/`POST /p2p/promo`).
 *
 * Mueve dinero: la `idempotency_key` se crea al montar, se mantiene en todo reintento
 * (timeout, 5xx, doble toque, 409 en proceso) y solo rota tras un 2xx. Un ref en vuelo
 * bloquea el doble envío. Los errores de negocio traen el `slot` vigente y con él se
 * actualiza la tarjeta en el acto (un PROMO_PRICE_CHANGED deja el campo en el nuevo mínimo).
 *
 * "Tu puja va ganando" no viene en `GET /p2p/promo` (el servidor no publica quién lidera):
 * se recuerda en la sesión tras pujar o tras un ALREADY_LEADING.
 *
 * @param coin - Moneda del par (null mientras no hay catálogo).
 */
export default function useP2PPromote(coin: string | null) {

	const { t } = useTranslation()
	const { user, updateUser } = useAuth()
	const queryClient = useQueryClient()
	const query = useP2PPromoQuery(coin)
	const payload = query.data ?? null

	const [typed, setTyped] = useState<Record<string, string>>({})
	const [leading, setLeading] = useState<Record<string, boolean>>({})
	const [confirming, setConfirming] = useState<P2PPromoOfferType | null>(null)
	const [submitting, setSubmitting] = useState<P2PPromoOfferType | null>(null)

	const idempotencyRef = useRef(makeIdempotencyKey())
	const inFlightRef = useRef(false)

	const balance = Number(user?.balance) || 0
	const eligible = promoEligible(user, payload)

	const bidText = (slot: P2PPromoSlot) => typed[bidKey(slot)] ?? String(slot.min_bid)
	const setBid = (slot: P2PPromoSlot, text: string) => setTyped(prev => ({ ...prev, [bidKey(slot)]: text }))
	const leadingMine = (type: P2PPromoOfferType) => !!coin && !!leading[leadKey(coin, type)]
	const blockOf = (slot: P2PPromoSlot): PromoBlock => promoBlock({ slot, bidText: bidText(slot), balance, eligible, leadingMine: leadingMine(slot.offer_type) })
	const priceOf = (slot: P2PPromoSlot) => promoPrice(slot, bidText(slot))

	const markLeading = (type: P2PPromoOfferType) => { if (coin) setLeading(prev => ({ ...prev, [leadKey(coin, type)]: true })) }

	// El slot que devuelve el servidor (éxito o error de negocio) pinta la tarjeta ya
	const applySlot = (slot: P2PPromoSlot | null | undefined) => {
		if (!coin || !slot) return
		queryClient.setQueryData<P2PPromoPayload | null>(p2pPromoKey(coin), prev => (prev
			? { ...prev, slots: prev.slots.map(s => (s.offer_type === slot.offer_type ? { ...s, ...slot } : s)) }
			: prev))
	}

	const openConfirm = (type: P2PPromoOfferType) => {
		const slot = slotFor(payload, type)
		if (slot && !blockOf(slot)) setConfirming(type)
	}

	const submit = async () => {
		const type = confirming
		const slot = type ? slotFor(payload, type) : null
		if (!coin || !type || !slot || inFlightRef.current || blockOf(slot)) return
		const amount = priceOf(slot)
		const sideLabel = t(type === 'sell' ? 'p2p.common.buy' : 'p2p.common.sell')

		inFlightRef.current = true
		setSubmitting(type)
		try {
			const key = idempotencyRef.current
			const res = await callWithDuplicateRetry(() => p2pApi.promote({ coin, offer_type: type, amount, idempotency_key: key }))
			if (res.success) {
				idempotencyRef.current = makeIdempotencyKey()
				const body = res.data
				if (typeof body?.balance === 'number') updateUser({ balance: body.balance })
				applySlot(body?.slot)
				// Un replay (`duplicate`) no trae `action`: lo dice la operación original
				const action = body?.action ?? (body?.data?.kind === 'purchase' ? 'purchase' : 'bid')
				if (action === 'bid') markLeading(type)
				toast.success(action === 'purchase'
					? t('p2p.promo.toasts.bought', { coin, side: sideLabel, days: slot.period_days })
					: t('p2p.promo.toasts.bid', { amount: promoUsd(amount) }))
				setConfirming(null)
			} else {
				const failure = classifyPromoError(res)
				if (failure.kind === 'alreadyLeading') markLeading(type)
				applySlot(failure.slot)
				toast.error(res.error || t('p2p.promo.toasts.failed'))
				setConfirming(null)
			}
		} catch {
			toast.error(t('p2p.promo.toasts.failed'))
		} finally {
			inFlightRef.current = false
			setSubmitting(null)
			queryClient.invalidateQueries({ queryKey: p2pPromoKey(coin) })
		}
	}

	return {
		query, payload, balance, eligible,
		bidText, setBid, priceOf, blockOf, leadingMine,
		confirming, openConfirm, closeConfirm: () => { if (!inFlightRef.current) setConfirming(null) },
		submit, submitting,
	}
}
