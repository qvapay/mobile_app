/**
 * Alta de un método de pago en Ajustes: los campos son los mismos del retiro y, en la
 * entrega de efectivo por zonas (USDCASH…), provincia y municipio se eligen de las zonas
 * del servidor — un lugar que no casa con ninguna dejaría el método inservible al retirar.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../../ui/particles/QPLoader', () => 'QPLoader')
jest.mock('../../../ui/particles/QPCoin', () => 'QPCoin')
jest.mock('../../../ui/particles/QPAddress', () => 'QPAddress')
jest.mock('../../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('../../withdraw/WithdrawAccountFields', () => 'WithdrawAccountFields')
jest.mock('../../withdraw/CashZoneFields', () => 'CashZoneFields')
jest.mock('../../../api/userApi', () => ({
	userApi: { getPaymentMethods: jest.fn(), createPaymentMethod: jest.fn(), deletePaymentMethod: jest.fn() },
}))
jest.mock('../../../api/withdrawApi', () => ({ withdrawApi: { cashZones: jest.fn() } }))
let mockCoinCatalog = []
jest.mock('../../../hooks/useCoins', () => ({
	__esModule: true,
	default: () => ({ coins: mockCoinCatalog, isLoading: false }),
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { ActivityIndicator } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider, defaultScheduler, notifyManager } from '@tanstack/react-query'
import { userApi } from '../../../api/userApi'
import { withdrawApi } from '../../../api/withdrawApi'
import { toast } from 'sonner-native'
import PaymentMethods from './PaymentMethods'

// Efectivo con provincia (primer select) + municipio, como el working_data de USDCASH
const CASH_ZONED = {
	tick: 'CASHZ',
	name: 'Cash zones',
	logo: 'usdcash',
	working_data: [
		{ name: 'Nombre y Apellidos', type: 'text' },
		{ name: 'Provincia', type: 'select', options: [{ value: 'Villa Clara', fee_pct: 5 }] },
		{ name: 'Municipio', type: 'text' },
	],
}
const CUP = {
	tick: 'BANK_CUP',
	name: 'Banco CUP',
	logo: 'bank_cup',
	working_data: JSON.stringify([{ name: 'Card Number', type: 'number' }]),
}
const SANTA_CLARA = {
	id: '1', coin_tick: 'CASHZ', province_code: 'VCL', province_name: 'Villa Clara', municipality: 'Santa Clara',
	is_capital: true, provider_pct: 3, margin_pct: null, min_usd: 50, small_flat_usd: 4,
	eta_min_hours: 24, eta_max_hours: 48, home_delivery: true, route: 'p2p', enabled: true,
}
const zonesOk = { success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [SANTA_CLARA] } }

// React Query notifica con setTimeout: aquí se entrega en el acto
beforeAll(() => { notifyManager.setScheduler(callback => callback()) })
afterAll(() => { notifyManager.setScheduler(defaultScheduler) })

let clients = []
let trees = []
const navigation = { setOptions: jest.fn() }

const renderAndOpen = async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	let tree
	await act(async () => { tree = create(<QueryClientProvider client={client}><PaymentMethods navigation={navigation} /></QueryClientProvider>) })
	trees.push(tree)
	// El "+" de la cabecera abre el alta
	const headerRight = navigation.setOptions.mock.calls.at(-1)[0].headerRight
	await act(async () => { headerRight().props.onPress() })
	return tree
}

const selectCoin = (tree, coin) => act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(coin) })
const accountFields = (tree) => tree.root.findByType('WithdrawAccountFields')
const zoneNode = (tree) => accountFields(tree).props.slot?.node ?? null
const fillField = (tree, key, value) => act(async () => { accountFields(tree).props.onChangeField(key, value) })
const typeName = (tree, value) => act(async () => { tree.root.findByProps({ placeholder: 'Nombre del método' }).props.onChangeText(value) })
const saveButton = (tree) => tree.root.findByType('QPButton')
const pressSave = (tree) => act(async () => { saveButton(tree).props.onPress() })
const pickZone = async (tree, province, municipality) => {
	await act(async () => { zoneNode(tree).props.onChangeProvince(province) })
	await act(async () => { zoneNode(tree).props.onChangeMunicipality(municipality) })
}

beforeEach(() => {
	jest.clearAllMocks()
	mockCoinCatalog = [CASH_ZONED, CUP]
	userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [] })
	userApi.createPaymentMethod.mockResolvedValue({ success: true, data: {}, status: 201 })
	withdrawApi.cashZones.mockResolvedValue(zonesOk)
})
afterEach(() => {
	for (const tree of trees) { act(() => { tree.unmount() }) }
	trees = []
	for (const client of clients) {
		client.clear()
		client.unmount()
	}
	clients = []
})

describe('entrega de efectivo por zonas', () => {
	test('provincia y municipio salen de las zonas, sin el aviso de cargo del retiro', async () => {
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		expect(withdrawApi.cashZones).toHaveBeenCalledWith('CASHZ')
		expect(accountFields(tree).props.slot.keys).toEqual(['provincia', 'municipio'])
		expect(zoneNode(tree).type).toBe('CashZoneFields')
		expect(zoneNode(tree).props.showNotice).toBe(false)
		expect(saveButton(tree).props.disabled).toBe(false)
	})

	test('guarda los nombres de la zona elegida', async () => {
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		await typeName(tree, 'Mamá')
		await fillField(tree, 'nombre_y_apellidos', 'Ana Pérez')
		await pickZone(tree, 'Villa Clara', 'Santa Clara')
		expect(zoneNode(tree).props.zone).toEqual(SANTA_CLARA)
		await pressSave(tree)
		expect(userApi.createPaymentMethod).toHaveBeenCalledWith({
			name: 'Mamá',
			coin: 'CASHZ',
			details: { 'Nombre y Apellidos': 'Ana Pérez', Provincia: 'Villa Clara', Municipio: 'Santa Clara' },
		})
	})

	test('cambiar de provincia vacía el municipio', async () => {
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		await pickZone(tree, 'Villa Clara', 'Santa Clara')
		await act(async () => { zoneNode(tree).props.onChangeProvince('Camagüey') })
		expect(zoneNode(tree).props.municipality).toBe('')
		expect(zoneNode(tree).props.zone).toBeNull()
	})

	test('un municipio que ya no casa con ninguna zona no se guarda', async () => {
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		await fillField(tree, 'nombre_y_apellidos', 'Ana Pérez')
		await pickZone(tree, 'Villa Clara', 'Caibarién')
		await pressSave(tree)
		expect(toast.error).toHaveBeenCalledWith('Elige provincia y municipio de la lista')
		expect(userApi.createPaymentMethod).not.toHaveBeenCalled()
	})

	test('mientras llegan las zonas no hay campos de texto ni se puede guardar', async () => {
		let resolveZones
		withdrawApi.cashZones.mockReturnValue(new Promise((resolve) => { resolveZones = resolve }))
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		expect(zoneNode(tree).type).toBe(ActivityIndicator)
		expect(saveButton(tree).props.disabled).toBe(true)

		// Una petición que nunca termina deja a jest sin salir: llega y se ven los selects
		await act(async () => { resolveZones(zonesOk) })
		expect(zoneNode(tree).type).toBe('CashZoneFields')
		expect(saveButton(tree).props.disabled).toBe(false)
	})

	test('si las zonas fallan se ofrece reintentar y no se guarda a ciegas', async () => {
		withdrawApi.cashZones.mockResolvedValue({ success: false, error: 'Ha ocurrido un error, contacte a soporte' })
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		expect(zoneNode(tree).props.testID).toBe('cash-zones-error')
		expect(saveButton(tree).props.disabled).toBe(true)

		withdrawApi.cashZones.mockResolvedValue(zonesOk)
		const retry = React.Children.toArray(zoneNode(tree).props.children).find(child => child.props.accessibilityRole === 'button')
		await act(async () => { retry.props.onPress() })
		expect(zoneNode(tree).type).toBe('CashZoneFields')
		expect(saveButton(tree).props.disabled).toBe(false)
	})

	test('sin zonas en el servidor quedan los campos de siempre', async () => {
		withdrawApi.cashZones.mockResolvedValue({ success: false, error: 'Not found', status: 404 })
		const tree = await renderAndOpen()
		await selectCoin(tree, CASH_ZONED)
		expect(accountFields(tree).props.slot).toBeNull()
		expect(saveButton(tree).props.disabled).toBe(false)
	})

	test('una moneda sin provincia + municipio ni pide las zonas', async () => {
		const tree = await renderAndOpen()
		await selectCoin(tree, CUP)
		expect(withdrawApi.cashZones).not.toHaveBeenCalled()
		expect(accountFields(tree).props.slot).toBeNull()
	})
})
