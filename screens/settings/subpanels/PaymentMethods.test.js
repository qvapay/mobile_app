/**
 * Alta y edición de un método de pago en Ajustes: los campos son los mismos del retiro y,
 * en la entrega de efectivo por zonas (USDCASH…), provincia y municipio se eligen de las
 * zonas del servidor — un lugar que no casa con ninguna dejaría el método inservible al
 * retirar. Editar = la misma hoja precargada con la moneda fija (PATCH conserva el id).
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
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/particles/QPAddress', () => 'QPAddress')
jest.mock('../../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('../../withdraw/WithdrawAccountFields', () => 'WithdrawAccountFields')
jest.mock('../../withdraw/CashZoneFields', () => 'CashZoneFields')
jest.mock('../../../api/userApi', () => ({
	userApi: { getPaymentMethods: jest.fn(), createPaymentMethod: jest.fn(), updatePaymentMethod: jest.fn(), deletePaymentMethod: jest.fn() },
}))
jest.mock('../../../api/withdrawApi', () => ({ withdrawApi: { cashZones: jest.fn() } }))
let mockCoinCatalog = []
let mockCoinsLoading = false
jest.mock('../../../hooks/useCoins', () => ({
	__esModule: true,
	default: () => ({ coins: mockCoinCatalog, isLoading: mockCoinsLoading }),
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import React from 'react'
import { ActivityIndicator, Alert, Modal } from 'react-native'
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

const renderList = async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	let tree
	await act(async () => { tree = create(<QueryClientProvider client={client}><PaymentMethods navigation={navigation} /></QueryClientProvider>) })
	trees.push(tree)
	return tree
}

const renderAndOpen = async () => {
	const tree = await renderList()
	// El "+" de la cabecera abre el alta
	const headerRight = navigation.setOptions.mock.calls.at(-1)[0].headerRight
	await act(async () => { headerRight().props.onPress() })
	return tree
}

// Métodos guardados tal como los manda GET (coin = objeto; tick y campo en minúsculas a propósito)
const SAVED_CUP = { id: '7', name: 'Mi CUP', coin: { name: 'Banco CUP', tick: 'bank_cup', logo: 'bank_cup' }, details: { 'card number': '9224 0699 9632 8054' } }
const SAVED_GONE = { id: '8', name: 'Viejo', coin: null, details: [{ name: 'Wallet', value: 'TXYZ' }] }
const openEdit = (tree, id) => act(async () => { tree.root.findByProps({ testID: `payment-method-${id}` }).props.onPress() })
// Vuelve a pintar con el mismo cliente (para cuando cambia lo que devuelve useCoins)
const rerender = (tree) => act(async () => { tree.update(<QueryClientProvider client={clients.at(-1)}><PaymentMethods navigation={navigation} /></QueryClientProvider>) })
const hasTestID = (tree, testID) => tree.root.findAllByProps({ testID }).length > 0
const nameInput = (tree) => tree.root.findByProps({ placeholder: 'Nombre del método' })
const text = (tree) => JSON.stringify(tree.toJSON())

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
	mockCoinsLoading = false
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

describe('editar un método guardado', () => {
	beforeEach(() => {
		userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [SAVED_CUP, SAVED_GONE] })
		userApi.updatePaymentMethod.mockResolvedValue({ success: true, data: { id: '7' }, status: 200 })
	})

	test('tocar la tarjeta abre la hoja con nombre, moneda y campos precargados y la moneda bloqueada', async () => {
		const tree = await renderList()
		await openEdit(tree, '7')
		expect(text(tree)).toContain('Editar método de pago')
		expect(nameInput(tree).props.value).toBe('Mi CUP')
		expect(accountFields(tree).props.workingForm).toEqual({ card_number: '9224 0699 9632 8054' })
		expect(tree.root.findByProps({ testID: 'method-coin-selector' }).props.disabled).toBe(true)
		expect(saveButton(tree).props.title).toBe('Guardar cambios')
		expect(saveButton(tree).props.disabled).toBe(false)
		expect(withdrawApi.cashZones).not.toHaveBeenCalled()
	})

	test('guardar manda PATCH con id, nombre y detalles por el nombre original, y sustituye la fila sin recargar', async () => {
		const tree = await renderList()
		await openEdit(tree, '7')
		await typeName(tree, 'CUP de Ana')
		await fillField(tree, 'card_number', '9224 0699 0000 0000')
		await pressSave(tree)
		expect(userApi.updatePaymentMethod).toHaveBeenCalledWith({ id: '7', name: 'CUP de Ana', details: { 'Card Number': '9224 0699 0000 0000' } })
		expect(userApi.getPaymentMethods).toHaveBeenCalledTimes(1)
		expect(toast.success).toHaveBeenCalledWith('Método actualizado')
		expect(tree.root.findByType(Modal).props.visible).toBe(false)
		expect(text(tree)).toContain('CUP de Ana')
		expect(text(tree)).toContain('9224 0699 0000 0000')
	})

	test('si la moneda ya no existe solo se edita el nombre', async () => {
		const tree = await renderList()
		await openEdit(tree, '8')
		expect(tree.root.findAllByType('WithdrawAccountFields')).toHaveLength(0)
		expect(tree.root.findByProps({ testID: 'method-coin-unavailable' })).toBeTruthy()
		expect(saveButton(tree).props.disabled).toBe(false)
		await typeName(tree, 'Viejo renombrado')
		await pressSave(tree)
		expect(userApi.updatePaymentMethod).toHaveBeenCalledWith({ id: '8', name: 'Viejo renombrado' })
	})

	// Bugbot (PR #95): la moneda se resolvía una sola vez al abrir la hoja
	test('con el catálogo aún en camino espera sin decir que la moneda no existe, y precarga al llegar', async () => {
		mockCoinCatalog = []
		mockCoinsLoading = true
		const tree = await renderList()
		await openEdit(tree, '7')
		expect(hasTestID(tree, 'method-coin-loading')).toBe(true)
		expect(hasTestID(tree, 'method-coin-unavailable')).toBe(false)
		expect(tree.root.findAllByType('WithdrawAccountFields')).toHaveLength(0)
		expect(saveButton(tree).props.disabled).toBe(true)

		mockCoinCatalog = [CASH_ZONED, CUP]
		mockCoinsLoading = false
		await rerender(tree)
		expect(hasTestID(tree, 'method-coin-loading')).toBe(false)
		expect(accountFields(tree).props.workingForm).toEqual({ card_number: '9224 0699 9632 8054' })
		expect(saveButton(tree).props.disabled).toBe(false)
		await fillField(tree, 'card_number', '1111')
		await pressSave(tree)
		expect(userApi.updatePaymentMethod).toHaveBeenCalledWith({ id: '7', name: 'Mi CUP', details: { 'Card Number': '1111' } })
	})

	test('si el catálogo no se pudo cargar lo dice (no «moneda retirada») y deja cambiar solo el nombre', async () => {
		mockCoinCatalog = []
		const tree = await renderList()
		await openEdit(tree, '7')
		expect(hasTestID(tree, 'method-coins-error')).toBe(true)
		expect(hasTestID(tree, 'method-coin-unavailable')).toBe(false)
		expect(saveButton(tree).props.disabled).toBe(false)
		await typeName(tree, 'Solo nombre')
		await pressSave(tree)
		expect(userApi.updatePaymentMethod).toHaveBeenCalledWith({ id: '7', name: 'Solo nombre' })
	})

	test('un backend sin PATCH avisa y no toca la lista', async () => {
		userApi.updatePaymentMethod.mockResolvedValue({ success: false, status: 405, reason: 'backendTooOld', error: 'x' })
		const tree = await renderList()
		await openEdit(tree, '7')
		await typeName(tree, 'Otro nombre')
		await pressSave(tree)
		expect(toast.error).toHaveBeenCalledWith('Actualiza la app o inténtalo más tarde: el servidor aún no permite editar métodos')
		expect(tree.root.findByType(Modal).props.visible).toBe(true)
		expect(text(tree)).toContain('Mi CUP')
	})

	test('la papelera sigue borrando desde la tarjeta sin abrir la edición', async () => {
		jest.spyOn(Alert, 'alert').mockImplementation(() => {})
		const tree = await renderList()
		const card = tree.root.findByProps({ testID: 'payment-method-7' })
		const trash = card.findAll(node => node.props.onPress && node !== card && typeof node.type !== 'string')[0]
		await act(async () => { trash.props.onPress() })
		expect(Alert.alert).toHaveBeenCalled()
		expect(tree.root.findByType(Modal).props.visible).toBe(false)
	})
})
