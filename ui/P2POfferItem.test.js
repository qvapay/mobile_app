/**
 * Render tests for the P2P offer list card — node environment with the theme,
 * auth, presence and child particles mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../hooks/OnlineStatusContext', () => ({
	useOnlineStatus: () => ({ isUserOnline: jest.fn(() => true) }),
}))
jest.mock('./particles/QPCoin', () => 'QPCoin')
jest.mock('./particles/QPButton', () => 'QPButton')
jest.mock('./ProfileContainerHorizontal', () => 'ProfileContainerHorizontal')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import P2POfferItem from './P2POfferItem'

const CREATOR = { uuid: 'creator-uuid', username: 'creator' }
const VIEWER = { uuid: 'viewer-uuid', username: 'viewer' }

const makeOffer = (overrides = {}) => ({
	uuid: 'offer-1',
	type: 'buy',
	status: 'open',
	amount: '10.00',
	receive: '9.50',
	only_kyc: 0,
	only_vip: 0,
	private: 0,
	message: '',
	created_at: '2026-07-01T10:00:00Z',
	Coin: { name: 'Banco Metropolitano', logo: 'bandec' },
	User: CREATOR,
	Peer: null,
	...overrides,
})

const renderItem = (offer, props = {}) => {
	let tree
	act(() => { tree = create(<P2POfferItem offer={offer} navigation={{ navigate: jest.fn() }} {...props} />) })
	return tree
}

const textOf = (tree) => JSON.stringify(tree.toJSON())

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: VIEWER })
})

describe('rendered content', () => {
	test('shows coin name, amount x receive and the computed rate', () => {
		const tree = renderItem(makeOffer())
		const out = textOf(tree)
		expect(out).toContain('Banco Metropolitano')
		expect(out).toContain('10.00') // amount ($ renders as a separate text child)
		expect(out).toContain('9.50')
		expect(out).toContain('0.95') // receive / amount
	})

	test('buy offers get the green left accent, sell offers the red one', () => {
		const buy = renderItem(makeOffer()).toJSON()
		expect(JSON.stringify(buy.props.style)).toContain('#7BFFB1')
		const sell = renderItem(makeOffer({ type: 'sell' })).toJSON()
		expect(JSON.stringify(sell.props.style)).toContain('#DB253E')
	})

	test('renders the KYC / VIP / Privada badges only when flagged', () => {
		const plain = textOf(renderItem(makeOffer()))
		expect(plain).not.toContain('KYC')
		expect(plain).not.toContain('VIP')
		const flagged = textOf(renderItem(makeOffer({ only_kyc: 1, only_vip: 1, private: 1 })))
		expect(flagged).toContain('KYC')
		expect(flagged).toContain('VIP')
		expect(flagged).toContain('Privada')
	})

	test('shows the offer message row only when a message exists', () => {
		expect(textOf(renderItem(makeOffer({ message: 'Pago rápido por Zelle' })))).toContain('Pago rápido por Zelle')
		const bare = renderItem(makeOffer())
		expect(bare.root.findAllByType('FontAwesome6').some(i => i.props.name === 'message')).toBe(false)
	})
})

describe('status / action button', () => {
	const buttonOf = (tree) => tree.root.findByType('QPButton')

	test('a stranger sees the inverse action: Vender on buy, Comprar on sell', () => {
		expect(buttonOf(renderItem(makeOffer())).props.title).toBe('Vender')
		expect(buttonOf(renderItem(makeOffer({ type: 'sell' }))).props.title).toBe('Comprar')
	})

	test('the owner sees Editar on open offers', () => {
		useAuth.mockReturnValue({ user: CREATOR })
		expect(buttonOf(renderItem(makeOffer())).props.title).toBe('Editar')
	})

	test('terminal statuses render status chips', () => {
		expect(buttonOf(renderItem(makeOffer({ status: 'completed' }))).props.title).toBe('Finalizado')
		expect(buttonOf(renderItem(makeOffer({ status: 'paid' }))).props.title).toBe('Pagado')
		expect(buttonOf(renderItem(makeOffer({ status: 'revision' }))).props.title).toBe('Revisión')
		expect(buttonOf(renderItem(makeOffer({ status: 'cancelled' }))).props.title).toBe('Cancelado')
	})

	test('tapping the button navigates to the offer detail', () => {
		const navigation = { navigate: jest.fn() }
		let tree
		act(() => { tree = create(<P2POfferItem offer={makeOffer()} navigation={navigation} />) })
		act(() => { buttonOf(tree).props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'offer-1' })
	})

	test('show_buttons=false hides the action entirely (offer detail header)', () => {
		const tree = renderItem(makeOffer(), { show_buttons: false })
		expect(tree.root.findAllByType('QPButton')).toHaveLength(0)
	})
})

describe('counterparty row', () => {
	test('prefers the Peer over the creator and reports their online dot', () => {
		const peer = { uuid: 'peer-uuid', username: 'peer' }
		const tree = renderItem(makeOffer({ Peer: peer }))
		const profile = tree.root.findByType('ProfileContainerHorizontal')
		expect(profile.props.user).toBe(peer)
		expect(profile.props.isOnline).toBe(true)
	})

	test('tapping the profile opens the P2P user screen, disabled for yourself', () => {
		const navigation = { navigate: jest.fn() }
		let tree
		act(() => { tree = create(<P2POfferItem offer={makeOffer()} navigation={navigation} />) })
		// RN's Pressable is a wrapped component findByType can't match — locate it by its hitSlop prop
		const findPressable = (root) => root.find(node => node.props.hitSlop === 4 && 'onPress' in node.props)
		const pressable = findPressable(tree.root)
		expect(pressable.props.disabled).toBe(false)
		act(() => { pressable.props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('P2PUser', { uuid: CREATOR.uuid })

		useAuth.mockReturnValue({ user: CREATOR }) // now viewing own offer
		let own
		act(() => { own = create(<P2POfferItem offer={makeOffer()} navigation={navigation} />) })
		expect(findPressable(own.root).props.disabled).toBe(true)
	})

	test('show_user=false hides the profile row', () => {
		const tree = renderItem(makeOffer(), { show_user: false })
		expect(tree.root.findAllByType('ProfileContainerHorizontal')).toHaveLength(0)
	})
})
