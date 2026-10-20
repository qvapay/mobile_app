/**
 * Bloque «Ofertas P2P» del Home: promocionadas con su etiqueta y enlace, las últimas GOLD
 * debajo, y nada cuando no hay ofertas (o el backend no tiene la ruta).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/P2POfferItem', () => 'P2POfferItem')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../ui/particles/QPSectionHeader', () => 'QPSectionHeader')
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
	const onSeeAll = jest.fn()
	let tree
	act(() => { tree = create(<HomeP2POffers navigation={navigation} onSeeAll={onSeeAll} />) })
	return { tree, navigation, onSeeAll }
}

const text = (tree) => JSON.stringify(tree.toJSON())

test('las promocionadas van arriba con su etiqueta, y las últimas GOLD debajo', () => {
	const { tree } = render({ promoted: [offer('p1'), offer('p2')], offers: [offer('g1'), offer('g2'), offer('g3')] })
	const items = tree.root.findAllByType('P2POfferItem')
	expect(items.map(item => [item.props.offer.uuid, item.props.promoted])).toEqual([
		['p1', true], ['p2', true], ['g1', false], ['g2', false], ['g3', false],
	])
	expect(items[0].props.marketAverage).toEqual({ average: 400 })
	expect(text(tree)).toContain('Comerciantes promocionados')
})

test('«Ver todas» abre la pestaña P2P y «Promociónate» el puesto promocionado', () => {
	const { tree, navigation, onSeeAll } = render({ promoted: [offer('p1')], offers: [] })
	const header = tree.root.findByType('QPSectionHeader')
	expect(header.props.title).toBe('Ofertas P2P')
	act(() => { header.props.onPress() })
	expect(onSeeAll).toHaveBeenCalled()
	act(() => { tree.root.findByProps({ testID: 'home-p2p-promote' }).props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.P2P_PROMOTE)
})

test('sin promocionadas no sale la etiqueta, solo las últimas', () => {
	const { tree } = render({ promoted: [], offers: [offer('g1')] })
	expect(tree.root.findAllByType('P2POfferItem')).toHaveLength(1)
	expect(text(tree)).not.toContain('Comerciantes promocionados')
})

test('sin ofertas, cargando o con error no ocupa nada', () => {
	expect(render({ promoted: [], offers: [] }).tree.toJSON()).toBeNull()
	expect(render(undefined).tree.toJSON()).toBeNull()
})
