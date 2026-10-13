/**
 * Render tests for the P2P offer list card — node environment with the theme,
 * auth, presence and child particles mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
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
jest.mock('./particles/QPSkeleton', () => 'QPSkeleton')
jest.mock('sonner-native', () => ({ toast: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useAuth } from '../auth/AuthContext'
import { toast } from 'sonner-native'
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
	test('tasa como héroe, moneda / USD y Monto · Recibes en una fija', () => {
		const out = plainText(renderItem(makeOffer()))
		expect(out).toContain('0.95') // receive / amount
		expect(out).toContain('Banco Metropolitano')
		expect(out).toContain('/ USD')
		expect(out).toContain('Monto')
		expect(out).toContain('$10.00')
		// En una de compra quien la toma recibe la moneda
		expect(out).toContain('Recibes')
		expect(out.indexOf('0.95')).toBeLessThan(out.indexOf('Monto'))
	})

	test('tasa con separador de miles y dos decimales', () => {
		expect(plainText(renderItem(makeOffer({ amount: '1', receive: '1030' })))).toContain('1,030.00')
	})

	test('Pagas o Recibes según quién mira', () => {
		expect(plainText(renderItem(makeOffer({ type: 'sell' })))).toContain('Pagas')
		useAuth.mockReturnValue({ user: CREATOR })
		expect(plainText(renderItem(makeOffer({ type: 'sell' })))).toContain('Recibes')
		expect(plainText(renderItem(makeOffer({ type: 'buy' })))).toContain('Pagas')
	})

	test('sin borde de color por tipo', () => {
		const buy = renderItem(makeOffer()).toJSON()
		expect(JSON.stringify(buy.props.style)).not.toContain('borderLeft')
	})

	test('Solo VIP va encima del botón; Privada en la fila de chips', () => {
		const plain = plainText(renderItem(makeOffer()))
		expect(plain).not.toContain('VIP')
		const flagged = plainText(renderItem(makeOffer({ only_vip: 1, private: 1 })))
		expect(flagged).toContain('Solo VIP')
		expect(flagged).toContain('Privada')
		// Va en la columna de operar, no en la fila de chips
		expect(plainText(renderItem(makeOffer({ only_vip: 1 }), { show_buttons: false }))).toContain('Solo VIP')
	})

	test('no hay badge KYC', () => {
		expect(plainText(renderItem(makeOffer({ only_kyc: 1 })))).not.toContain('KYC')
	})

	test('un monto de cero no revienta la tasa', () => {
		expect(plainText(renderItem(makeOffer({ amount: '0' })))).toContain('—')
	})

	test('la hora de actualización va bajo el botón; la fecha de creación solo en el detalle', () => {
		const updated = new Date(2026, 9, 12, 14, 5).toISOString()
		expect(plainText(renderItem(makeOffer({ updated_at: updated })))).toContain('12/10 14:05')
		expect(plainText(renderItem(makeOffer()))).not.toContain('2026')
		expect(plainText(renderItem(makeOffer(), { show_date: true, show_buttons: false }))).toContain('2026')
	})

	test('el mensaje va en una línea y tocarlo lo despliega', () => {
		const tree = renderItem(makeOffer({ message: 'Pago rápido por Zelle' }))
		expect(plainText(tree)).toContain('Pago rápido por Zelle')
		const msg = () => tree.root.find(n => n.type === 'Text' && n.props.children === 'Pago rápido por Zelle')
		expect(msg().props.numberOfLines).toBe(1)
		const row = tree.root.find(n => n.props.hitSlop === 4 && typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'Pago rápido por Zelle').length > 0)
		act(() => { row.props.onPress() })
		expect(msg().props.numberOfLines).toBeUndefined()
		const bare = renderItem(makeOffer())
		expect(bare.root.findAllByType('FontAwesome6').some(i => i.props.name === 'message')).toBe(false)
	})

	test('banco solo cuando llega el campo', () => {
		expect(plainText(renderItem(makeOffer({ bank: 'BANDEC' })))).toContain('BANDEC')
		expect(renderItem(makeOffer()).root.findAllByType('FontAwesome6').some(i => i.props.name === 'building-columns')).toBe(false)
	})
})

describe('ofertas por rango', () => {
	const RANGE = { offer_kind: 'flexible', type: 'sell', amount: '1200.00', receive: '1236000', available_amount: '744.00', order_min: '20', order_max: '200' }

	test('Disponible y Límites con la barra de lo que queda, sin chip', () => {
		const tree = renderItem(makeOffer(RANGE))
		const out = plainText(tree)
		expect(out).toContain('DisponibleLímites$744.00$20.00 – $200.00')
		expect(out).not.toContain('Por rango')
		expect(tree.root.findAllByType('FontAwesome6').some(i => i.props.name === 'chart-pie')).toBe(false)
		expect(out).toContain('1,030.00') // la tasa sigue siendo receive / amount
		const bar = tree.root.find(n => n.props.accessibilityRole === 'progressbar')
		expect(bar.props.accessibilityLabel).toBe('Queda el 62 % de $1,200.00')
	})

	test('con mi orden: Tu orden, su estado en el botón y sin barra', () => {
		const navigation = { navigate: jest.fn() }
		let tree
		act(() => { tree = create(<P2POfferItem offer={makeOffer({ ...RANGE, my_order: { uuid: 'ord-1', amount: '50', receive: '51500', status: 'paid', created_at: '' } })} navigation={navigation} />) })
		const out = plainText(tree)
		expect(out).toContain('Tu ordenPagas$50.0051,500')
		expect(tree.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0)
		const button = tree.root.findByType('QPButton')
		expect(button.props.title).toBe('Pagado')
		act(() => { button.props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'offer-1', order: 'ord-1' })
	})

	test('la orden proyectada del detalle se lee como Orden, sin chip', () => {
		const out = plainText(renderItem(makeOffer({ ...RANGE, amount: '50', receive: '51500' }), { show_range: false, show_buttons: false }))
		expect(out).toContain('OrdenPagas$50.00')
		expect(out).not.toContain('Por rango')
	})
})

describe('requisitos del maker', () => {
	test('sin requisitos no hay línea ámbar', () => {
		const tree = renderItem(makeOffer({ requirements: { min_completed: 0 } }))
		expect(tree.toJSON().props.accessibilityHint).toBeUndefined()
	})

	test('con requisitos: se anuncian y la pulsación larga los enseña', () => {
		const tree = renderItem(makeOffer({ requirements: { min_completed: 10, min_rating: 4.5, min_account_days: 30, min_trustscore: 50 } }))
		const text = 'Requisitos para aplicar: 10+ operaciones completadas · rating 4.5+ · cuenta con 30+ días · TrustScore 50+'
		const root = tree.root.find(n => n.props.accessibilityHint === text && typeof n.props.onLongPress === 'function')
		act(() => { root.props.onLongPress() })
		expect(toast).toHaveBeenCalledWith(text)
	})
})

describe('status / action button', () => {
	const buttonOf = (tree) => tree.root.findByType('QPButton')

	test('quien la toma: Vender en una compra, Comprar en una venta', () => {
		expect(buttonOf(renderItem(makeOffer())).props.title).toBe('Vender')
		expect(buttonOf(renderItem(makeOffer({ type: 'sell' }))).props.title).toBe('Comprar')
	})

	test('ancho fijo y color semántico del tipo', () => {
		const buy = buttonOf(renderItem(makeOffer()))
		expect(buy.props.style.width).toBe(112)
		expect(JSON.stringify(buy.props.style)).toContain('#7BFFB1')
		expect(JSON.stringify(buttonOf(renderItem(makeOffer({ type: 'sell' }))).props.style)).toContain('#DB253E')
	})

	test('el dueño gestiona sus ofertas abiertas', () => {
		useAuth.mockReturnValue({ user: CREATOR })
		expect(buttonOf(renderItem(makeOffer())).props.title).toBe('Gestionar')
	})

	test('estados', () => {
		expect(buttonOf(renderItem(makeOffer({ status: 'processing' }))).props.title).toBe('Procesando')
		expect(buttonOf(renderItem(makeOffer({ status: 'completed' }))).props.title).toBe('Completado')
		expect(buttonOf(renderItem(makeOffer({ status: 'paid' }))).props.title).toBe('Pagado')
		expect(buttonOf(renderItem(makeOffer({ status: 'revision' }))).props.title).toBe('En revisión')
		expect(buttonOf(renderItem(makeOffer({ status: 'cancelled' }))).props.title).toBe('Cancelado')
	})

	test('tocar el botón abre el detalle', () => {
		const navigation = { navigate: jest.fn() }
		let tree
		act(() => { tree = create(<P2POfferItem offer={makeOffer()} navigation={navigation} />) })
		act(() => { buttonOf(tree).props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('P2POffer', { p2p_uuid: 'offer-1' })
	})

	test('show_buttons=false oculta la columna de operar', () => {
		expect(renderItem(makeOffer(), { show_buttons: false }).root.findAllByType('QPButton')).toHaveLength(0)
	})
})

describe('counterparty row', () => {
	const peer = { uuid: 'peer-uuid', username: 'peer' }

	test('el dueño ve a su contraparte, con su punto de presencia', () => {
		useAuth.mockReturnValue({ user: CREATOR })
		const profile = renderItem(makeOffer({ Peer: peer })).root.findByType('ProfileContainerHorizontal')
		expect(profile.props.user).toBe(peer)
		expect(profile.props.isOnline).toBe(true)
	})

	test('la contraparte (y cualquier otro) ve al dueño', () => {
		useAuth.mockReturnValue({ user: peer })
		expect(renderItem(makeOffer({ Peer: peer })).root.findByType('ProfileContainerHorizontal').props.user).toBe(CREATOR)
	})

	test('tocar el perfil abre su pantalla P2P, desactivado para uno mismo', () => {
		const navigation = { navigate: jest.fn() }
		let tree
		act(() => { tree = create(<P2POfferItem offer={makeOffer()} navigation={navigation} />) })
		const findPressable = (root) => root.find(node => node.props.hitSlop === 4 && 'onPress' in node.props && node.findAllByType('ProfileContainerHorizontal').length > 0)
		const pressable = findPressable(tree.root)
		expect(pressable.props.disabled).toBe(false)
		act(() => { pressable.props.onPress() })
		expect(navigation.navigate).toHaveBeenCalledWith('P2PUser', { uuid: CREATOR.uuid })

		useAuth.mockReturnValue({ user: CREATOR })
		let own
		act(() => { own = create(<P2POfferItem offer={makeOffer()} navigation={navigation} />) })
		expect(findPressable(own.root).props.disabled).toBe(true)
	})

	test('show_user=false oculta el anunciante', () => {
		expect(renderItem(makeOffer(), { show_user: false }).root.findAllByType('ProfileContainerHorizontal')).toHaveLength(0)
	})
})

describe('desviación frente al promedio', () => {
	// Porcentaje = (tasa − promedio) / promedio, con su signo real; el COLOR dice
	// si conviene a quien toma la oferta, con ±2 % de margen neutro
	const AVG = { average: 100, average_buy: 0, average_sell: 0 }
	const colorOf = (tree, label) => tree.root.find(n => n.type === 'Text' && n.props.children === label).props.style.find(x => x && x.color).color

	test('sin promedio (o promedio 0) no hay porcentaje', () => {
		expect(plainText(renderItem(makeOffer({ amount: '1', receive: '120' })))).not.toContain('%')
		expect(plainText(renderItem(makeOffer({ amount: '1', receive: '120' }), { marketAverage: { average: 0 } }))).not.toContain('%')
	})

	test('venta barata: signo negativo, en verde', () => {
		const tree = renderItem(makeOffer({ type: 'sell', amount: '1', receive: '90' }), { marketAverage: AVG })
		expect(colorOf(tree, '-10.0%')).toBe('#7BFFB1')
	})

	test('venta cara: signo positivo, en rojo', () => {
		const tree = renderItem(makeOffer({ type: 'sell', amount: '1', receive: '110' }), { marketAverage: AVG })
		expect(colorOf(tree, '+10.0%')).toBe('#FF6B7D')
	})

	test('compra alta conviene a quien vende: verde', () => {
		const tree = renderItem(makeOffer({ type: 'buy', amount: '1', receive: '110' }), { marketAverage: AVG })
		expect(colorOf(tree, '+10.0%')).toBe('#7BFFB1')
	})

	test('dentro de ±2 % se muestra en gris', () => {
		const tree = renderItem(makeOffer({ type: 'sell', amount: '1', receive: '101.5' }), { marketAverage: AVG })
		expect(colorOf(tree, '+1.5%')).toBe('#9DA3B4')
	})
})
