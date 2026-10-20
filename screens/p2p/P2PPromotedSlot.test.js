/**
 * Cabecera del mercado con el puesto promocionado: tarjeta dorada con la oferta pagada,
 * o la línea que ofrece el puesto libre.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/P2POfferItem', () => 'P2POfferItem')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import P2PPromotedSlot from './P2PPromotedSlot'
import { ROUTES } from '../../routes'

const SLOT = { coin: 'BANK_CUP', offer_type: 'sell', state: 'held', holder: { uuid: 'h', username: 'comerciante' }, starts_at: null, ends_at: null, leading_amount: null, min_bid: 5, start_price: 5, period_days: 30 }
const FREE = { ...SLOT, offer_type: 'buy', state: 'free', holder: null }
const OFFER = { uuid: 'offer-1', coin: 'BANK_CUP' }

const render = (props) => {
	const navigation = { navigate: jest.fn() }
	let tree
	act(() => { tree = create(<P2PPromotedSlot navigation={navigation} marketAverages={{ BANK_CUP: { average: 400 } }} {...props} />) })
	return { tree, navigation }
}

const text = (tree) => JSON.stringify(tree.toJSON())

test('la oferta promocionada va en su tarjeta con la etiqueta y el enlace al puesto', () => {
	const { tree, navigation } = render({ promoted: { slot: SLOT, offer: OFFER }, freeSlot: null })
	const item = tree.root.findByType('P2POfferItem')
	expect(item.props).toMatchObject({ offer: OFFER, promoted: true, marketAverage: { average: 400 } })
	expect(text(tree)).toContain('Comerciante promocionado')
	act(() => { tree.root.findByProps({ testID: 'p2p-promoted-want' }).props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.P2P_PROMOTE, { coin: 'BANK_CUP', type: 'sell' })
})

test('sin titular, el puesto libre se ofrece con su lado y precio', () => {
	const { tree, navigation } = render({ promoted: null, freeSlot: FREE })
	expect(text(tree)).toContain('El puesto promocionado de BANK_CUP · Vender está libre.')
	expect(text(tree)).toContain('Promociónate por $5')
	act(() => { tree.root.findByProps({ testID: 'p2p-promo-free' }).props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.P2P_PROMOTE, { coin: 'BANK_CUP', type: 'buy' })
})

test('sin puesto que pintar no ocupa nada', () => {
	const { tree } = render({ promoted: null, freeSlot: null })
	expect(tree.toJSON()).toBeNull()
})
