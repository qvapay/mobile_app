/**
 * Selector de destino del efectivo por zonas: qué cuenta cada fila de provincia y de
 * municipio, y el encadenado provincia → municipios.
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../ui/QPAssetSheet', () => 'QPAssetSheet')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/themeTokens'
import CashZoneFields from './CashZoneFields'

const theme = createTheme(true)

const zone = (over = {}) => ({
	id: '1', coin_tick: 'USDCASH', province_code: 'VCL', province_name: 'Villa Clara', municipality: 'Caibarién',
	is_capital: false, provider_pct: 5, margin_pct: null, min_usd: 100, small_flat_usd: null,
	eta_min_hours: 48, eta_max_hours: 144, home_delivery: true, route: 'p2p', enabled: true, ...over,
})
const ZONES = [
	zone(),
	zone({ id: '2', municipality: 'Santa Clara', is_capital: true, provider_pct: 3, min_usd: 20, eta_min_hours: 24, eta_max_hours: 48 }),
	zone({ id: '3', municipality: 'Corralillo', home_delivery: false }),
	zone({ id: '4', province_code: 'cmg', province_name: 'Camagüey', municipality: 'Camagüey', is_capital: true, provider_pct: 3 }),
]
const MODE = { zones: ZONES, globalMarginPct: 1, provinceField: 'Provincia', municipalityField: 'Municipio' }

let tree
const render = async (props = {}) => {
	const onChangeProvince = jest.fn()
	const onChangeMunicipality = jest.fn()
	await act(async () => {
		tree = create(<CashZoneFields mode={MODE} province="" municipality="" zone={null} charge={null} belowMin={false}
			onChangeProvince={onChangeProvince} onChangeMunicipality={onChangeMunicipality} theme={theme} textStyles={{}} {...props} />)
	})
	return { onChangeProvince, onChangeMunicipality }
}
const sheets = () => tree.root.findAllByType('QPAssetSheet')
const provinceSheet = () => sheets()[0]
const municipalitySheet = () => sheets()[1]

beforeEach(() => { jest.useFakeTimers() })
afterEach(async () => {
	if (tree) { await act(async () => tree.unmount()); tree = null }
	jest.useRealTimers()
})

test('cada provincia: siglas, cuántos municipios, el plazo más corto y desde qué recargo', async () => {
	await render()
	const [villaClara, camaguey] = provinceSheet().props.options
	expect(villaClara).toMatchObject({ id: 'Villa Clara', monogram: 'VCL', subtitle: '3 municipios · desde 24–48 h', value: 'desde +4%', valueCaption: 'recargo' })
	// Un solo recargo en la provincia: sin "desde"; y la búsqueda sin acentos encuentra Camagüey
	expect(camaguey).toMatchObject({ monogram: 'CMG', subtitle: '1 municipio · desde 2–6 días', value: '+4%' })
	expect(camaguey.keywords).toContain('camaguey')
})

test('los municipios: cabecera primero con su insignia, recargo y mínimo, y quién recoge', async () => {
	await render({ province: 'Villa Clara' })
	const options = municipalitySheet().props.options
	expect(options.map(o => o.title)).toEqual(['Santa Clara', 'Caibarién', 'Corralillo'])
	expect(options[0]).toMatchObject({ badge: 'Cabecera', iconName: 'house', subtitle: '24–48 h · a domicilio', value: '+4%', valueCaption: 'mín. $20' })
	expect(options[2]).toMatchObject({ iconName: 'store', tint: theme.colors.warning, subtitle: '2–6 días · recoge el beneficiario' })
	// Hay recogida en la provincia: el pie lo explica
	expect(municipalitySheet().props.footnote).toBe('Donde no hay entrega a domicilio, el beneficiario recoge el efectivo.')
	expect(municipalitySheet().props.title).toBe('Municipios de Villa Clara')
})

test('el campo de municipio enseña plazo y recargo del elegido', async () => {
	await render({ province: 'villa clara', municipality: 'santa clara' })
	expect(JSON.stringify(tree.toJSON())).toContain('24–48 h · +4%')
	expect(municipalitySheet().props.selectedId).toBe('Santa Clara')
	expect(provinceSheet().props.selectedId).toBe('Villa Clara')
})

test('elegir una provincia NUEVA abre sus municipios cuando la hoja anterior ya cerró', async () => {
	const { onChangeProvince } = await render()
	await act(async () => { provinceSheet().props.onSelect('Villa Clara'); provinceSheet().props.onClose() })
	expect(onChangeProvince).toHaveBeenCalledWith('Villa Clara')
	expect(municipalitySheet().props.visible).toBe(false)
	await act(async () => { jest.advanceTimersByTime(450) })
	expect(municipalitySheet().props.visible).toBe(true)
})

test('repetir la misma provincia no reabre nada', async () => {
	await render({ province: 'Villa Clara' })
	await act(async () => { provinceSheet().props.onSelect('Villa Clara'); provinceSheet().props.onClose() })
	await act(async () => { jest.advanceTimersByTime(1000) })
	expect(municipalitySheet().props.visible).toBe(false)
})
