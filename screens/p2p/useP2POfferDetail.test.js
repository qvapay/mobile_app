/**
 * Unit tests for the P2P offer lifecycle hook — node environment with the API,
 * theme, presence and storage mocked (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Share: {
		share: jest.fn(),
		sharedAction: 'sharedAction',
		dismissedAction: 'dismissedAction',
	},
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
}))
jest.mock('../../theme/ThemeContext', () => ({
	useTheme: () => ({
		theme: { colors: { warning: '#ff9f43', success: '#7BFFB1', danger: '#DB253E', secondaryText: '#9DA3B4' } },
	}),
}))
jest.mock('../../hooks/OnlineStatusContext', () => ({
	useOnlineStatus: () => ({
		trackUsers: jest.fn(),
		untrackUsers: jest.fn(),
		isUserOnline: jest.fn(() => false),
	}),
}))
jest.mock('../../api/p2pApi', () => ({
	p2pApi: {
		show: jest.fn(),
		cancel: jest.fn(),
		markPaid: jest.fn(),
		confirmReceived: jest.fn(),
		apply: jest.fn(),
		edit: jest.fn(),
		rateOffer: jest.fn(),
		editRating: jest.fn(),
		peerProfile: jest.fn(),
	},
}))
jest.mock('../../helpers/inAppReview', () => ({ maybeRequestReview: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { Share } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { p2pApi } from '../../api/p2pApi'
import { maybeRequestReview } from '../../helpers/inAppReview'
import { toast } from 'sonner-native'
import useP2POfferDetail from './useP2POfferDetail'

const CREATOR = { uuid: 'creator-uuid' }
const PEER = { uuid: 'peer-uuid' }

const makeOffer = (overrides = {}) => ({
	uuid: 'offer-1',
	status: 'open',
	type: 'buy',
	amount: '10.00',
	receive: '9.50',
	rating: 0,
	only_vip: 0,
	message: '',
	User: CREATOR,
	Peer: null,
	...overrides,
})

const renderDetail = async ({ offer, viewer, chatLive = false, orderUuid = null, promptRate = false } = {}) => {
	const result = { current: null }
	const fetchChat = jest.fn()
	const navigation = { navigate: jest.fn(), dispatch: jest.fn() }
	const chatStreamLiveRef = { current: chatLive }
	p2pApi.show.mockResolvedValue({ success: true, data: { p2p: offer } })
	const Harness = () => {
		result.current = useP2POfferDetail({
			p2p_uuid: offer.uuid,
			orderUuid,
			promptRate,
			user: viewer,
			navigation,
			fetchChat,
			chatStreamLiveRef,
		})
		return null
	}
	let root
	await act(async () => { root = create(<Harness />) })
	return { result, fetchChat, navigation, root }
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	AsyncStorage.getItem.mockResolvedValue(null)
	AsyncStorage.setItem.mockResolvedValue()
	p2pApi.peerProfile.mockResolvedValue({ success: false })
})
afterEach(() => { jest.useRealTimers() })

describe('cache-first load', () => {
	test('renders the cached snapshot instantly, then the server refresh rewrites the cache', async () => {
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify(makeOffer({ amount: '5.00' })))
		const fresh = makeOffer({ amount: '10.00' })
		const { result } = await renderDetail({ offer: fresh, viewer: { uuid: 'stranger' } })
		expect(AsyncStorage.getItem).toHaveBeenCalledWith('p2p_cache_offer-1')
		expect(result.current.p2p.amount).toBe('10.00') // fresh data won
		expect(AsyncStorage.setItem).toHaveBeenCalledWith('p2p_cache_offer-1', JSON.stringify(fresh))
	})

	test('a failed fetch surfaces the error', async () => {
		const offer = makeOffer()
		const { result } = await (async () => {
			p2pApi.show.mockResolvedValue({ success: false, error: 'Oferta no encontrada' })
			const failed = { current: null }
			const Harness = () => {
				failed.current = useP2POfferDetail({
					p2p_uuid: offer.uuid,
					user: { uuid: 'x' },
					navigation: { navigate: jest.fn() },
					fetchChat: jest.fn(),
					chatStreamLiveRef: { current: false },
				})
				return null
			}
			await act(async () => { create(<Harness />) })
			return { result: failed }
		})()
		expect(result.current.error).toBe('Oferta no encontrada')
	})
})

describe('derived roles and permissions (buy offer: creator pays)', () => {
	test('creator on a processing offer can mark paid and cancel, not confirm', async () => {
		const offer = makeOffer({ status: 'processing', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		expect(result.current.isOwner).toBe(true)
		expect(result.current.isPayer).toBe(true)
		expect(result.current.canMarkPaid).toBe(true)
		expect(result.current.canCancel).toBe(true)
		expect(result.current.canConfirmReceived).toBe(false)
		expect(result.current.canApply).toBe(false)
		expect(result.current.counterparty).toBe(PEER)
	})

	test('peer on a processing buy offer is the receiver', async () => {
		const offer = makeOffer({ status: 'processing', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: PEER })
		expect(result.current.isPeer).toBe(true)
		expect(result.current.isReceiver).toBe(true)
		expect(result.current.canConfirmReceived).toBe(true)
		expect(result.current.canMarkPaid).toBe(false)
	})

	test('on a sell offer the roles flip: the peer pays', async () => {
		const offer = makeOffer({ type: 'sell', status: 'processing', Peer: PEER })
		const asPeer = await renderDetail({ offer, viewer: PEER })
		expect(asPeer.result.current.isPayer).toBe(true)
		const asCreator = await renderDetail({ offer, viewer: CREATOR })
		expect(asCreator.result.current.isReceiver).toBe(true)
	})

	test('a stranger can only apply to an open offer', async () => {
		const { result } = await renderDetail({ offer: makeOffer(), viewer: { uuid: 'stranger' } })
		expect(result.current.canApply).toBe(true)
		expect(result.current.canCancel).toBe(false)
	})

	test('rating unlocks only on completed offers', async () => {
		const { result } = await renderDetail({
			offer: makeOffer({ status: 'completed', Peer: PEER }),
			viewer: CREATOR,
		})
		expect(result.current.canRatePeer).toBe(true)
		expect(result.current.canCancel).toBe(false)
		const open = await renderDetail({ offer: makeOffer({ status: 'paid', Peer: PEER }), viewer: CREATOR })
		expect(open.result.current.canRatePeer).toBe(false)
	})
})

describe('status messages', () => {
	test('tells the payer to pay and the receiver to wait while processing', async () => {
		const offer = makeOffer({ status: 'processing', Peer: PEER })
		const payer = await renderDetail({ offer, viewer: CREATOR })
		expect(payer.result.current.statusMessage.text).toBe('Realiza el pago y marca como pagado')
		const receiver = await renderDetail({ offer, viewer: PEER })
		expect(receiver.result.current.statusMessage.text).toBe('Esperando que el comprador marque como pagado...')
	})

	test('revision surfaces the support-review warning to everyone', async () => {
		const { result } = await renderDetail({
			offer: makeOffer({ status: 'revision', Peer: PEER }),
			viewer: CREATOR,
		})
		expect(result.current.statusMessage.text).toBe('Esta oferta está en revisión por el equipo de soporte')
	})
})

describe('5s polling on active statuses', () => {
	test('polls the offer and the chat while the SSE stream is down', async () => {
		const { fetchChat } = await renderDetail({
			offer: makeOffer({ status: 'processing', Peer: PEER }),
			viewer: CREATOR,
			chatLive: false,
		})
		const showCalls = p2pApi.show.mock.calls.length
		await act(async () => { jest.advanceTimersByTime(5000) })
		expect(p2pApi.show.mock.calls.length).toBe(showCalls + 1)
		expect(fetchChat).toHaveBeenCalled()
	})

	test('skips the chat fetch while the SSE stream is live (offer status still polls)', async () => {
		const { fetchChat } = await renderDetail({
			offer: makeOffer({ status: 'processing', Peer: PEER }),
			viewer: CREATOR,
			chatLive: true,
		})
		const showCalls = p2pApi.show.mock.calls.length
		await act(async () => { jest.advanceTimersByTime(5000) })
		expect(p2pApi.show.mock.calls.length).toBe(showCalls + 1)
		expect(fetchChat).not.toHaveBeenCalled()
	})

	test('does not poll terminal statuses', async () => {
		await renderDetail({ offer: makeOffer({ status: 'completed', Peer: PEER }), viewer: CREATOR })
		const showCalls = p2pApi.show.mock.calls.length
		await act(async () => { jest.advanceTimersByTime(30000) })
		expect(p2pApi.show.mock.calls.length).toBe(showCalls)
	})
})

describe('trade actions behind the themed confirmation modal', () => {
	test('handleCancel only opens the modal; confirmModalAction cancels and closes it', async () => {
		p2pApi.cancel.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'open' })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.handleCancel() })
		expect(result.current.confirmModal).toBe('cancel')
		expect(p2pApi.cancel).not.toHaveBeenCalled() // waiting on the modal
		await act(async () => { await result.current.confirmModalAction() })
		expect(p2pApi.cancel).toHaveBeenCalledWith('offer-1', undefined)
		expect(toast.success).toHaveBeenCalledWith('Oferta cancelada')
		expect(result.current.confirmModal).toBe(null)
	})

	test('closeConfirmModal dismisses without running the action', async () => {
		const { result } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		act(() => { result.current.handleCancel() })
		act(() => { result.current.closeConfirmModal() })
		expect(result.current.confirmModal).toBe(null)
		expect(p2pApi.cancel).not.toHaveBeenCalled()
	})

	test('handleMarkPaid confirms through the modal and sends the transaction id', async () => {
		p2pApi.markPaid.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'processing', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.setTxIdInput('tx-123') })
		act(() => { result.current.handleMarkPaid() })
		expect(result.current.confirmModal).toBe('markPaid')
		await act(async () => { await result.current.confirmModalAction() })
		expect(p2pApi.markPaid).toHaveBeenCalledWith('offer-1', 'tx-123', undefined)
		expect(toast.success).toHaveBeenCalledWith('Pago marcado como realizado')
	})

	test('handleConfirmReceived releases the escrow after the modal confirm', async () => {
		p2pApi.confirmReceived.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'paid', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: PEER })
		act(() => { result.current.handleConfirmReceived() })
		expect(result.current.confirmModal).toBe('received')
		await act(async () => { await result.current.confirmModalAction() })
		expect(p2pApi.confirmReceived).toHaveBeenCalledWith('offer-1', undefined)
		expect(toast.success).toHaveBeenCalledWith('Pago recibido. Fondos liberados')
	})

	test('an API failure on cancel toasts the backend error and still closes the modal', async () => {
		p2pApi.cancel.mockResolvedValue({ success: false, error: 'Ya procesada' })
		const { result } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		act(() => { result.current.handleCancel() })
		await act(async () => { await result.current.confirmModalAction() })
		expect(toast.error).toHaveBeenCalledWith('No se pudo cancelar', { description: 'Ya procesada' })
		expect(result.current.confirmModal).toBe(null)
	})
})

describe('apply flow (in-app confirmation modal)', () => {
	test('handleApply only opens the modal; handleApplyConfirm applies and closes it', async () => {
		p2pApi.apply.mockResolvedValue({ success: true })
		const { result } = await renderDetail({ offer: makeOffer(), viewer: { uuid: 'stranger' } })
		act(() => { result.current.handleApply() })
		expect(result.current.showApplyConfirm).toBe(true)
		expect(p2pApi.apply).not.toHaveBeenCalled()
		await act(async () => { await result.current.handleApplyConfirm() })
		expect(p2pApi.apply).toHaveBeenCalledWith('offer-1')
		expect(result.current.showApplyConfirm).toBe(false)
		expect(toast.success).toHaveBeenCalledWith('Aplicado')
	})
})

describe('edit modal', () => {
	test('openEditModal populates the fields from the current offer', async () => {
		const offer = makeOffer({ amount: '25.00', receive: '24.00', message: 'hola', only_vip: 1 })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.openEditModal() })
		expect(result.current.edit).toMatchObject({
			show: true, amount: '25.00', receive: '24.00', message: 'hola', onlyVip: true,
		})
	})

	test('validates the amount range and the receive value locally', async () => {
		const { result } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		act(() => { result.current.openEditModal() })
		act(() => { result.current.setEdit('amount', '0.05') })
		await act(async () => { await result.current.handleEdit() })
		expect(toast.error).toHaveBeenCalledWith('Monto inválido', expect.anything())
		act(() => { result.current.setEdit('amount', '10') })
		act(() => { result.current.setEdit('receive', '0') })
		await act(async () => { await result.current.handleEdit() })
		expect(toast.error).toHaveBeenCalledWith('Valor inválido', expect.anything())
		expect(p2pApi.edit).not.toHaveBeenCalled()
	})

	test('blocks a sell-offer amount increase beyond the available balance', async () => {
		const offer = makeOffer({ type: 'sell', amount: '10.00' })
		const { result } = await renderDetail({ offer, viewer: { ...CREATOR, balance: '5.00' } })
		act(() => { result.current.openEditModal() })
		act(() => { result.current.setEdit('amount', '20') })
		await act(async () => { await result.current.handleEdit() })
		expect(toast.error).toHaveBeenCalledWith('Balance insuficiente', expect.anything())
		expect(p2pApi.edit).not.toHaveBeenCalled()
	})

	test('a valid edit sends the normalized payload and closes the modal', async () => {
		p2pApi.edit.mockResolvedValue({ success: true })
		const { result } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		act(() => { result.current.openEditModal() })
		act(() => { result.current.setEdit('amount', '15') })
		act(() => { result.current.setEdit('receive', '14.5') })
		act(() => { result.current.setEdit('message', '  rápido  ') })
		act(() => { result.current.setEdit('onlyVip', true) })
		await act(async () => { await result.current.handleEdit() })
		expect(p2pApi.edit).toHaveBeenCalledWith('offer-1', {
			amount: 15, receive: 14.5, only_vip: 1, message: 'rápido',
		})
		expect(result.current.edit.show).toBe(false)
		expect(toast.success).toHaveBeenCalledWith('Oferta actualizada')
	})
})

describe('rating sheet (fixed offers)', () => {

	// currentUserId / rater / rated son ids INTERNOS del backend (no uuids)
	const completed = (overrides = {}) => makeOffer({ status: 'completed', Peer: PEER, Ratings: [], currentUserId: '1', ...overrides })
	const RATED = { ...completed(), Ratings: [{ rater: '1', rated: '2', rating: '5', comment: null, tags: [] }] }

	test('sin mi fila en Ratings se puede valorar; con ella solo se ven mis estrellas', async () => {
		const fresh = await renderDetail({ offer: completed(), viewer: CREATOR })
		expect(fresh.result.current.canRatePeer).toBe(true)
		expect(fresh.result.current.myRating).toBeNull()
		const rated = await renderDetail({ offer: completed({ Ratings: [{ rater: '1', rated: '2', rating: '4', comment: 'ok', tags: ['rapido'] }] }), viewer: CREATOR })
		expect(rated.result.current.canRatePeer).toBe(false)
		expect(rated.result.current.myRating).toMatchObject({ rating: 4, comment: 'ok', tags: ['rapido'] })
	})

	test('editar dentro del plazo: la hoja abre precargada y el PATCH lleva solo lo que cambió', async () => {
		const until = new Date(Date.now() + 3600e3).toISOString()
		const mine = { rater: '1', rated: '2', rating: '4', comment: 'ok', tags: ['rapido'], editable_until: until }
		p2pApi.editRating.mockResolvedValue({ success: true, data: { message: 'Rating updated', rating: 5, comment: 'ok', tags: ['rapido', 'confiable'], created_at: null, updated_at: null, editable_until: until } })
		const { result } = await renderDetail({ offer: completed({ Ratings: [mine] }), viewer: CREATOR })
		expect(result.current.canEditMyRating).toBe(true)
		act(() => { result.current.openRateSheet() })
		expect(result.current.rateTarget).toMatchObject({ order: null, mode: 'edit', mine: { rating: 4, comment: 'ok', tags: ['rapido'], editableUntil: until } })
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: completed({ Ratings: [{ ...mine, rating: '5', tags: ['rapido', 'confiable'] }] }) } })
		await act(async () => { await result.current.submitRate({ rating: 5, tags: ['rapido', 'confiable'], comment: 'ok' }) })
		expect(p2pApi.editRating).toHaveBeenCalledWith('offer-1', { rating: 5, tags: ['rapido', 'confiable'] })
		expect(p2pApi.rateOffer).not.toHaveBeenCalled()
		expect(toast.success).toHaveBeenCalledWith('Valoración actualizada')
		expect(result.current.rateTarget).toBeNull()
		expect(result.current.myRating).toMatchObject({ rating: 5, tags: ['rapido', 'confiable'] })
	})

	test('tocar la 4ª estrella vacía abre la hoja de crear con 4 marcadas', async () => {
		const { result } = await renderDetail({ offer: completed(), viewer: CREATOR })
		act(() => { result.current.openRateSheet(undefined, 4) })
		expect(result.current.rateTarget).toMatchObject({ mode: 'create', initialRating: 4 })
	})

	test('plazo vencido (o sin editable_until): mis estrellas son de solo lectura y no se abre nada', async () => {
		for (const editable_until of [new Date(Date.now() - 1000).toISOString(), null]) {
			const offer = completed({ Ratings: [{ rater: '1', rated: '2', rating: '4', comment: null, tags: [], editable_until }] })
			const { result } = await renderDetail({ offer, viewer: CREATOR })
			expect(result.current.canEditMyRating).toBe(false)
			act(() => { result.current.openRateSheet() })
			expect(result.current.rateTarget).toBeNull()
		}
	})

	test('RATING_EDIT_EXPIRED al guardar: cierra, refresca y dice por qué', async () => {
		const until = new Date(Date.now() + 3600e3).toISOString()
		p2pApi.editRating.mockResolvedValue({ success: false, status: 403, error: 'El plazo para cambiar esta valoración terminó', details: { code: 'RATING_EDIT_EXPIRED', editable_until: null } })
		const { result } = await renderDetail({ offer: completed({ Ratings: [{ rater: '1', rated: '2', rating: '4', comment: null, tags: [], editable_until: until }] }), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		const showCalls = p2pApi.show.mock.calls.length
		await act(async () => { await result.current.submitRate({ rating: 2, tags: [], comment: '' }) })
		expect(toast.error).toHaveBeenCalledWith('No se pudo actualizar la valoración', { description: 'El plazo para cambiar esta valoración terminó' })
		expect(result.current.rateTarget).toBeNull()
		expect(p2pApi.show.mock.calls.length).toBe(showCalls + 1)
	})

	test('sin cambios no se manda nada (el servidor respondería NOTHING_TO_UPDATE)', async () => {
		const until = new Date(Date.now() + 3600e3).toISOString()
		const { result } = await renderDetail({ offer: completed({ Ratings: [{ rater: '1', rated: '2', rating: '4', comment: 'ok', tags: [], editable_until: until }] }), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		await act(async () => { await result.current.submitRate({ rating: 4, tags: [], comment: ' ok ' }) })
		expect(p2pApi.editRating).not.toHaveBeenCalled()
	})

	test('openRateSheet apunta a la contraparte; submitRate manda rating numérico, cierra y 5★ pide reseña', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: true, data: { message: 'Rating created', rating: 5, editable_until: null } })
		const { result } = await renderDetail({ offer: completed(), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		expect(result.current.rateTarget).toMatchObject({ order: null, counterparty: PEER, rated: false })
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: RATED } })
		await act(async () => { await result.current.submitRate({ rating: 5, tags: ['rapido'], comment: '  todo bien ' }) })
		expect(p2pApi.rateOffer).toHaveBeenCalledWith('offer-1', { rating: 5, comment: 'todo bien', tags: ['rapido'] })
		expect(toast.success).toHaveBeenCalledWith('¡Valoración enviada!')
		expect(result.current.rateTarget).toBeNull()
		expect(result.current.canRatePeer).toBe(false)
		expect(result.current.myRating.rating).toBe(5)
		expect(maybeRequestReview).not.toHaveBeenCalled()
		await act(async () => { jest.advanceTimersByTime(1500) })
		expect(maybeRequestReview).toHaveBeenCalled()
	})

	test('un doble toque manda UNA sola valoración', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: true, data: {} })
		const { result } = await renderDetail({ offer: completed(), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		await act(async () => {
			const submit = result.current.submitRate
			await Promise.all([submit({ rating: 4, tags: [], comment: '' }), submit({ rating: 4, tags: [], comment: '' })])
		})
		expect(p2pApi.rateOffer).toHaveBeenCalledTimes(1)
	})

	test('"Ya has calificado" no es un error: cierra y refresca', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: false, status: 400, error: 'Ya has calificado esta oferta', details: { code: 'ALREADY_RATED' } })
		const { result } = await renderDetail({ offer: completed(), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		const showCalls = p2pApi.show.mock.calls.length
		await act(async () => { await result.current.submitRate({ rating: 3, tags: [], comment: '' }) })
		expect(toast.error).not.toHaveBeenCalled()
		expect(result.current.rateTarget).toBeNull()
		expect(p2pApi.show.mock.calls.length).toBe(showCalls + 1)
	})

	test('cualquier otro fallo enseña el texto del backend y deja la hoja abierta', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: false, status: 400, error: 'Datos inválidos' })
		const { result } = await renderDetail({ offer: completed(), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		await act(async () => { await result.current.submitRate({ rating: 3, tags: [], comment: '' }) })
		expect(toast.error).toHaveBeenCalledWith('No se pudo calificar', { description: 'Datos inválidos' })
		expect(result.current.rateTarget).not.toBeNull()
		await act(async () => { jest.advanceTimersByTime(5000) })
		expect(maybeRequestReview).not.toHaveBeenCalled()
	})

	test('sin estrellas no se envía nada', async () => {
		const { result } = await renderDetail({ offer: completed(), viewer: CREATOR })
		act(() => { result.current.openRateSheet() })
		await act(async () => { await result.current.submitRate({ rating: 0, tags: [], comment: 'hola' }) })
		expect(p2pApi.rateOffer).not.toHaveBeenCalled()
	})

	test('desde una push de trato cerrado (rate) la hoja sale sola, una sola vez', async () => {
		const { result } = await renderDetail({ offer: completed(), viewer: PEER, promptRate: true })
		expect(result.current.rateTarget).toBeNull() // espera a que cierre el modal anterior
		await act(async () => { jest.advanceTimersByTime(400) })
		expect(result.current.rateTarget).toMatchObject({ order: null, counterparty: CREATOR })
		act(() => { result.current.closeRateSheet() })
		await act(async () => { jest.advanceTimersByTime(5000) })
		expect(result.current.rateTarget).toBeNull()
	})

	test('con la push de un trato ya valorado no sale nada', async () => {
		const { result } = await renderDetail({ offer: RATED, viewer: CREATOR, promptRate: true })
		await act(async () => { jest.advanceTimersByTime(400) })
		expect(result.current.rateTarget).toBeNull()
	})

	test('si el trato se completa con la pantalla abierta, se pide la valoración', async () => {
		const { result } = await renderDetail({ offer: completed({ status: 'paid' }), viewer: CREATOR })
		expect(result.current.canRatePeer).toBe(false)
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: completed() } })
		await act(async () => { jest.advanceTimersByTime(5000) }) // el poll trae `completed`
		await act(async () => { jest.advanceTimersByTime(400) })
		expect(result.current.rateTarget).toMatchObject({ order: null, counterparty: PEER })
	})

	test('liberar abre la hoja para valorar a la contraparte', async () => {
		p2pApi.confirmReceived.mockResolvedValue({ success: true })
		const { result } = await renderDetail({ offer: completed({ status: 'paid' }), viewer: PEER })
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: completed() } })
		act(() => { result.current.handleConfirmReceived() })
		await act(async () => { await result.current.confirmModalAction() })
		await act(async () => { jest.advanceTimersByTime(400) })
		expect(result.current.rateTarget).toMatchObject({ order: null, counterparty: CREATOR })
	})
})

describe('share and peer profile', () => {
	test('handleShareIntent shares the public offer URL', async () => {
		Share.share.mockResolvedValue({ action: 'sharedAction' })
		const { result } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		await act(async () => { await result.current.handleShareIntent() })
		expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({
			url: 'https://www.qvapay.com/p2p/offer-1',
		}))
		expect(toast.success).toHaveBeenCalledWith('Oferta compartida')
		Share.share.mockResolvedValue({ action: 'dismissedAction' })
		await act(async () => { await result.current.handleShareIntent() })
		expect(toast.info).toHaveBeenCalledWith('Compartir cancelado')
	})

	test('openPeerProfile navigates to the peer, skipping self-taps', async () => {
		const { result, navigation } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		act(() => { result.current.openPeerProfile(CREATOR) })
		expect(navigation.navigate).not.toHaveBeenCalled()
		act(() => { result.current.openPeerProfile(PEER) })
		expect(navigation.navigate).toHaveBeenCalledWith('P2PUser', { uuid: PEER.uuid })
	})

	test('surfaces the displayed user stats when the profile loads', async () => {
		p2pApi.peerProfile.mockResolvedValue({
			success: true,
			data: { stats: { completed: 12 }, receivedRatings: { total: 7 } },
		})
		const { result } = await renderDetail({ offer: makeOffer(), viewer: { uuid: 'stranger' } })
		expect(p2pApi.peerProfile).toHaveBeenCalledWith(CREATOR.uuid)
		expect(result.current.peerStats).toEqual({ completed: 12 })
		expect(result.current.peerReviewsCount).toBe(7)
	})
})

describe('range offers (offer_kind flexible)', () => {

	const order = (overrides = {}) => ({
		uuid: 'ord-1', amount: '4.00', receive: '2000', status: 'processing', created_at: '2026-10-10T18:00:00.000Z',
		payment_window_expires_at: '2026-10-10T18:15:00.000Z', tx_id: '', Taker: PEER, ...overrides,
	})
	// Venta por rango de $10 (2–5) con tasa 500
	const makeFlexible = (overrides = {}) => makeOffer({
		type: 'sell', amount: '10.00', receive: '5000', offer_kind: 'flexible',
		available_amount: '10.00', reserved_amount: '0.00', order_min: '2.00', order_max: '5.00',
		can_take_flexible: true, Orders: [], OrdersSummary: null, Peer: {},
		...overrides,
	})

	test('el taker con una orden viva entra directo a ella (proyectada como una oferta fixed)', async () => {
		p2pApi.markPaid.mockResolvedValue({ success: true })
		const offer = makeFlexible({ available_amount: '6.00', reserved_amount: '4.00', Orders: [order()] })
		const { result } = await renderDetail({ offer, viewer: PEER })
		expect(result.current.isFlexibleOverview).toBe(false)
		expect(result.current.selectedOrder.uuid).toBe('ord-1')
		expect(result.current.p2p).toMatchObject({ status: 'processing', amount: '4.00', receive: '2000', payment_window_expires_at: '2026-10-10T18:15:00.000Z' })
		// Venta: el taker paga el fiat → cancela (no disputa)
		expect(result.current.isPayer).toBe(true)
		expect(result.current.canCancel).toBe(true)
		expect(result.current.canDispute).toBe(false)
		expect(result.current.canApply).toBe(false)
		act(() => { result.current.setTxIdInput('tx-9') })
		act(() => { result.current.handleMarkPaid() })
		await act(async () => { await result.current.confirmModalAction() })
		expect(p2pApi.markPaid).toHaveBeenCalledWith('offer-1', 'tx-9', 'ord-1')
	})

	test('el dueño ve la oferta y no puede cancelarla entera con órdenes vivas; abrir una orden es un PUSH', async () => {
		const offer = makeFlexible({ Orders: [order()], OrdersSummary: { active: 1, completed: 0, cancelled: 0 } })
		const { result, navigation } = await renderDetail({ offer, viewer: CREATOR })
		expect(result.current.isFlexibleOverview).toBe(true)
		expect(result.current.canCancel).toBe(false)
		expect(result.current.canApply).toBe(false)
		act(() => { result.current.openOrder('ord-1') })
		expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'PUSH', payload: { name: 'P2POffer', params: { p2p_uuid: 'offer-1', order: 'ord-1' } } })
	})

	test('el dueño de una venta no cancela la orden: abre disputa contra la misma ruta con ?order', async () => {
		p2pApi.cancel.mockResolvedValue({ success: true, data: { status: 'revision' } })
		const offer = makeFlexible({ Orders: [order({ status: 'paid' })] })
		const { result } = await renderDetail({ offer, viewer: CREATOR, orderUuid: 'ord-1' })
		expect(result.current.isReceiver).toBe(true)
		expect(result.current.canCancel).toBe(false)
		expect(result.current.canDispute).toBe(true)
		expect(result.current.canConfirmReceived).toBe(true)
		act(() => { result.current.handleDispute() })
		expect(result.current.confirmModal).toBe('dispute')
		await act(async () => { await result.current.confirmModalAction() })
		expect(p2pApi.cancel).toHaveBeenCalledWith('offer-1', 'ord-1')
		expect(toast.success).toHaveBeenCalledWith('Disputa abierta: un moderador revisará la orden')
	})

	test('en revisión quien recibe el fiat aún puede liberar, pero no repetir la disputa', async () => {
		const offer = makeFlexible({ Orders: [order({ status: 'revision' })] })
		const { result } = await renderDetail({ offer, viewer: CREATOR, orderUuid: 'ord-1' })
		expect(result.current.canConfirmReceived).toBe(true)
		expect(result.current.canDispute).toBe(false)
		expect(result.current.canRatePeer).toBe(false)
	})

	test('tomar una parte manda el monto y pasa a la orden creada', async () => {
		const offer = makeFlexible()
		const { result } = await renderDetail({ offer, viewer: { uuid: 'stranger', balance: '0' } })
		expect(result.current.canApply).toBe(true)
		p2pApi.apply.mockResolvedValue({ success: true, data: { order: 'ord-new' } })
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: makeFlexible({ available_amount: '6.00', Orders: [order({ uuid: 'ord-new', Taker: { uuid: 'stranger' } })] }) } })
		act(() => { result.current.handleApply() })
		act(() => { result.current.setApplyAmount('4') })
		await act(async () => { await result.current.handleApplyConfirm() })
		expect(p2pApi.apply).toHaveBeenCalledWith('offer-1', 4)
		expect(result.current.showApplyConfirm).toBe(false)
		expect(result.current.selectedOrder.uuid).toBe('ord-new')
	})

	test('un monto fuera de rango no llama al backend y deja el modal abierto', async () => {
		const { result } = await renderDetail({ offer: makeFlexible(), viewer: { uuid: 'stranger' } })
		act(() => { result.current.handleApply() })
		act(() => { result.current.setApplyAmount('6') })
		await act(async () => { await result.current.handleApplyConfirm() })
		expect(p2pApi.apply).not.toHaveBeenCalled()
		expect(result.current.showApplyConfirm).toBe(true)
	})

	test('ORDER_ALREADY_ACTIVE lleva a la orden viva en vez de ofrecer otra', async () => {
		const { result } = await renderDetail({ offer: makeFlexible(), viewer: { uuid: 'stranger' } })
		p2pApi.apply.mockResolvedValue({ success: false, status: 409, details: { code: 'ORDER_ALREADY_ACTIVE' } })
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: makeFlexible({ Orders: [order({ uuid: 'ord-live', Taker: { uuid: 'stranger' } })] }) } })
		act(() => { result.current.setApplyAmount('3') })
		await act(async () => { await result.current.handleApplyConfirm() })
		expect(toast.info).toHaveBeenCalledWith('Ya tienes una orden activa en esta oferta')
		expect(result.current.selectedOrder.uuid).toBe('ord-live')
	})

	test('sin permiso para tomarlas: aviso VIP en vez del botón', async () => {
		const { result } = await renderDetail({ offer: makeFlexible({ can_take_flexible: false }), viewer: { uuid: 'stranger' } })
		expect(result.current.canApply).toBe(false)
		expect(result.current.flexibleLocked).toBe(true)
	})

	test('una orden completada se valora: dueño y taker sí; con my_rating, mis estrellas; la oferta nunca', async () => {
		const offer = makeFlexible({ status: 'completed', available_amount: '0.00', Orders: [order({ status: 'completed' })] })
		const maker = await renderDetail({ offer, viewer: CREATOR, orderUuid: 'ord-1' })
		expect(maker.result.current.canRatePeer).toBe(true)
		const taker = await renderDetail({ offer, viewer: PEER, orderUuid: 'ord-1' })
		expect(taker.result.current.canRatePeer).toBe(true)
		const overview = await renderDetail({ offer, viewer: CREATOR })
		expect(overview.result.current.isFlexibleOverview).toBe(true)
		expect(overview.result.current.canRatePeer).toBe(false)
		expect(overview.result.current.myRating).toBeNull()
		const rated = makeFlexible({ Orders: [order({ status: 'completed', my_rating: { rating: '5', comment: null, created_at: '2026-10-19T18:02:11.000Z' } })] })
		const done = await renderDetail({ offer: rated, viewer: CREATOR, orderUuid: 'ord-1' })
		expect(done.result.current.canRatePeer).toBe(false)
		expect(done.result.current.myRating.rating).toBe(5)
	})

	test('valorar una orden desde la lista: el dueño valora al taker y order viaja en el body', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: true, data: { editable_until: null } })
		const offer = makeFlexible({ Orders: [order({ status: 'completed' }), order({ uuid: 'ord-2', status: 'completed', Taker: { uuid: 'other' } })] })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.openRateSheet('ord-2') })
		expect(result.current.rateTarget).toMatchObject({ order: 'ord-2', counterparty: { uuid: 'other' }, amount: '4.00' })
		await act(async () => { await result.current.submitRate({ rating: 4, tags: [], comment: '' }) })
		expect(p2pApi.rateOffer).toHaveBeenCalledWith('offer-1', { rating: 4, order: 'ord-2' })
	})

	test('editar mi valoración de una orden: order viaja en el body del PATCH y vaciar el comentario lo borra', async () => {
		const until = new Date(Date.now() + 3600e3).toISOString()
		p2pApi.editRating.mockResolvedValue({ success: true, data: { rating: 3, comment: null, tags: [], created_at: null, updated_at: null, editable_until: until } })
		const offer = makeFlexible({ Orders: [order({ status: 'completed', my_rating: { rating: '3', comment: 'lento', tags: [], created_at: '2026-10-19T18:02:11.000Z', editable_until: until } })] })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.openRateSheet('ord-1') })
		expect(result.current.rateTarget).toMatchObject({ order: 'ord-1', mode: 'edit', mine: { rating: 3, comment: 'lento' } })
		await act(async () => { await result.current.submitRate({ rating: 3, tags: [], comment: '' }) })
		expect(p2pApi.editRating).toHaveBeenCalledWith('offer-1', { comment: null, order: 'ord-1' })
	})

	test('el taker valora al dueño (Peer llega vacío en las por rango)', async () => {
		const offer = makeFlexible({ Orders: [order({ status: 'completed' })] })
		const { result } = await renderDetail({ offer, viewer: PEER, orderUuid: 'ord-1' })
		act(() => { result.current.openRateSheet() })
		expect(result.current.rateTarget).toMatchObject({ order: 'ord-1', counterparty: CREATOR })
	})

	test('el taker que libera se queda en su orden y se le abre la hoja', async () => {
		p2pApi.confirmReceived.mockResolvedValue({ success: true })
		// Compra por rango: el dueño paga el fiat, el taker lo recibe y libera
		const offer = makeFlexible({ type: 'buy', Orders: [order({ status: 'paid' })] })
		const { result } = await renderDetail({ offer, viewer: PEER })
		expect(result.current.selectedOrder.uuid).toBe('ord-1') // elegida sola
		expect(result.current.canConfirmReceived).toBe(true)
		p2pApi.show.mockResolvedValue({ success: true, data: { p2p: makeFlexible({ type: 'buy', Orders: [order({ status: 'completed' })] }) } })
		act(() => { result.current.handleConfirmReceived() })
		await act(async () => { await result.current.confirmModalAction() })
		expect(p2pApi.confirmReceived).toHaveBeenCalledWith('offer-1', 'ord-1')
		await act(async () => { jest.advanceTimersByTime(400) })
		// Ya no está viva, pero la pantalla no salta a la vista de la oferta
		expect(result.current.selectedOrder.uuid).toBe('ord-1')
		expect(result.current.canRatePeer).toBe(true)
		expect(result.current.rateTarget).toMatchObject({ order: 'ord-1', counterparty: CREATOR })
	})

	test('una orden cerrada del taker permite volver a la oferta', async () => {
		const offer = makeFlexible({ Orders: [order({ status: 'completed' })] })
		const { result } = await renderDetail({ offer, viewer: PEER, orderUuid: 'ord-1' })
		expect(result.current.canBackToOffer).toBe(true)
		act(() => { result.current.backToOffer() })
		expect(result.current.isFlexibleOverview).toBe(true)
		expect(result.current.canApply).toBe(true)
	})
})
