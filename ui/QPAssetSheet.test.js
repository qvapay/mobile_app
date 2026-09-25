/**
 * EL selector de activos de la app: el mismo para el swap, depositar, retirar, P2P y métodos
 * de pago. Se prueba lo que decide si alguien elige bien — que el buscador mire más allá del
 * nombre, que lo no elegible diga por qué en vez de desaparecer, y que no se pueda pulsar.
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPAssetIcon', () => 'QPAssetIcon')
jest.mock('./particles/QPInput', () => 'QPInput')
jest.mock('./particles/QPPressable', () => 'QPPressable')

import React from 'react'
import { act, create } from 'react-test-renderer'
import QPAssetSheet from './QPAssetSheet'

// El alto de pantalla que react-native devuelve por defecto en los tests
const SCREEN_HEIGHT = 1334

const OPTIONS = [
	{ id: 'tron:usdt', title: 'USDT', subtitle: 'TRON', logoTick: 'usdt', networkTick: 'TRX', value: '1,240.5', valueCaption: '$1,240.50', keywords: 'tron tether' },
	{ id: 'solana:native', title: 'SOL', subtitle: 'Solana', logoTick: 'sol', networkTick: 'SOL', value: '0.4' },
	{ id: 'balance', title: 'USD', subtitle: 'Saldo QvaPay', logoTick: null, value: '$120.50' },
]

let tree
const render = async (props = {}) => {
	await act(async () => {
		tree = create(<QPAssetSheet visible options={OPTIONS} onSelect={jest.fn()} onClose={jest.fn()} {...props} />)
	})
	return tree
}
const rows = () => tree.root.findAllByType('QPPressable').filter(n => n.props.accessibilityState && 'selected' in n.props.accessibilityState)
const search = () => tree.root.findByType('QPInput')
const titles = () => rows().map(r => r.props.accessibilityLabel)
// El contenedor que acota la lista: el ancestro con alto numérico que la contiene
const listBoxHeight = () => tree.root.findAll(n =>
	typeof n.props?.style?.height === 'number' && n.findAllByType('FlashList').length === 1
)[0]?.props.style.height

afterEach(async () => { if (tree) { await act(async () => tree.unmount()); tree = null } })

test('una fila por opción', async () => {
	await render()
	expect(titles()).toEqual(['USDT', 'SOL', 'USD'])
})

test('la lista va dentro de un contenedor con alto EXPLÍCITO', async () => {
	// FlashList está virtualizada y no sabe medirse por su contenido: dentro de una hoja de
	// alto automático recibe cero y no pinta ni una fila. Pasó de verdad — se veían el
	// buscador y los accesos rápidos, y la lista salía vacía.
	await render()
	const height = listBoxHeight()
	expect(typeof height).toBe('number')
	expect(height).toBeGreaterThan(0)
})

test('el alto crece con las filas, hasta el tope de pantalla', async () => {
	await render({ options: OPTIONS.slice(0, 1) })
	const short = listBoxHeight()
	await act(async () => tree.unmount())
	await render({ options: Array.from({ length: 40 }, (_, i) => ({ ...OPTIONS[0], id: `c${i}`, title: `C${i}` })) })
	const long = listBoxHeight()
	expect(long).toBeGreaterThan(short)
	// Y con 40 filas no se come la pantalla entera
	expect(long).toBeLessThan(SCREEN_HEIGHT)
})

test('sin resultados el contenedor sigue teniendo alto, para poder leer el aviso', async () => {
	await render()
	await act(async () => { search().props.onChangeText('dogecoin') })
	expect(listBoxHeight()).toBeGreaterThan(0)
})

test('el buscador está SIEMPRE a la vista, no detrás de una lupa', async () => {
	await render()
	expect(tree.root.findAllByType('QPInput')).toHaveLength(1)
})

test('busca por título, subtítulo, id y palabras clave', async () => {
	await render()
	for (const [query, expected] of [
		['usdt', ['USDT']],
		['solana', ['SOL']],
		['tether', ['USDT']],
		['balance', ['USD']],
	]) {
		await act(async () => { search().props.onChangeText(query) })
		expect(titles()).toEqual(expected)
	}
})

test('la búsqueda ignora mayúsculas y espacios de sobra', async () => {
	await render()
	await act(async () => { search().props.onChangeText('  SoL  ') })
	expect(titles()).toEqual(['SOL'])
})

test('sin resultados lo dice, en vez de dejar un hueco', async () => {
	await render()
	await act(async () => { search().props.onChangeText('dogecoin') })
	expect(JSON.stringify(tree.toJSON())).toContain('No hay monedas disponibles')
})

test('elegir informa del id y cierra', async () => {
	const onSelect = jest.fn()
	const onClose = jest.fn()
	await render({ onSelect, onClose })
	await act(async () => { rows()[1].props.onPress() })
	expect(onSelect).toHaveBeenCalledWith('solana:native')
	expect(onClose).toHaveBeenCalled()
})

test('lo no elegible dice POR QUÉ y no se puede pulsar', async () => {
	const onSelect = jest.fn()
	const blocked = [{ ...OPTIONS[0], disabledReason: 'ChangeNOW no lista USDT en Base' }]
	await render({ options: blocked, onSelect })
	const row = rows()[0]
	expect(row.props.disabled).toBe(true)
	expect(JSON.stringify(tree.toJSON())).toContain('ChangeNOW no lista USDT en Base')
	await act(async () => { row.props.onPress() })
	expect(onSelect).not.toHaveBeenCalled()
})

test('una fila apagada no enseña su saldo: no es una opción', async () => {
	await render({ options: [{ ...OPTIONS[0], disabledReason: 'no disponible' }] })
	expect(JSON.stringify(tree.toJSON())).not.toContain('1,240.5')
})

test('marca la seleccionada', async () => {
	await render({ selectedId: 'solana:native' })
	expect(rows().map(r => r.props.accessibilityState.selected)).toEqual([false, true, false])
})

test('los accesos rápidos se esconden al buscar: estorban al filtrar', async () => {
	await render({ quick: [OPTIONS[0]] })
	const quickPills = () => tree.root.findAllByType('QPPressable').filter(n => !n.props.accessibilityState)
	expect(quickPills().length).toBeGreaterThan(0)
	await act(async () => { search().props.onChangeText('sol') })
	expect(quickPills()).toHaveLength(0)
})

test('la búsqueda se limpia al cerrar: reabrir no hereda un catálogo a medias', async () => {
	await render()
	await act(async () => { search().props.onChangeText('sol') })
	expect(titles()).toEqual(['SOL'])
	await act(async () => { tree.update(<QPAssetSheet visible={false} options={OPTIONS} onSelect={jest.fn()} onClose={jest.fn()} />) })
	await act(async () => { tree.update(<QPAssetSheet visible options={OPTIONS} onSelect={jest.fn()} onClose={jest.fn()} />) })
	expect(titles()).toEqual(['USDT', 'SOL', 'USD'])
})

test('searchable=false lo oculta, para listas de verdad cortas', async () => {
	await render({ searchable: false })
	expect(tree.root.findAllByType('QPInput')).toHaveLength(0)
})

test('el pie solo aparece sin búsqueda activa', async () => {
	await render({ footnote: 'Más monedas pronto' })
	expect(JSON.stringify(tree.toJSON())).toContain('Más monedas pronto')
	await act(async () => { search().props.onChangeText('sol') })
	expect(JSON.stringify(tree.toJSON())).not.toContain('Más monedas pronto')
})
