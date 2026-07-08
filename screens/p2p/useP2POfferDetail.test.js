/**
 * Unit tests for the P2P offer lifecycle hook — node environment with the API,
 * theme, presence, storage and native dialogs mocked (see keypadAmount.test.js
 * for why node env).
 * @jest-environment node
 */
jest.mock('react-native', () => ({
	Alert: { alert: jest.fn() },
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
		peerProfile: jest.fn(),
	},
}))
jest.mock('../../helpers/inAppReview', () => ({ maybeRequestReview: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { Alert, Share } from 'react-native'
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

const renderDetail = async ({ offer, viewer, chatLive = false } = {}) => {
	const result = { current: null }
	const fetchChat = jest.fn()
	const navigation = { navigate: jest.fn() }
	const chatStreamLiveRef = { current: chatLive }
	p2pApi.show.mockResolvedValue({ success: true, data: { p2p: offer } })
	const Harness = () => {
		result.current = useP2POfferDetail({
			p2p_uuid: offer.uuid,
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

// Press a button on the last Alert by its position (0 = cancel, 1 = confirm)
const pressAlertButton = async (index) => {
	const buttons = Alert.alert.mock.calls.at(-1)[2]
	await act(async () => { await buttons[index].onPress?.() })
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

describe('trade actions behind native confirmation dialogs', () => {
	test('handleCancel cancels only after the destructive confirm', async () => {
		p2pApi.cancel.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'open' })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.handleCancel() })
		expect(p2pApi.cancel).not.toHaveBeenCalled() // waiting on the dialog
		await pressAlertButton(1)
		expect(p2pApi.cancel).toHaveBeenCalledWith('offer-1')
		expect(toast.success).toHaveBeenCalledWith('Oferta cancelada')
	})

	test('handleMarkPaid sends the optional transaction id', async () => {
		p2pApi.markPaid.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'processing', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		act(() => { result.current.setTxIdInput('tx-123') })
		act(() => { result.current.handleMarkPaid() })
		await pressAlertButton(1)
		expect(p2pApi.markPaid).toHaveBeenCalledWith('offer-1', 'tx-123')
		expect(toast.success).toHaveBeenCalledWith('Pago marcado como realizado')
	})

	test('handleConfirmReceived releases the escrow after confirm', async () => {
		p2pApi.confirmReceived.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'paid', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: PEER })
		act(() => { result.current.handleConfirmReceived() })
		await pressAlertButton(1)
		expect(p2pApi.confirmReceived).toHaveBeenCalledWith('offer-1')
		expect(toast.success).toHaveBeenCalledWith('Pago recibido. Fondos liberados')
	})

	test('an API failure on cancel toasts the backend error', async () => {
		p2pApi.cancel.mockResolvedValue({ success: false, error: 'Ya procesada' })
		const { result } = await renderDetail({ offer: makeOffer(), viewer: CREATOR })
		act(() => { result.current.handleCancel() })
		await pressAlertButton(1)
		expect(toast.error).toHaveBeenCalledWith('No se pudo cancelar', { description: 'Ya procesada' })
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

describe('handleRate', () => {
	test('rates optimistically and a 5-star rating asks for a store review after 1.5s', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: true })
		const offer = makeOffer({ status: 'completed', Peer: PEER })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		await act(async () => { await result.current.handleRate(5) })
		expect(p2pApi.rateOffer).toHaveBeenCalledWith('offer-1', { rating: 5 })
		expect(result.current.rating).toBe(5)
		expect(maybeRequestReview).not.toHaveBeenCalled()
		await act(async () => { jest.advanceTimersByTime(1500) })
		expect(maybeRequestReview).toHaveBeenCalled()
	})

	test('a failed rating reverts to the stored value and never asks for review', async () => {
		p2pApi.rateOffer.mockResolvedValue({ success: false, error: 'nope' })
		const offer = makeOffer({ status: 'completed', Peer: PEER, rating: 3 })
		const { result } = await renderDetail({ offer, viewer: CREATOR })
		await act(async () => { await result.current.handleRate(4) })
		expect(result.current.rating).toBe(3)
		await act(async () => { jest.advanceTimersByTime(5000) })
		expect(maybeRequestReview).not.toHaveBeenCalled()
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
