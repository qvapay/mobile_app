/**
 * Reglas puras de la valoración P2P (fijas y órdenes por rango).
 * @jest-environment node
 */
import {
	buildRatePayload, buildEditPayload, findMyFixedRating, myRatingOf, canEditRating,
	isOrderParty, canRateOrder, orderCounterparty, classifyRateError, toServerRating, applyOptimisticRating, fromEditResponse } from './p2pRating'

const MAKER = { uuid: 'maker-uuid', username: 'maker' }
const TAKER = { uuid: 'taker-uuid', username: 'taker' }

const order = (overrides = {}) => ({ uuid: 'ord-1', amount: '15.00', receive: '7500', status: 'completed', created_at: '2026-10-19T18:00:00.000Z', Taker: TAKER, my_rating: null, ...overrides })
const flexible = (overrides = {}) => ({ uuid: 'offer-1', offer_kind: 'flexible', type: 'sell', status: 'open', User: MAKER, Peer: {}, Orders: [order()], Ratings: [], currentUserId: '10', ...overrides })
const fixed = (overrides = {}) => ({ uuid: 'offer-2', offer_kind: 'fixed', type: 'buy', status: 'completed', User: MAKER, Peer: TAKER, Ratings: [], currentUserId: '10', ...overrides })

describe('buildRatePayload', () => {

	test('rating como número entero y order en el body', () => {
		expect(buildRatePayload({ rating: 5, tags: [], comment: '' }, 'ord-1')).toEqual({ rating: 5, order: 'ord-1' })
		expect(buildRatePayload({ rating: '4', tags: [], comment: '' })).toEqual({ rating: 4 })
	})

	test('recorta el comentario, lo limita a 120 y omite lo vacío', () => {
		expect(buildRatePayload({ rating: 3, tags: [], comment: '  Todo perfecto  ' })).toEqual({ rating: 3, comment: 'Todo perfecto' })
		expect(buildRatePayload({ rating: 3, tags: [], comment: '   ' })).toEqual({ rating: 3 })
		expect(buildRatePayload({ rating: 3, tags: [], comment: 'x'.repeat(200) }).comment).toHaveLength(120)
	})

	test('solo etiquetas de la lista blanca, sin repetir y en orden canónico', () => {
		expect(buildRatePayload({ rating: 5, tags: ['confiable', 'hackeo', 'rapido', 'rapido'], comment: '' }))
			.toEqual({ rating: 5, tags: ['rapido', 'confiable'] })
	})

	test('sin estrellas válidas no hay payload', () => {
		expect(buildRatePayload({ rating: 0, tags: [], comment: '' })).toBeNull()
		expect(buildRatePayload({ rating: 6, tags: [], comment: '' })).toBeNull()
		expect(buildRatePayload({ rating: NaN, tags: [], comment: '' })).toBeNull()
	})
})

describe('buildEditPayload', () => {

	const prev = { rating: 4, comment: 'Bien', tags: ['rapido'], editableUntil: '2026-10-22T18:00:00.000Z' }

	test('solo lo que cambia, con order', () => {
		expect(buildEditPayload(prev, { rating: 5, tags: ['rapido'], comment: 'Bien' }, 'ord-1')).toEqual({ rating: 5, order: 'ord-1' })
	})

	test('comentario vaciado → null y etiquetas quitadas → []', () => {
		expect(buildEditPayload(prev, { rating: 4, tags: [], comment: '' })).toEqual({ comment: null, tags: [] })
	})

	test('sin cambios (o sin estrellas) no hay payload', () => {
		expect(buildEditPayload(prev, { rating: 4, tags: ['rapido'], comment: ' Bien ' })).toBeNull()
		expect(buildEditPayload(prev, { rating: 0, tags: [], comment: '' })).toBeNull()
	})
})

describe('mi valoración', () => {

	test('fija: la fila con rater = currentUserId', () => {
		const offer = fixed({ Ratings: [{ rater: '20', rated: '10', rating: '2', comment: null }, { rater: '10', rated: '20', rating: '5', comment: 'ok', tags: ['rapido'], editable_until: null }] })
		expect(findMyFixedRating(offer).rating).toBe('5')
		expect(myRatingOf(offer, null)).toEqual({ rating: 5, comment: 'ok', tags: ['rapido'], editableUntil: null })
	})

	test('fija legacy sin rater: la mía es la que valora a otro', () => {
		const offer = fixed({ Ratings: [{ rater: null, rated: '10', rating: '1', comment: null }, { rater: null, rated: '20', rating: '4', comment: null }] })
		expect(findMyFixedRating(offer).rating).toBe('4')
	})

	test('sin currentUserId o sin filas no hay valoración propia', () => {
		expect(findMyFixedRating(fixed({ currentUserId: undefined, Ratings: [{ rater: '10', rated: '20', rating: '5' }] }))).toBeNull()
		expect(myRatingOf(fixed(), null)).toBeNull()
	})

	test('orden: my_rating (rating llega como string)', () => {
		const ord = order({ my_rating: { rating: '5', comment: 'Todo perfecto', created_at: '2026-10-19T18:02:11.000Z' } })
		expect(myRatingOf(flexible(), ord)).toEqual({ rating: 5, comment: 'Todo perfecto', tags: [], editableUntil: null })
		expect(myRatingOf(flexible(), order())).toBeNull()
	})

	test('el plazo de edición lo marca editable_until', () => {
		const now = new Date('2026-10-20T00:00:00.000Z').getTime()
		expect(canEditRating({ rating: 5, comment: '', tags: [], editableUntil: '2026-10-22T18:00:00.000Z' }, now)).toBe(true)
		expect(canEditRating({ rating: 5, comment: '', tags: [], editableUntil: '2026-10-19T18:00:00.000Z' }, now)).toBe(false)
		expect(canEditRating({ rating: 5, comment: '', tags: [], editableUntil: null }, now)).toBe(false)
		expect(canEditRating(null, now)).toBe(false)
	})
})

describe('órdenes', () => {

	test('soy parte si soy el dueño o el taker', () => {
		expect(isOrderParty(flexible(), order(), MAKER.uuid)).toBe(true)
		expect(isOrderParty(flexible(), order(), TAKER.uuid)).toBe(true)
		expect(isOrderParty(flexible(), order(), 'stranger')).toBe(false)
		expect(isOrderParty(flexible(), order(), null)).toBe(false)
	})

	test('solo una orden completada y sin my_rating se puede valorar', () => {
		expect(canRateOrder(flexible(), order(), MAKER.uuid)).toBe(true)
		expect(canRateOrder(flexible(), order(), TAKER.uuid)).toBe(true)
		for (const status of ['processing', 'paid', 'revision', 'cancelled']) {
			expect(canRateOrder(flexible(), order({ status }), MAKER.uuid)).toBe(false)
		}
		expect(canRateOrder(flexible(), order({ my_rating: { rating: '5', comment: null } }), MAKER.uuid)).toBe(false)
		expect(canRateOrder(flexible(), order(), 'stranger')).toBe(false)
	})

	test('el dueño valora al taker y el taker al dueño (nunca Peer)', () => {
		expect(orderCounterparty(flexible(), order(), true)).toBe(TAKER)
		expect(orderCounterparty(flexible(), order(), false)).toBe(MAKER)
	})
})

describe('classifyRateError', () => {

	test('ya valorada: por código o por el texto del backend', () => {
		expect(classifyRateError({ status: 400, error: 'Ya has calificado esta orden', details: { code: 'ALREADY_RATED' } })).toBe('alreadyRated')
		expect(classifyRateError({ status: 400, error: 'Ya has calificado esta oferta' })).toBe('alreadyRated')
	})

	test('orden no completada, plazo vencido, no encontrada y el resto', () => {
		expect(classifyRateError({ status: 400, details: { code: 'ORDER_NOT_COMPLETED' } })).toBe('notCompleted')
		expect(classifyRateError({ status: 403, details: { code: 'RATING_EDIT_EXPIRED' } })).toBe('editExpired')
		expect(classifyRateError({ status: 404, details: { code: 'RATING_NOT_FOUND' } })).toBe('notFound')
		expect(classifyRateError({ status: 404, error: 'Orden no encontrada en esta oferta' })).toBe('notFound')
		expect(classifyRateError({ status: 400, error: 'Datos inválidos' })).toBe('generic')
	})
})

describe('applyOptimisticRating', () => {

	const mine = toServerRating({ rating: 5, comment: 'Todo perfecto', tags: ['rapido'] }, { editable_until: '2026-10-22T18:00:00.000Z' })

	test('toServerRating devuelve la forma del backend (rating string)', () => {
		expect(mine).toMatchObject({ rating: '5', comment: 'Todo perfecto', tags: ['rapido'], editable_until: '2026-10-22T18:00:00.000Z' })
	})

	test('orden: escribe my_rating solo en esa orden', () => {
		const offer = flexible({ Orders: [order(), order({ uuid: 'ord-2' })] })
		const next = applyOptimisticRating(offer, 'ord-1', mine)
		expect(next.Orders[0].my_rating.rating).toBe('5')
		expect(next.Orders[1].my_rating).toBeNull()
		expect(offer.Orders[0].my_rating).toBeNull() // no muta
	})

	test('fija: añade mi fila (y luego la encuentra) o reescribe la existente', () => {
		const added = applyOptimisticRating(fixed(), null, mine)
		expect(myRatingOf(added, null).rating).toBe(5)
		const edited = applyOptimisticRating(added, null, { ...mine, rating: '3' })
		expect(edited.Ratings).toHaveLength(1)
		expect(myRatingOf(edited, null).rating).toBe(3)
	})
})

test('la respuesta del PATCH queda con la forma del detalle (rating como string, etiquetas limpias)', () => {
	expect(fromEditResponse({ rating: 4, comment: null, tags: ['confiable', 'otra'], created_at: 'c', updated_at: 'u', editable_until: 'e' }))
		.toEqual({ rating: '4', comment: null, tags: ['confiable'], created_at: 'c', updated_at: 'u', editable_until: 'e' })
	expect(fromEditResponse({ rating: 5, comment: 'ok', tags: null }).tags).toEqual([])
})
