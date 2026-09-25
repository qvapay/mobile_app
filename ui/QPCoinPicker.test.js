/**
 * El selector de monedas es, desde el barrido de selectores, un ADAPTADOR sobre
 * `QPAssetSheet`: la hoja, el buscador y las filas ya no son suyos. Así que lo que aquí se
 * prueba es exactamente lo que sigue siendo su responsabilidad — traducir una `Coin` del
 * catálogo a una opción (condiciones, precio, cuánto recibirías) y recordar las recientes.
 * La hoja tiene sus propios tests en QPAssetSheet.test.js.
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }))
jest.mock('./QPAssetSheet', () => 'QPAssetSheet')

import React from 'react'
import { act, create } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import QPCoinPicker from './QPCoinPicker'

const COINS = [
	{ id: 1, tick: 'BTC', name: 'Bitcoin', logo: 'btc', price: '60000', fee_out: 1, min_out: 60 },
	{ id: 2, tick: 'TRX', name: 'Tron', logo: 'trx', price: '0.1', network: 'TRON' },
	{ id: 3, tick: 'USDTTRC20', name: 'USDT (TRC20)', logo: 'usdt', price: '1', network: 'TRON' },
]

let tree
const renderPicker = async (props = {}) => {
	await act(async () => {
		tree = create(<QPCoinPicker visible onClose={jest.fn()} onSelect={jest.fn()} coins={COINS} {...props} />)
	})
	return tree
}
const sheet = () => tree.root.findByType('QPAssetSheet').props
const options = () => sheet().options

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.getItem.mockResolvedValue(null)
})
afterEach(async () => { if (tree) { await act(async () => tree.unmount()); tree = null } })

test('una opción por moneda, con su identidad y su logo', async () => {
	await renderPicker()
	expect(options().map(o => o.id)).toEqual(['BTC', 'TRX', 'USDTTRC20'])
	expect(options()[0]).toMatchObject({ title: 'Bitcoin', logoTick: 'btc' })
})

test('el badge de red va en la opción: es lo que distingue el USDT correcto', async () => {
	await renderPicker()
	expect(options()[2].networkTick).toBe('TRON')
})

test('las condiciones se pintan como subtítulo, legibles y en una línea', async () => {
	await renderPicker({ direction: 'out' })
	expect(options()[0].subtitle).toBe('1% comisión · mín. $60')
})

test('sin condiciones, el subtítulo cae a la red', async () => {
	await renderPicker({ direction: 'out' })
	expect(options()[1].subtitle).toBe('TRON')
})

test('con importe, la cifra de la derecha es cuánto recibirías', async () => {
	await renderPicker({ amount: '120', direction: 'out' })
	expect(options()[0].value).toBe('0.002')
	expect(options()[1].value).toBe('1,200')
})

test('sin importe no se inventa un cero', async () => {
	await renderPicker()
	expect(options()[0].value).toBeUndefined()
})

test('el precio solo aparece cuando NO va 1:1 con el dólar', async () => {
	await renderPicker()
	expect(options()[0].valueCaption).toBe('$60,000')
	// USDT a $1.0000 era puro ruido
	expect(options()[2].valueCaption).toBeUndefined()
})

test('showFees=false deja solo la identidad (modo P2P)', async () => {
	await renderPicker({ amount: '120', showFees: false, direction: 'out' })
	expect(options()[0].value).toBeUndefined()
	expect(options()[0].valueCaption).toBeUndefined()
	expect(options()[0].subtitle).toBeUndefined()
})

test('la búsqueda también mira el tick y la red, no solo el nombre', async () => {
	await renderPicker()
	expect(options()[2].keywords).toContain('USDTTRC20')
	expect(options()[2].keywords).toContain('TRON')
})

test('elegir devuelve la MONEDA, no su tick, y la recuerda', async () => {
	const onSelect = jest.fn()
	await renderPicker({ onSelect, recentKey: 'recent_coins' })
	await act(async () => { sheet().onSelect('TRX') })
	expect(onSelect).toHaveBeenCalledWith(COINS[1])
	expect(AsyncStorage.setItem).toHaveBeenCalledWith('recent_coins', JSON.stringify(['TRX']))
})

test('sin recentKey no se persiste nada', async () => {
	await renderPicker({ onSelect: jest.fn() })
	await act(async () => { sheet().onSelect('TRX') })
	expect(AsyncStorage.setItem).not.toHaveBeenCalled()
})

test('los accesos rápidos son las recientes, rellenadas con las por defecto y sin repetir', async () => {
	AsyncStorage.getItem.mockResolvedValue(JSON.stringify(['TRX']))
	await renderPicker({ recentKey: 'recent_coins', defaultCoins: [{ tick: 'BTC', label: 'Bitcoin' }, { tick: 'TRX', label: 'Tron' }] })
	expect(sheet().quick.map(q => q.id)).toEqual(['TRX', 'BTC'])
	// La lista completa sigue entera
	expect(options()).toHaveLength(3)
})

test('una clave de recientes corrupta no impide elegir moneda', async () => {
	AsyncStorage.getItem.mockResolvedValue('{no es json')
	await renderPicker({ recentKey: 'recent_coins' })
	expect(options()).toHaveLength(3)
	expect(sheet().quick).toEqual([])
})

test('la moneda ya elegida se marca por su tick', async () => {
	await renderPicker({ selectedCoin: COINS[1] })
	expect(sheet().selectedId).toBe('TRX')
})

test('el estado de carga viaja a la hoja', async () => {
	await renderPicker({ isLoading: true, coins: [] })
	expect(sheet().loading).toBe(true)
})
