/**
 * Reglas PURAS de la valoración P2P del lado de la app: qué trato puedo valorar,
 * cuál es mi valoración y qué se manda. Espejo de `app/api/p2p/[uuid]/rate/route.js`
 * y `scripts/p2p/rating-rules.js` de qpweb: el servidor valida igual, esto solo
 * evita mandar al usuario contra un 4xx.
 *
 * Una oferta FIJA se valora entera (mi fila sale de `Ratings`). En una POR RANGO
 * se valora cada ORDEN completada (mi valoración llega en `Orders[i].my_rating`)
 * y la oferta en sí nunca: su `completed` solo significa que ya no queda monto.
 *
 * Sin react-native: se testea con `@jest-environment node`.
 */

import type { P2PMyRating, P2POffer, P2POfferRating, P2POrder, P2PRatingTag, P2PUser } from '../../types/domain'
import type { P2PRateInput } from '../../api/p2pApi'

/** Etiquetas rápidas (`P2P_QUICK_TAGS` del backend), en el orden en que se pintan. */
export const RATING_TAGS: readonly P2PRatingTag[] = ['rapido', 'confiable', 'comunicacion']

export const RATING_COMMENT_MAX = 120

/** Lo que el usuario rellena en la hoja de valoración. */
export type RatingForm = { rating: number, tags: P2PRatingTag[], comment: string }

/**
 * Body de `PATCH /p2p/{uuid}/rate`: solo lo que cambia. Ausente = no se toca;
 * `comment: null` o `tags: []` lo borran.
 */
export type P2PRateEditInput = { rating?: number, comment?: string | null, tags?: P2PRatingTag[] | null, order?: string }

/** Mi valoración de un trato, normalizada para la UI (`rating` como número). */
export type MyRating = { rating: number, comment: string, tags: P2PRatingTag[], editableUntil: string | null }

const cleanTags = (tags: readonly unknown[] | null | undefined): P2PRatingTag[] =>
	RATING_TAGS.filter(tag => (tags || []).includes(tag))

const cleanComment = (comment: string | null | undefined): string =>
	String(comment || '').trim().slice(0, RATING_COMMENT_MAX)

/**
 * Body del POST. `rating` sale como NÚMERO entero 1–5 (el backend rechaza `"5"`
 * con "Datos inválidos"), el comentario recortado y las etiquetas filtradas a la
 * lista blanca; lo vacío se omite. `order` va en el BODY.
 *
 * @returns El payload, o null si no hay estrellas válidas.
 */
export const buildRatePayload = (form: RatingForm, order?: string | null): P2PRateInput | null => {
	const rating = Math.round(Number(form.rating))
	if (!(rating >= 1 && rating <= 5)) return null
	const comment = cleanComment(form.comment)
	const tags = cleanTags(form.tags)
	return {
		rating,
		...(comment ? { comment } : {}),
		...(tags.length ? { tags } : {}),
		...(order ? { order } : {}),
	}
}

/**
 * Body del PATCH: solo los campos que cambian respecto a `prev`. Un comentario
 * vaciado viaja como `null` y unas etiquetas quitadas como `[]` (así se borran).
 *
 * @returns El payload, o null si no cambia nada (el backend respondería 400 NOTHING_TO_UPDATE).
 */
export const buildEditPayload = (prev: MyRating, form: RatingForm, order?: string | null): P2PRateEditInput | null => {
	const next = buildRatePayload(form)
	if (!next) return null
	const data: P2PRateEditInput = {}
	if (next.rating !== prev.rating) data.rating = next.rating
	const comment = next.comment ?? ''
	if (comment !== cleanComment(prev.comment)) data.comment = comment || null
	const tags = next.tags ?? []
	const prevTags = cleanTags(prev.tags)
	if (tags.length !== prevTags.length || tags.some(tag => !prevTags.includes(tag))) data.tags = tags
	if (!Object.keys(data).length) return null
	return { ...data, ...(order ? { order } : {}) }
}

const toMyRating = (row: P2PMyRating): MyRating => ({
	rating: Number(row.rating) || 0,
	comment: row.comment || '',
	tags: cleanTags(row.tags),
	editableUntil: row.editable_until || null,
})

/**
 * Mi fila en `Ratings` de una oferta fija. `rater`/`rated` son ids INTERNOS y se
 * comparan con `currentUserId`. En una fila legacy (sin `rater`) la mía es la que
 * valora a alguien que no soy yo: en un trato de dos solo yo valoro a la contraparte.
 */
export const findMyFixedRating = (offer: Pick<P2POffer, 'Ratings' | 'currentUserId'> | null | undefined): P2POfferRating | null => {
	const me = offer?.currentUserId
	const rows = offer?.Ratings || []
	if (!me || !rows.length) return null
	return rows.find(r => r.rater != null && String(r.rater) === String(me))
		|| rows.find(r => r.rater == null && r.rated != null && String(r.rated) !== String(me))
		|| null
}

/** Mi valoración del trato que se mira: la de la orden si hay orden, la de la oferta fija si no. */
export const myRatingOf = (offer: P2POffer | null | undefined, order: P2POrder | null | undefined): MyRating | null => {
	if (order) return order.my_rating ? toMyRating(order.my_rating) : null
	const row = findMyFixedRating(offer)
	return row ? toMyRating(row) : null
}

/** ¿Sigue abierto el plazo para cambiarla? Lo fija el backend (`editable_until`), nunca la app. */
export const canEditRating = (mine: MyRating | null | undefined, now: number = Date.now()): boolean => {
	if (!mine?.editableUntil) return false
	const until = new Date(mine.editableUntil).getTime()
	return Number.isFinite(until) && until > now
}

/** Soy parte de una orden si soy el dueño de la oferta o su taker (un taker solo recibe las suyas). */
export const isOrderParty = (offer: P2POffer | null | undefined, order: P2POrder | null | undefined, userUuid: string | null | undefined): boolean =>
	!!userUuid && !!order && (offer?.User?.uuid === userUuid || order.Taker?.uuid === userUuid)

/** Una orden se valora cuando está completada, soy parte y aún no la valoré. */
export const canRateOrder = (offer: P2POffer | null | undefined, order: P2POrder | null | undefined, userUuid: string | null | undefined): boolean =>
	!!order && order.status === 'completed' && isOrderParty(offer, order, userUuid) && !order.my_rating

/** A quién valoro en una orden: el dueño, al taker; el taker, al dueño (`Peer` llega vacío). */
export const orderCounterparty = (offer: P2POffer, order: P2POrder, isOwner: boolean): P2PUser | null =>
	(isOwner ? order.Taker : offer.User) ?? null

export type RateErrorKind = 'alreadyRated' | 'notCompleted' | 'editExpired' | 'notFound' | 'generic'

/**
 * Qué hacer con un fallo de valorar/editar. "Ya has calificado" no es un error
 * para el usuario: solo hay que dejar el trato como valorado (refrescando).
 */
export const classifyRateError = (res: { status?: number, error?: string, details?: unknown }): RateErrorKind => {
	const code = (res.details as { code?: string } | undefined)?.code
	if (code === 'ALREADY_RATED' || /ya has calificado/i.test(String(res.error || ''))) return 'alreadyRated'
	if (code === 'ORDER_NOT_COMPLETED') return 'notCompleted'
	if (code === 'RATING_EDIT_EXPIRED') return 'editExpired'
	if (code === 'RATING_NOT_FOUND' || res.status === 404) return 'notFound'
	return 'generic'
}

/** Mi valoración con la forma del backend, a partir de lo que mandé y de lo que respondió. */
export const toServerRating = (payload: P2PRateInput, response?: { editable_until?: string | null } | null): P2PMyRating => ({
	rating: String(payload.rating),
	comment: payload.comment || null,
	tags: payload.tags || [],
	created_at: new Date().toISOString(),
	editable_until: response?.editable_until ?? null,
})

/**
 * Escribe mi valoración (nueva o editada) en la oferta sin esperar al refetch:
 * en `my_rating` de esa orden, o en mi fila de `Ratings` en una fija.
 */
export const applyOptimisticRating = (offer: P2POffer, orderUuid: string | null | undefined, mine: P2PMyRating): P2POffer => {
	if (orderUuid) {
		return { ...offer, Orders: (offer.Orders || []).map(o => (o.uuid === orderUuid ? { ...o, my_rating: { ...o.my_rating, ...mine } } : o)) }
	}
	const rows = offer.Ratings || []
	const existing = findMyFixedRating(offer)
	if (existing) return { ...offer, Ratings: rows.map(r => (r === existing ? { ...r, ...mine } : r)) }
	return { ...offer, Ratings: [...rows, { ...mine, rater: offer.currentUserId ?? null, rated: null }] }
}
