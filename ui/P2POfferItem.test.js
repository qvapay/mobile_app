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

// Texto plano del árbol: React serializa `{a}{b}` como children separados, así
// que "+10.0%" aparece troceado en el JSON
const flatText = (node) => {
	if (node == null || node === false) return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(flatText).join('')
	return flatText(node.children)
}
const plainText = (tree) => flatText(tree.toJSON())

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

	test('la tarjeta es neutra: el tipo de oferta lo comunica solo el botón', () => {
		// Sin franjas de color por tipo (como los P2P de la industria)
		const buy = renderItem(makeOffer()).toJSON()
		expect(JSON.stringify(buy.props.style)).not.toContain('borderLeft')
		const sell = renderItem(makeOffer({ type: 'sell' })).toJSON()
		expect(JSON.stringify(sell.props.style)).not.toContain('borderLeft')
	})

	test('renders the VIP / Privada badges only when flagged', () => {
		const plain = textOf(renderItem(makeOffer()))
		expect(plain).not.toContain('VIP')
		const flagged = textOf(renderItem(makeOffer({ only_vip: 1, private: 1 })))
		expect(flagged).toContain('VIP')
		expect(flagged).toContain('Privada')
	})

	test('no hay badge KYC: es requisito para operar en P2P y no distingue ofertas', () => {
		const flagged = textOf(renderItem(makeOffer({ only_kyc: 1, only_vip: 1 })))
		expect(flagged).not.toContain('KYC')
		expect(flagged).toContain('VIP')
	})

	test('la tasa es el héroe: se lee antes que el monto disponible', () => {
		const out = textOf(renderItem(makeOffer()))
		// Orden de lectura de la industria: quién → a cuánto (tasa) → cuánto
		expect(out.indexOf('0.95')).toBeLessThan(out.indexOf('disponible'))
		expect(out).toContain('disponible')
		expect(out).toContain('recibe')
	})

	test('un monto de cero no revienta la tasa', () => {
		const out = textOf(renderItem(makeOffer({ amount: '0' })))
		expect(out).toContain('—')
	})

	test('la fecha solo aparece en el detalle (show_date), nunca en el listado', () => {
		const listed = textOf(renderItem(makeOffer()))
		expect(listed).not.toContain('2026')
		const detail = textOf(renderItem(makeOffer(), { show_date: true }))
		expect(detail).toContain('2026')
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

	test('el botón es el único que lleva el color semántico del tipo', () => {
		const buy = buttonOf(renderItem(makeOffer()))
		expect(JSON.stringify(buy.props.style)).toContain('#7BFFB1')
		const sell = buttonOf(renderItem(makeOffer({ type: 'sell' })))
		expect(JSON.stringify(sell.props.style)).toContain('#DB253E')
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

describe('contexto de mercado', () => {
	// La señal se invierte según el lado: en una oferta de VENTA (yo compro)
	// una tasa más alta me da más moneda; en una de COMPRA es al revés
	const withAvg = (offer, avg) => renderItem(offer, { marketAverage: avg })
	const AVG = { average_buy: 100, average_sell: 100 }

	test('sin medias de mercado no se pinta ninguna señal', () => {
		expect(plainText(renderItem(makeOffer({ amount: '1', receive: '120' })))).not.toContain('%')
	})

	test('una oferta de venta con tasa por encima del mercado se marca a favor', () => {
		expect(plainText(withAvg(makeOffer({ type: 'sell', amount: '1', receive: '110' }), AVG))).toContain('+10.0%')
	})

	test('una oferta de venta con tasa por debajo se marca en contra', () => {
		expect(plainText(withAvg(makeOffer({ type: 'sell', amount: '1', receive: '90' }), AVG))).toContain('-10.0%')
	})

	test('en una oferta de compra el signo se invierte', () => {
		// receive alto en una oferta de compra = peor para quien la toma
		expect(plainText(withAvg(makeOffer({ type: 'buy', amount: '1', receive: '110' }), AVG))).toContain('-10.0%')
	})

	test('las diferencias por debajo del 1% no se señalan (ruido)', () => {
		expect(plainText(withAvg(makeOffer({ type: 'sell', amount: '1', receive: '100.5' }), AVG))).not.toContain('%')
	})
})
