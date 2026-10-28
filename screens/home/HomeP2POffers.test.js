/**
 * Bloque «Ofertas P2P» del Home: solo las promocionadas, con su etiqueta y enlace; nada
 * cuando no hay promocionadas (aunque el servidor mande últimas GOLD, o no tenga la ruta).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/P2POfferItem', () => 'P2POfferItem')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./homeQueries', () => ({ useHomeP2PQuery: jest.fn() }))
jest.mock('../p2p/p2pQueries', () => ({ useP2pMarketAveragesQuery: () => ({ data: { BANK_CUP: { average: 400 } } }) }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import HomeP2POffers from './HomeP2POffers'
import { useHomeP2PQuery } from './homeQueries'
import { ROUTES } from '../../routes'

const offer = (uuid) => ({ uuid, coin: 'BANK_CUP' })

const render = (data) => {
	useHomeP2PQuery.mockReturnValue({ data })
	const navigation = { navigate: jest.fn() }
	let tree
	act(() => { tree = create(<HomeP2POffers navigation={navigation} />) })
	return { tree, navigation }
}

const text = (tree) => JSON.stringify(tree.toJSON())

test('solo las dos promocionadas con su etiqueta, aunque el servidor mande más y traiga últimas GOLD', () => {
	const { tree } = render({ promoted: [offer('p1'), offer('p2'), offer('p3')], offers: [offer('g1'), offer('g2'), offer('g3'), offer('g4')] })
	const items = tree.root.findAllByType('P2POfferItem')
	expect(items.map(item => [item.props.offer.uuid, item.props.promoted])).toEqual([['p1', true], ['p2', true]])
	expect(items[0].props.marketAverage).toEqual({ average: 400 })
	expect(text(tree)).toContain('Comerciantes promocionados')
})

test('sin cabecera de sección: empieza por la etiqueta y «Promociónate» abre el puesto promocionado', () => {
	const { tree, navigation } = render({ promoted: [offer('p1')], offers: [] })
	expect(text(tree)).not.toContain('Ofertas P2P')
	expect(text(tree)).toContain('Comerciantes promocionados')
	act(() => { tree.root.findByProps({ testID: 'home-p2p-promote' }).props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.P2P_PROMOTE)
})

test('con últimas GOLD pero sin promocionadas no ocupa nada', () => {
	expect(render({ promoted: [], offers: [offer('g1'), offer('g2')] }).tree.toJSON()).toBeNull()
})

test('sin ofertas, cargando o con error no ocupa nada', () => {
	expect(render({ promoted: [], offers: [] }).tree.toJSON()).toBeNull()
	expect(render(undefined).tree.toJSON()).toBeNull()
})
