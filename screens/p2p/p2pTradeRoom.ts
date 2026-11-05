/**
 * Reglas PURAS del trade room P2P: el modelo del título de la pantalla y la línea
 * de tiempo vertical de `P2PTradeProgress`. Sin react-native: se testea con
 * `@jest-environment node`.
 */

import { availableReceive, isFlexibleOffer } from './p2pFlexible'
import { viewerPays } from './p2pOfferCard'

import type { TFunction } from 'i18next'
import type { P2POffer, P2PStatus } from '../../types/domain'

/** Estados con trato en marcha: fuera de ellos no hay trade room. */
export type TradeRoomStatus = Extract<P2PStatus, 'processing' | 'paid' | 'completed'>

export const isTradeRoomStatus = (status: P2PStatus): status is TradeRoomStatus =>
	status === 'processing' || status === 'paid' || status === 'completed'

export type TradeHeaderModel = {
	/** Lo que HACE quien mira: `buy` paga la moneda y recibe saldo, `sell` al revés. */
	side: 'buy' | 'sell'
	amount: string
	coinLogo: string | null
	coinName: string
}

/**
 * El monto del título es el de la moneda de pago, tal cual viaja: en un trato hay
 * que enviar exactamente esa cifra y `formatCoinAmount` redondearía a dos decimales.
 * La vista de una oferta por rango enseña lo que queda, no el total original.
 */
export const tradeHeaderModel = (offer: P2POffer, isOwner: boolean, overview: boolean): TradeHeaderModel => {
	const available = overview && isFlexibleOffer(offer) ? availableReceive(offer) : 0
	return {
		side: viewerPays(offer.type, isOwner) ? 'buy' : 'sell',
		amount: available > 0 ? String(Number(available.toFixed(8))) : String(offer.receive),
		coinLogo: offer.Coin?.logo ?? offer.coin ?? null,
		coinName: offer.Coin?.name ?? offer.coin ?? '',
	}
}

export type TradeStepKey = 'payment' | 'confirmation' | 'release'
export type TradeStepState = 'done' | 'active' | 'pending'
export type TradeStep = { key: TradeStepKey, state: TradeStepState, title: string, body: string }

type TimelineVars = { amount: string, coin: string, balance: string, counterparty: string }
type StepCopy = Pick<TradeStep, 'title' | 'body'>

const STEP_KEYS: TradeStepKey[] = ['payment', 'confirmation', 'release']

const STEP_STATES: Record<TradeRoomStatus, TradeStepState[]> = {
	processing: ['active', 'pending', 'pending'],
	paid: ['done', 'done', 'active'],
	completed: ['done', 'done', 'done'],
}

const payerCopy = (t: TFunction, status: TradeRoomStatus, vars: TimelineVars): StepCopy[] => {
	const paid = status !== 'processing'
	return [
		paid
			? { title: t('p2p.tradeProgress.timeline.payer.paymentDone.title'), body: t('p2p.tradeProgress.timeline.payer.paymentDone.body', vars) }
			: { title: t('p2p.tradeProgress.timeline.payer.paymentActive.title'), body: t('p2p.tradeProgress.timeline.payer.paymentActive.body', vars) },
		paid
			? { title: t('p2p.tradeProgress.timeline.payer.confirmationDone.title'), body: t('p2p.tradeProgress.timeline.payer.confirmationDone.body', vars) }
			: { title: t('p2p.tradeProgress.timeline.payer.confirmationPending.title'), body: t('p2p.tradeProgress.timeline.payer.confirmationPending.body') },
		status === 'completed'
			? { title: t('p2p.tradeProgress.timeline.payer.releaseDone.title'), body: t('p2p.tradeProgress.timeline.payer.releaseDone.body', vars) }
			: paid
				? { title: t('p2p.tradeProgress.timeline.payer.releaseActive.title'), body: t('p2p.tradeProgress.timeline.payer.releaseActive.body', vars) }
				: { title: t('p2p.tradeProgress.timeline.payer.releasePending.title'), body: t('p2p.tradeProgress.timeline.payer.releasePending.body', vars) },
	]
}

// `paid` solo significa que la contraparte DICE haber pagado: hasta liberar, el
// primer paso no le da el pago por recibido a quien tiene que comprobarlo
const receiverCopy = (t: TFunction, status: TradeRoomStatus, vars: TimelineVars): StepCopy[] => {
	const paid = status !== 'processing'
	const completed = status === 'completed'
	return [
		completed
			? { title: t('p2p.tradeProgress.timeline.receiver.paymentDone.title'), body: t('p2p.tradeProgress.timeline.receiver.paymentDone.body', vars) }
			: paid
				? { title: t('p2p.tradeProgress.timeline.receiver.paymentClaimed.title'), body: t('p2p.tradeProgress.timeline.receiver.paymentClaimed.body', vars) }
				: { title: t('p2p.tradeProgress.timeline.receiver.paymentActive.title'), body: t('p2p.tradeProgress.timeline.receiver.paymentActive.body', vars) },
		paid
			? { title: t('p2p.tradeProgress.timeline.receiver.confirmationDone.title'), body: t('p2p.tradeProgress.timeline.receiver.confirmationDone.body', vars) }
			: { title: t('p2p.tradeProgress.timeline.receiver.confirmationPending.title'), body: t('p2p.tradeProgress.timeline.receiver.confirmationPending.body', vars) },
		completed
			? { title: t('p2p.tradeProgress.timeline.receiver.releaseDone.title'), body: t('p2p.tradeProgress.timeline.receiver.releaseDone.body', vars) }
			: paid
				? { title: t('p2p.tradeProgress.timeline.receiver.releaseActive.title'), body: t('p2p.tradeProgress.timeline.receiver.releaseActive.body', vars) }
				: { title: t('p2p.tradeProgress.timeline.receiver.releasePending.title'), body: t('p2p.tradeProgress.timeline.receiver.releasePending.body', vars) },
	]
}

/**
 * Los tres pasos del trato desde la perspectiva de quien mira, con la indicación
 * de cada uno. `t` llega del componente para re-resolverse al cambiar de idioma.
 */
export const buildTradeTimeline = (t: TFunction, { status, isPayer, ...vars }: TimelineVars & { status: TradeRoomStatus, isPayer: boolean }): TradeStep[] => {
	const copy = isPayer ? payerCopy(t, status, vars) : receiverCopy(t, status, vars)
	return STEP_KEYS.map((key, i) => ({ key, state: STEP_STATES[status][i], ...copy[i] }))
}
