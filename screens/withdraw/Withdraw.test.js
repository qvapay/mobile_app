/**
 * Behavior tests for the Withdraw screen — fee math (percent, fixed and
 * threshold fees), the QUSD ⇄ coin converter, form validation, the two-step
 * PIN/OTP confirmation and the withdraw payload — node environment with every
 * collaborator mocked (see keypadAmount.test.js for why node env, and
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/particles/QPSwitch', () => 'QPSwitch')
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('./WithdrawAmountCard', () => 'WithdrawAmountCard')
jest.mock('./WithdrawSatsCard', () => 'WithdrawSatsCard')
jest.mock('./WithdrawAccountFields', () => 'WithdrawAccountFields')
jest.mock('./CashZoneFields', () => 'CashZoneFields')
jest.mock('./WithdrawDestinationSelector', () => 'WithdrawDestinationSelector')
jest.mock('../transaction/PinConfirmStep', () => 'PinConfirmStep')
jest.mock('../../api/client', () => ({
	__esModule: true,
	default: { get: jest.fn() },
}))
jest.mock('../../api/withdrawApi', () => ({
	withdrawApi: { requestPin: jest.fn(), withdraw: jest.fn(), decodeLightning: jest.fn(), cashZones: jest.fn() },
}))
jest.mock('../../api/userApi', () => ({ userApi: { getPaymentMethods: jest.fn() } }))
jest.mock('../../ui/SavedMethodsModal', () => 'SavedMethodsModal')
let mockCoinCatalog = []
jest.mock('../../hooks/useCoins', () => ({
	__esModule: true,
	default: () => ({ coins: mockCoinCatalog, isLoading: false }),
}))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
// Gate de KYC en passthrough — su lógica se prueba en hooks/useKycGate.test.js
jest.mock('../../hooks/useKycGate', () => ({
	__esModule: true,
	default: () => ({ requireKyc: () => true, gateVisible: false, gateMessage: null, closeGate: jest.fn() }),
	KYC_WITHDRAW_THRESHOLD: 1000,
}))
jest.mock('../../ui/KycGateModal', () => 'KycGateModal')
// Modal OFAC como host: el gate real corre y el test firma vía onConfirm
jest.mock('../../ui/OfacAttestationModal', () => 'OfacAttestationModal')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider, defaultScheduler, notifyManager } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import apiClient from '../../api/client'
import { withdrawApi } from '../../api/withdrawApi'
import { userApi } from '../../api/userApi'
import { toast } from 'sonner-native'
import Withdraw from './Withdraw'

// Non-stable coin: 5% fee, price 0.5 USD per unit, two account fields
const CUP = {
	tick: 'BANK_CUP',
	name: 'Banco CUP',
	price: '0.5',
	stable: false,
	fee_out: '5',
	fee_out_gold: '2',
	fee_out_fixed: 0,
	decimals: 2,
	logo: 'bank_cup',
	working_data: JSON.stringify([
		{ name: 'Card Number', type: 'number' },
		{ name: 'Full Name', type: 'text' },
	]),
}
// Stable coin with a flat fixed fee and no account fields
const USDCASH = {
	tick: 'USDCASH',
	name: 'Cash',
	price: '1',
	stable: true,
	fee_out: '0',
	fee_out_fixed: 2,
	decimals: 2,
	logo: 'usdcash',
	working_data: null,
}
// Threshold fee: below 50 USD a fixed 2, above it 5%
const THRESHOLD = {
	tick: 'THR',
	name: 'Threshold coin',
	price: '1',
	stable: true,
	fee_out: '5',
	fee_out_fixed: ['50', '2'],
	decimals: 2,
	logo: 'thr',
	working_data: null,
}
// Crypto coin (category 1 + network): gated behind the destination selector
const USDT = {
	tick: 'USDT',
	name: 'Tether',
	coins_categories_id: 1,
	network: 'TRC20',
	price: '1',
	stable: true,
	fee_out: '1',
	fee_out_fixed: 0,
	decimals: 2,
	logo: 'usdt',
	working_data: JSON.stringify([{ name: 'Wallet Address', type: 'text' }]),
}
// Bitcoin Lightning: precio espejo de BTC, campo Wallet para la factura/destino
const BTCLN = {
	tick: 'BTCLN',
	name: 'Bitcoin Lightning',
	price: '60000',
	stable: false,
	fee_out: '0',
	fee_out_fixed: 0,
	decimals: 8,
	logo: 'btcln',
	working_data: JSON.stringify([{ name: 'Wallet', type: 'text' }]),
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() }

// Las zonas de efectivo son una query: React Query notifica con setTimeout y este archivo
// usa fake timers, así que sus notificaciones se entregan en el acto
beforeAll(() => { notifyManager.setScheduler(callback => callback()) })
afterAll(() => { notifyManager.setScheduler(defaultScheduler) })

// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores abiertos
let clients = []
const withQuery = (client, element) => <QueryClientProvider client={client}>{element}</QueryClientProvider>

const renderWithdraw = async (params) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	let tree
	await act(async () => { tree = create(withQuery(client, <Withdraw navigation={navigation} route={{ params }} />)) })
	tree.queryClient = client
	return tree
}

const amountCard = (tree) => tree.root.findByType('WithdrawAmountCard')
const footerButton = (tree) => tree.root.findByType('QPButton')

const selectCoin = (tree, coin) => act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(coin) })
const typeQUSD = (tree, value) => act(async () => { amountCard(tree).props.onChangeQUSD(value) })
const typeCoinAmount = (tree, value) => act(async () => { amountCard(tree).props.onChangeAmountCoin(value) })
const fillField = (tree, key, text) => act(async () => { tree.root.findByType('WithdrawAccountFields').props.onChangeField(key, text) })
const pressFooter = (tree) => act(async () => { footerButton(tree).props.onPress() })

// Atestación OFAC que el modal entregaría con todo marcado
const ATTESTATION = {
	purposeCode: 'P-1',
	attestations: { notProhibitedOfficial: true, notProhibitedPartyMember: true, notRestrictedList: true, lawfulPurpose: true },
	language: 'es',
}
const ofacModal = (tree) => tree.root.findByType('OfacAttestationModal')
const attest = (tree, payload = ATTESTATION) => act(async () => { ofacModal(tree).props.onConfirm(payload) })

// Drives the happy path up to the PIN step: coin + amount + account fields + Continuar
const goToPinStep = async (tree) => {
	await selectCoin(tree, CUP)
	await typeQUSD(tree, '100')
	await fillField(tree, 'card_number', '9224061799991234')
	await fillField(tree, 'full_name', 'John Doe')
	await pressFooter(tree)
	// BANK_CUP es destino Cuba: Continuar abre la certificación antes del PIN
	await attest(tree)
	return tree.root.findByType('PinConfirmStep')
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
	useAuth.mockReturnValue({ user: { balance: 150, satoshis: 5000, two_factor_secret: null }, updateUser: jest.fn() })
	apiClient.get.mockResolvedValue({ data: [] })
	mockCoinCatalog = [CUP, USDCASH, THRESHOLD, BTCLN, USDT]
	withdrawApi.requestPin.mockResolvedValue({ success: true })
	withdrawApi.withdraw.mockResolvedValue({ success: true, data: {} })
	withdrawApi.decodeLightning.mockResolvedValue({ success: true, data: { kind: 'bolt11', amount_sat: 150000, description: 'test', expires_at: null } })
	withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'USDCASH', margin_pct: 1, zones: [] } })
	userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [] })
})
afterEach(() => {
	for (const client of clients) {
		client.clear()
		client.unmount()
	}
	clients = []
	jest.useRealTimers()
})

describe('coin loading and selection', () => {
	test('el catálogo llega de la caché compartida, sin pedirlo a la red al montar', async () => {
		const tree = await renderWithdraw()
		// useCoins ya sirve las monedas (memoria/disco) y revalida por detrás
		expect(apiClient.get).not.toHaveBeenCalledWith('/coins/v2?enabled_out=true')
		expect(tree.root.findByType('QPCoinPicker').props.coins).toHaveLength(5)
	})

	test('el precio de la moneda elegida se refresca cuando llega el catálogo nuevo', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		expect(amountCard(tree).props.selectedCoin.price).toBe(CUP.price)

		// Revalidación: mismo tick, precio nuevo. La elección se mantiene pero el
		// formulario debe calcular con el precio fresco, no con el capturado
		const repriced = { ...CUP, price: String(Number(CUP.price) * 2) }
		await act(async () => { mockCoinCatalog = [repriced, USDCASH, THRESHOLD, BTCLN, USDT] })
		await act(async () => { tree.update(withQuery(tree.queryClient, <Withdraw navigation={navigation} route={{ params: {} }} />)) })
		expect(amountCard(tree).props.selectedCoin.tick).toBe(CUP.tick)
		expect(amountCard(tree).props.selectedCoin.price).toBe(repriced.price)
	})

	test('a preselectedCoin route param selects the matching coin', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BANK_CUP' })
		expect(amountCard(tree).props.selectedCoin.tick).toBe('BANK_CUP')
	})

	test('los chips de porcentaje llenan el importe sobre el saldo', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'USDT' })
		const chips = amountCard(tree).props.chips
		expect(chips.map(c => c.label)).toEqual(['25%', '50%', 'MÁX'])
		await act(async () => { chips[0].onPress() })
		// El saldo del harness es 150
		expect(amountCard(tree).props.amountQUSD).toBe('37.50')
		// MÁX deja el saldo en cero, sin truncar a centavos
		await act(async () => { amountCard(tree).props.chips[2].onPress() })
		expect(Number(amountCard(tree).props.amountQUSD)).toBe(150)
	})

	test('con el importe congelado por una factura no hay chips', async () => {
		// Un chip que no responde se lee como una pantalla rota
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN', lnInvoice: 'lnbc1500n1qqexample', lnAmountSats: 150000 })
		expect(amountCard(tree).props.chips).toBeUndefined()
	})

	test('el importe del param llega con la conversión y la comisión ya hechas', async () => {
		// Llegando desde el intercambio: la moneda Y el importe. Antes solo viajaba la
		// moneda y el campo quedaba vacío, así que el flujo "solo cambiaba de pantalla"
		const tree = await renderWithdraw({ preselectedCoin: 'USDT', amount: '25' })
		const card = amountCard(tree)
		expect(card.props.selectedCoin.tick).toBe('USDT')
		expect(card.props.amountQUSD).toBe('25')
		// USDT a $1 con 1% de comisión: 25 - 0.25 = 24.75
		expect(Number(card.props.amountCoin)).toBeCloseTo(24.75, 2)
	})

	test('un importe inválido en el param no escribe nada', async () => {
		for (const amount of ['0', '-5', 'abc', '']) {
			const tree = await renderWithdraw({ preselectedCoin: 'USDT', amount })
			expect(amountCard(tree).props.amountQUSD).toBe('')
		}
	})

	test('selecting a coin with an amount already typed recomputes the receive amount', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDCASH)
		await typeQUSD(tree, '50')
		expect(amountCard(tree).props.amountCoin).toBe('48.00')
		await selectCoin(tree, CUP)
		// 50 QUSD - 5% fee = 47.5 USD net → 47.5 / 0.5 = 95 CUP
		expect(amountCard(tree).props.amountCoin).toBe('95.00')
	})
})

describe('amount conversion and fees', () => {
	test('QUSD to coin subtracts the percent fee and converts at the coin price', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		// 100 - 5% = 95 USD net → 95 / 0.5 = 190 CUP
		expect(amountCard(tree).props.amountCoin).toBe('190.00')
	})

	test('coin to QUSD adds the fee back to compute the required gross amount', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeCoinAmount(tree, '190')
		// 190 CUP = 95 USD net → 95 / (1 - 0.05) = 100 QUSD gross
		expect(amountCard(tree).props.amountQUSD).toBe('100')
	})

	test('a threshold fee charges the fixed amount below it and the percent above it', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, THRESHOLD)
		await typeQUSD(tree, '30')
		expect(amountCard(tree).props.amountCoin).toBe('28.00')
		await typeQUSD(tree, '100')
		expect(amountCard(tree).props.amountCoin).toBe('95.00')
	})

	test('exactly at the threshold the fixed fee still applies (server parity)', async () => {
		// The server switches to the percent only when amount > threshold, so $50
		// on a [50, 2] config pays the flat $2 (not 5% = $2.50)
		const tree = await renderWithdraw()
		await selectCoin(tree, THRESHOLD)
		await typeQUSD(tree, '50')
		expect(amountCard(tree).props.amountCoin).toBe('48.00')
	})

	test('GOLD users are quoted fee_out_gold, like the server charges them', async () => {
		useAuth.mockReturnValue({ user: { balance: 150, satoshis: 0, two_factor_secret: null, golden_check: true }, updateUser: jest.fn() })
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		// 100 - 2% gold = 98 USD net → 98 / 0.5 = 196 CUP
		expect(amountCard(tree).props.amountCoin).toBe('196.00')
	})

	test('picking a select option with fee_pct adds the surcharge and resyncs the receive amount', async () => {
		const PROVINCES = {
			tick: 'USDCASHP',
			name: 'Cash provincias',
			price: '1',
			stable: true,
			fee_out: '0',
			fee_out_fixed: 0,
			decimals: 2,
			logo: 'usdcash',
			working_data: JSON.stringify([
				{ name: 'Provincia', type: 'select', options: [{ value: 'La Habana', fee_pct: 0 }, { value: 'Holguín', fee_pct: 5 }] },
			]),
		}
		mockCoinCatalog = [PROVINCES]
		const tree = await renderWithdraw()
		await selectCoin(tree, PROVINCES)
		await typeQUSD(tree, '100')
		expect(amountCard(tree).props.amountCoin).toBe('100.00')
		// Choosing the surcharged province re-derives the receive side from the gross
		await fillField(tree, 'provincia', 'Holguín')
		expect(amountCard(tree).props.amountCoin).toBe('95.00')
		// And a fee-free province goes back to the full amount
		await fillField(tree, 'provincia', 'La Habana')
		expect(amountCard(tree).props.amountCoin).toBe('100.00')
	})

	test('clearing the amount clears the converted amount too', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		await typeQUSD(tree, '')
		expect(amountCard(tree).props.amountCoin).toBe('')
	})
})

describe('form validation', () => {
	test('Continuar stays disabled until coin, amount and every account field are set', async () => {
		const tree = await renderWithdraw()
		expect(footerButton(tree).props.disabled).toBe(true)
		await selectCoin(tree, CUP)
		expect(footerButton(tree).props.disabled).toBe(true)
		await typeQUSD(tree, '100')
		expect(footerButton(tree).props.disabled).toBe(true)
		await fillField(tree, 'card_number', '9224061799991234')
		expect(footerButton(tree).props.disabled).toBe(true)
		await fillField(tree, 'full_name', 'John Doe')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('CURRENT BEHAVIOR: the amount is never validated against the balance client-side', async () => {
		// balance is 150 but 9999 QUSD still enables Continuar — only the server rejects it
		const tree = await renderWithdraw()
		await selectCoin(tree, USDCASH)
		await typeQUSD(tree, '9999')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('below the coin min_out Continuar stays disabled and the minimum is shown BEFORE the PIN', async () => {
		// El servidor compara el bruto con min_out después de validar el PIN: sin esto se teclea el PIN para nada
		mockCoinCatalog = [{ ...USDCASH, min_out: '50', max_out: 1000 }]
		const tree = await renderWithdraw()
		await selectCoin(tree, mockCoinCatalog[0])
		await typeQUSD(tree, '30')
		expect(footerButton(tree).props.disabled).toBe(true)
		expect(tree.root.findByProps({ testID: 'withdraw-amount-limit' }).props.children).toBe('El mínimo para retirar con Cash es $50')
		await typeQUSD(tree, '50')
		expect(footerButton(tree).props.disabled).toBe(false)
		expect(tree.root.findAllByProps({ testID: 'withdraw-amount-limit' })).toHaveLength(0)
		await typeQUSD(tree, '1200')
		expect(footerButton(tree).props.disabled).toBe(true)
		expect(tree.root.findByProps({ testID: 'withdraw-amount-limit' }).props.children).toBe('El máximo para retirar con Cash es $1000')
	})

	test('Continuar opens the PIN step and the footer becomes the Extraer button', async () => {
		const tree = await renderWithdraw()
		await goToPinStep(tree)
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(1)
		expect(footerButton(tree).props.title).toBe('Extraer $100 QUSD')
	})
})

describe('PIN request', () => {
	test('a successful PIN request toasts the email hint', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { await pinStep.props.onRequestPin() })
		expect(withdrawApi.requestPin).toHaveBeenCalled()
		expect(toast.success).toHaveBeenCalledWith('PIN enviado', { description: 'Revisa tu correo electrónico' })
	})

	test('a failed PIN request surfaces the backend error', async () => {
		withdrawApi.requestPin.mockResolvedValue({ success: false, error: 'Espera un momento' })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { await pinStep.props.onRequestPin() })
		expect(toast.error).toHaveBeenCalledWith('Espera un momento')
	})
})

describe('withdraw submission', () => {
	test('a complete PIN auto-submits with amount, coin, original field names and the pin', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith({
			amount: '100',
			coin: 'BANK_CUP',
			details: { 'Card Number': '9224061799991234', 'Full Name': 'John Doe' },
			pin: '1234',
			idempotencyKey: expect.stringMatching(/^[A-Za-z0-9._-]{8,64}$/),
			compliance: ATTESTATION,
		})
		expect(toast.success).toHaveBeenCalledWith('Extracción procesada', { description: 'Se han extraído $100 QUSD' })
		expect(navigation.goBack).toHaveBeenCalled()
	})

	test('an incomplete PIN pressed manually toasts a validation error and never calls the API', async () => {
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1') })
		await pressFooter(tree)
		expect(withdrawApi.withdraw).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Ingresa un PIN de 4 dígitos')
	})

	test('an API failure surfaces the backend error and stays on the screen', async () => {
		withdrawApi.withdraw.mockResolvedValue({ success: false, error: 'Fondos insuficientes', status: 422 })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Fondos insuficientes')
		expect(navigation.goBack).not.toHaveBeenCalled()
	})

	test('a network failure (no HTTP status) promises a safe retry and keeps the SAME idempotency key', async () => {
		withdrawApi.withdraw.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Error de red', {
			description: 'No se ha podido conectar con el servidor. Puedes reintentar sin riesgo de duplicar la operación.',
		})
		// Retry the same attempt via the footer button: the key must not rotate on failure
		await pressFooter(tree)
		const keys = withdrawApi.withdraw.mock.calls.map(([args]) => args.idempotencyKey)
		expect(keys).toHaveLength(2)
		expect(keys[1]).toBe(keys[0])
	})

	test('a thrown error toasts the generic Spanish message', async () => {
		withdrawApi.withdraw.mockRejectedValue(new Error('network down'))
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Error al procesar la extracción')
	})
})

describe('OTP method (TOTP 2FA)', () => {
	test('toggling to OTP expects 6 digits and the screen passes a leading-zero code intact', async () => {
		useAuth.mockReturnValue({ user: { balance: 150, satoshis: 0, two_factor_secret: 'SECRET' }, updateUser: jest.fn() })
		const tree = await renderWithdraw()
		let pinStep = await goToPinStep(tree)
		expect(pinStep.props.hasOTP).toBe(true)
		expect(pinStep.props.codeLength).toBe(4)
		await act(async () => { pinStep.props.onMethodToggle('right') })
		pinStep = tree.root.findByType('PinConfirmStep')
		expect(pinStep.props.twoFactorMethod).toBe('otp')
		expect(pinStep.props.codeLength).toBe(6)
		await act(async () => { pinStep.props.onChangePin('012345') })
		// The screen forwards the string '012345' untouched, and withdrawApi now
		// serializes it as String(pin) — the leading zero survives to the server
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({
			amount: '100', coin: 'BANK_CUP', pin: '012345',
		}))
	})
})

describe('crypto destination gate', () => {
	const destinationSelector = (tree) => tree.root.findByType('WithdrawDestinationSelector')
	const chooseDestination = (tree, value) => act(async () => { destinationSelector(tree).props.onSelect(value) })

	test('a non-crypto coin never renders the destination selector', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		expect(tree.root.findAllByType('WithdrawDestinationSelector')).toHaveLength(0)
	})

	test('a crypto coin hides the account fields and blocks Continuar until the personal wallet is chosen', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await typeQUSD(tree, '100')
		expect(destinationSelector(tree).props.destination).toBe(null)
		expect(tree.root.findAllByType('WithdrawAccountFields')).toHaveLength(0)
		expect(footerButton(tree).props.disabled).toBe(true)
		await chooseDestination(tree, 'personal')
		await fillField(tree, 'wallet_address', 'TXYZabc123')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('choosing third party keeps the fields hidden and Continuar disabled', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await typeQUSD(tree, '100')
		await chooseDestination(tree, 'third_party')
		expect(tree.root.findAllByType('WithdrawAccountFields')).toHaveLength(0)
		expect(footerButton(tree).props.disabled).toBe(true)
	})

	test('switching coins resets the destination', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await chooseDestination(tree, 'personal')
		expect(destinationSelector(tree).props.destination).toBe('personal')
		await selectCoin(tree, CUP)
		await selectCoin(tree, USDT)
		expect(destinationSelector(tree).props.destination).toBe(null)
	})
})

describe('OFAC attestation gate', () => {
	test('a Cuba-bound coin opens the CACR certification before the PIN step', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		await fillField(tree, 'card_number', '9224061799991234')
		await fillField(tree, 'full_name', 'John Doe')
		await pressFooter(tree)
		expect(ofacModal(tree).props).toMatchObject({ visible: true, scope: 'cuba_value', context: 'withdraw', tick: 'BANK_CUP' })
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)
	})

	test('closing the certification keeps the form and never reaches the PIN step', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDCASH)
		await typeQUSD(tree, '50')
		await pressFooter(tree)
		await act(async () => { ofacModal(tree).props.onClose() })
		expect(ofacModal(tree).props.visible).toBe(false)
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)
	})

	test('a crypto withdrawal asks for the W-1 own-wallet attestation', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await typeQUSD(tree, '100')
		await act(async () => { tree.root.findByType('WithdrawDestinationSelector').props.onSelect('personal') })
		await fillField(tree, 'wallet_address', 'TXYZabc123')
		await pressFooter(tree)
		expect(ofacModal(tree).props).toMatchObject({ visible: true, scope: 'crypto_out', context: 'crypto' })
		const w1 = { ...ATTESTATION, purposeCode: 'W-1' }
		await attest(tree, w1)
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({ coin: 'USDT', compliance: w1 }))
	})

	test('a rail that is neither Cuban nor crypto goes straight to the PIN step', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, THRESHOLD)
		await typeQUSD(tree, '100')
		await pressFooter(tree)
		expect(ofacModal(tree).props.visible).toBe(false)
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({ coin: 'THR', compliance: null }))
	})

	test('changing to another coin with the PIN step open blocks the submit until re-certified', async () => {
		const tree = await renderWithdraw()
		await goToPinStep(tree)
		await selectCoin(tree, USDCASH)
		await typeQUSD(tree, '50')
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('1234') })
		expect(withdrawApi.withdraw).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Debes completar la certificación para este retiro')
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)
	})

	test('a backend CACR_ATTESTATION_REQUIRED closes the PIN step so Continuar asks again', async () => {
		withdrawApi.withdraw.mockResolvedValue({ success: false, error: 'Debes completar la autocertificación OFAC', status: 400, details: { code: 'CACR_ATTESTATION_REQUIRED' } })
		const tree = await renderWithdraw()
		const pinStep = await goToPinStep(tree)
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(toast.error).toHaveBeenCalledWith('Debes completar la autocertificación OFAC')
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)
		await pressFooter(tree)
		expect(ofacModal(tree).props.visible).toBe(true)
	})
})

describe('Lightning (BTCLN)', () => {
	const satsCard = (tree) => tree.root.findByType('WithdrawSatsCard')

	test('lnInvoice + lnAmountSats params prefill the Wallet field and lock the invoice amount', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN', lnInvoice: 'lnbc1500n1qqexample', lnAmountSats: 150000 })
		const fields = tree.root.findByType('WithdrawAccountFields')
		expect(fields.props.workingForm.wallet).toBe('lnbc1500n1qqexample')
		expect(fields.props.multilineKeys).toEqual(['wallet'])
		const card = amountCard(tree)
		expect(card.props.locked).toBe(true)
		expect(card.props.amountCoin).toBe('0.00150000') // 150000 sats en BTC
		expect(withdrawApi.decodeLightning).toHaveBeenCalledWith('lnbc1500n1qqexample')
	})

	test('the source switch shows with any coin when sats are redeemable, and picking sats selects BTCLN', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'USDT' })
		expect(amountCard(tree).props.selectedCoin.tick).toBe('USDT')
		const sourceSwitch = tree.root.findByType('QPSwitch')
		await act(async () => { sourceSwitch.props.onChange('right') })
		expect(satsCard(tree).props.availableSats).toBe(5000)
		expect(satsCard(tree).props.btcPrice).toBe(60000) // la moneda pasó a BTCLN
		// Volver a Saldo recupera la moneda que había
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange('left') })
		expect(amountCard(tree).props.selectedCoin.tick).toBe('USDT')
	})

	test('no source switch when the sats do not cover BTCLN min_out', async () => {
		mockCoinCatalog = [CUP, USDCASH, THRESHOLD, { ...BTCLN, min_out: '5' }, USDT] // 5000 sats = $3 < $5
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		expect(tree.root.findAllByType('QPSwitch')).toHaveLength(0)
	})

	test('the source switch appears for BTCLN and swaps the amount card for the sats card', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		const sourceSwitch = tree.root.findByType('QPSwitch')
		await act(async () => { sourceSwitch.props.onChange('right') })
		expect(satsCard(tree).props.availableSats).toBe(5000)
		expect(tree.root.findAllByType('WithdrawAmountCard')).toHaveLength(0)
	})

	test('redeeming sats submits source satoshis with the integer amount and updates the local user', async () => {
		const updateUser = jest.fn()
		useAuth.mockReturnValue({ user: { balance: 150, satoshis: 5000, two_factor_secret: null }, updateUser })
		withdrawApi.withdraw.mockResolvedValue({ success: true, data: { result: 'OK', data: { satoshis: 3000 } } })
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange('right') })
		await act(async () => { satsCard(tree).props.onChangeAmountSats('2000') })
		await fillField(tree, 'wallet', 'usuario@getalby.com')
		await pressFooter(tree)
		const pinStep = tree.root.findByType('PinConfirmStep')
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith({
			amount: '',
			coin: 'BTCLN',
			details: { Wallet: 'usuario@getalby.com' },
			pin: '1234',
			source: 'satoshis',
			amountSats: 2000,
			idempotencyKey: expect.stringMatching(/^[A-Za-z0-9._-]{8,64}$/),
			compliance: null,
		})
		expect(updateUser).toHaveBeenCalledWith({ satoshis: 3000 })
	})

	test('sats below the minimum or above the available balance keep the form invalid', async () => {
		const tree = await renderWithdraw({ preselectedCoin: 'BTCLN' })
		await act(async () => { tree.root.findByType('QPSwitch').props.onChange('right') })
		await fillField(tree, 'wallet', 'usuario@getalby.com')
		await act(async () => { satsCard(tree).props.onChangeAmountSats('50') }) // < 100
		expect(footerButton(tree).props.disabled).toBe(true)
		await act(async () => { satsCard(tree).props.onChangeAmountSats('9000') }) // > 5000 disponibles
		expect(footerButton(tree).props.disabled).toBe(true)
		await act(async () => { satsCard(tree).props.onChangeAmountSats('2000') })
		expect(footerButton(tree).props.disabled).toBe(false)
	})
})

describe('cash delivery zones', () => {
	// Efectivo con provincia (select con fee_pct, que en modo zonas se ignora) + municipio
	const CASH_ZONED = {
		tick: 'CASHZ',
		name: 'Cash zones',
		price: '1',
		stable: true,
		fee_out: '1',
		fee_out_fixed: null,
		decimals: 2,
		logo: 'usdcash',
		working_data: [
			{ name: 'Nombre y Apellidos', type: 'text' },
			{ name: 'Provincia', type: 'select', options: [{ value: 'Villa Clara', fee_pct: 5 }] },
			{ name: 'Municipio', type: 'text' },
		],
	}
	const SANTA_CLARA = {
		id: '1', coin_tick: 'CASHZ', province_code: 'VCL', province_name: 'Villa Clara', municipality: 'Santa Clara',
		is_capital: true, provider_pct: 3, margin_pct: null, min_usd: 50, small_flat_usd: 4,
		eta_min_hours: 24, eta_max_hours: 48, home_delivery: true, route: 'p2p', enabled: true,
	}
	const zoneNode = (tree) => tree.root.findByType('WithdrawAccountFields').props.slot.node
	const pickZone = async (tree) => {
		await act(async () => { zoneNode(tree).props.onChangeProvince('Villa Clara') })
		await act(async () => { zoneNode(tree).props.onChangeMunicipality('Santa Clara') })
	}

	beforeEach(() => {
		mockCoinCatalog = [CASH_ZONED, CUP]
		withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [SANTA_CLARA] } })
	})

	test('sin zonas en el servidor no hay selects (comportamiento previo)', async () => {
		withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [] } })
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		expect(withdrawApi.cashZones).toHaveBeenCalledWith('CASHZ')
		expect(tree.root.findByType('WithdrawAccountFields').props.slot).toBeNull()
	})

	test('un backend sin la ruta (404) deja el comportamiento previo', async () => {
		withdrawApi.cashZones.mockResolvedValue({ success: false, error: 'Not found', status: 404 })
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		expect(tree.root.findByType('WithdrawAccountFields').props.slot).toBeNull()
		expect(tree.root.findAllByProps({ testID: 'cash-zones-error' })).toHaveLength(0)
	})

	test('un fallo al pedir zonas NO cotiza el fee viejo: bloquea continuar y ofrece reintentar', async () => {
		// El servidor cobraría por zona: cotizar el fee_pct de provincia sería enseñar otro fee
		withdrawApi.cashZones.mockResolvedValue({ success: false, error: 'Ha ocurrido un error, contacte a soporte' })
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await typeQUSD(tree, '200')
		await fillField(tree, 'nombre_y_apellidos', 'Juan Pérez')
		await fillField(tree, 'provincia', 'Villa Clara')
		await fillField(tree, 'municipio', 'Santa Clara')
		expect(tree.root.findAllByProps({ testID: 'cash-zones-error' }).length).toBeGreaterThan(0)
		expect(footerButton(tree).props.disabled).toBe(true)

		// Reintentar con el servidor de vuelta: aparecen los selects de zona
		withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [SANTA_CLARA] } })
		const retry = tree.root.findByProps({ testID: 'cash-zones-error' }).findByProps({ accessibilityRole: 'button' })
		await act(async () => { retry.props.onPress() })
		expect(tree.root.findAllByProps({ testID: 'cash-zones-error' })).toHaveLength(0)
		expect(tree.root.findByType('WithdrawAccountFields').props.slot).not.toBeNull()
	})

	test('monedas sin municipio no piden zonas', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		expect(withdrawApi.cashZones).not.toHaveBeenCalled()
	})

	test('cambiar de provincia limpia el municipio', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await pickZone(tree)
		expect(zoneNode(tree).props.municipality).toBe('Santa Clara')
		await act(async () => { zoneNode(tree).props.onChangeProvince('Villa Clara') })
		expect(zoneNode(tree).props.municipality).toBe('')
		expect(zoneNode(tree).props.zone).toBeNull()
	})

	test('fee = base + cargo de zona (sin el fee_pct de provincia) y el payload lleva nombres de zona', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await typeQUSD(tree, '200')
		await fillField(tree, 'nombre_y_apellidos', 'Juan Pérez')
		expect(footerButton(tree).props.disabled).toBe(true)
		await pickZone(tree)
		// base 1 % = 2; proveedor max(6, 4) = 6; margen 1 % = 2 ⇒ 10 ⇒ recibe 190
		expect(Number(amountCard(tree).props.amountCoin)).toBeCloseTo(190, 2)
		expect(zoneNode(tree).props.charge.total).toBe(8)
		expect(footerButton(tree).props.disabled).toBe(false)
		await pressFooter(tree)
		const pinStep = tree.root.findByType('PinConfirmStep')
		await act(async () => { pinStep.props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({
			amount: '200',
			coin: 'CASHZ',
			details: { 'Nombre y Apellidos': 'Juan Pérez', Provincia: 'Villa Clara', Municipio: 'Santa Clara' },
		}))
	})

	test('con zonas, la provincia sale de la zona aunque el select no la tenga entre sus opciones', async () => {
		const PLAZA = { ...SANTA_CLARA, id: '2', province_code: 'LHA', province_name: 'La Habana', municipality: 'Plaza', is_capital: false }
		withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [SANTA_CLARA, PLAZA] } })
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await typeQUSD(tree, '200')
		await fillField(tree, 'nombre_y_apellidos', 'Juan Pérez')
		await act(async () => { zoneNode(tree).props.onChangeProvince('La Habana') })
		await act(async () => { zoneNode(tree).props.onChangeMunicipality('Plaza') })
		expect(zoneNode(tree).props.zone.id).toBe('2')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('por debajo del mínimo entregado el envío queda bloqueado', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await fillField(tree, 'nombre_y_apellidos', 'Juan Pérez')
		await pickZone(tree)
		// 55 brutos: base 0.55 + fija 4 + margen 0.55 ⇒ entrega 49.90 < 50
		await typeQUSD(tree, '55')
		expect(zoneNode(tree).props.belowMin).toBe(true)
		expect(footerButton(tree).props.disabled).toBe(true)
	})

	test('"recibir" resuelve el bruto por bisección', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await pickZone(tree)
		await typeCoinAmount(tree, '190')
		expect(amountCard(tree).props.amountQUSD).toBe('200')
	})
})

describe('saved payment methods (el librito)', () => {
	const CUP_METHOD = { id: '7', name: 'Mi CUP', coin: { tick: 'bank_cup', name: 'Banco CUP' }, details: { 'Card Number': '9224061799991234', 'Full Name': 'Ana Pérez' } }
	const USDT_METHOD = { id: '8', name: 'Mi USDT', coin: { tick: 'USDT' }, details: [{ name: 'Wallet Address', value: 'TXYZ' }] }
	const savedModal = (tree) => tree.root.findByType('SavedMethodsModal')
	const openBook = (tree) => act(async () => { tree.root.findByType('WithdrawAccountFields').props.onOpenSaved() })

	test('sin moneda no se piden; con moneda, el libro abre la hoja con SOLO los de esa moneda', async () => {
		userApi.getPaymentMethods.mockResolvedValue({ success: true, data: { methods: [CUP_METHOD, USDT_METHOD, { id: '9', coin: null, details: {} }] } })
		const tree = await renderWithdraw()
		expect(userApi.getPaymentMethods).not.toHaveBeenCalled()
		expect(savedModal(tree).props.visible).toBe(false)
		await selectCoin(tree, CUP)
		expect(userApi.getPaymentMethods).toHaveBeenCalledTimes(1)
		await openBook(tree)
		expect(savedModal(tree).props.visible).toBe(true)
		expect(savedModal(tree).props.methods).toEqual([CUP_METHOD])
	})

	test('elegir un método rellena los campos, cierra la hoja y el retiro sale con esos details', async () => {
		userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [CUP_METHOD] })
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await typeQUSD(tree, '100')
		await openBook(tree)
		await act(async () => { savedModal(tree).props.onSelect(CUP_METHOD) })
		expect(savedModal(tree).props.visible).toBe(false)
		expect(tree.root.findByType('WithdrawAccountFields').props.workingForm).toEqual({ card_number: '9224061799991234', full_name: 'Ana Pérez' })
		expect(footerButton(tree).props.disabled).toBe(false)
		await pressFooter(tree)
		await attest(tree)
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('1234') })
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({
			coin: 'BANK_CUP',
			details: { 'Card Number': '9224061799991234', 'Full Name': 'Ana Pérez' },
		}))
	})

	test('un fallo al cargar los métodos no molesta: la hoja sale vacía y se teclea a mano', async () => {
		userApi.getPaymentMethods.mockResolvedValue({ success: false, error: 'No autorizado', status: 500 })
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await openBook(tree)
		expect(toast.error).not.toHaveBeenCalled()
		expect(savedModal(tree).props.methods).toEqual([])
		expect(tree.root.findAllByProps({ testID: 'cash-zones-error' })).toHaveLength(0)
	})

	test('«Gestionar» cierra la hoja y lleva a Ajustes → Métodos de pago', async () => {
		const tree = await renderWithdraw()
		await selectCoin(tree, CUP)
		await openBook(tree)
		await act(async () => { savedModal(tree).props.onManage() })
		expect(savedModal(tree).props.visible).toBe(false)
		expect(navigation.navigate).toHaveBeenCalledWith('SettingsStack', { screen: 'PaymentMethods', initial: false })
	})

	test('en efectivo por zonas, el lugar guardado con el formulario viejo se traduce al tarifario', async () => {
		const CASH_ZONED = {
			tick: 'CASHZ', name: 'Cash zones', price: '1', stable: true, fee_out: '1', fee_out_fixed: null, decimals: 2, logo: 'usdcash',
			working_data: [
				{ name: 'Nombre y Apellidos', type: 'text' },
				{ name: 'Provincia', type: 'select', options: [{ value: 'Villa Clara', fee_pct: 5 }] },
				{ name: 'Municipio', type: 'text' },
			],
		}
		const SANTA_CLARA = {
			id: '1', coin_tick: 'CASHZ', province_code: 'VCL', province_name: 'Villa Clara', municipality: 'Santa Clara',
			is_capital: true, provider_pct: 3, margin_pct: null, min_usd: 50, small_flat_usd: 4,
			eta_min_hours: 24, eta_max_hours: 48, home_delivery: true, route: 'p2p', enabled: true,
		}
		mockCoinCatalog = [CASH_ZONED]
		withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [SANTA_CLARA] } })
		// Guardado cuando "Provincia" era un select de ciudades y el municipio iba en código
		const OLD_PLACE = { id: '3', name: 'Casa', coin: { tick: 'CASHZ' }, details: { 'Nombre y Apellidos': 'Juan', Provincia: 'Santa Clara', Municipio: 'santa clara' } }
		userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [OLD_PLACE] })
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_ZONED)
		await openBook(tree)
		await act(async () => { savedModal(tree).props.onSelect(OLD_PLACE) })
		const zoneNode = tree.root.findByType('WithdrawAccountFields').props.slot.node
		expect(zoneNode.props.province).toBe('Villa Clara')
		expect(zoneNode.props.municipality).toBe('Santa Clara')
		expect(zoneNode.props.zone.id).toBe('1')
	})

	// Sin zonas en el servidor, la provincia es el select de siempre: nada traduce un lugar viejo
	const CASH_NO_ZONES = {
		tick: 'CASHZ', name: 'Cash zones', price: '1', stable: true, fee_out: '1', fee_out_fixed: null, decimals: 2, logo: 'usdcash',
		working_data: [
			{ name: 'Nombre y Apellidos', type: 'text' },
			{ name: 'Provincia', type: 'select', options: [{ value: 'Villa Clara', fee_pct: 5 }] },
			{ name: 'Municipio', type: 'text' },
		],
	}
	const OLD_CITY_PLACE = { id: '4', name: 'Casa', coin: { tick: 'CASHZ' }, details: { 'Nombre y Apellidos': 'Juan', Provincia: 'Santa Clara', Municipio: 'Santa Clara' } }
	const withoutZones = () => {
		mockCoinCatalog = [CASH_NO_ZONES]
		withdrawApi.cashZones.mockResolvedValue({ success: true, data: { coin: 'CASHZ', margin_pct: 1, zones: [] } })
		userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [OLD_CITY_PLACE] })
	}

	test('sin zonas, un lugar guardado que no es ninguno de los chips no deja continuar hasta elegir uno', async () => {
		withoutZones()
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_NO_ZONES)
		await typeQUSD(tree, '100')
		await openBook(tree)
		await act(async () => { savedModal(tree).props.onSelect(OLD_CITY_PLACE) })
		// «Santa Clara» no es ningún chip: ni cotiza el 5 % de la provincia ni puede llegar al servidor
		expect(tree.root.findByType('WithdrawAccountFields').props.workingForm.provincia).toBe('Santa Clara')
		expect(footerButton(tree).props.disabled).toBe(true)
		await fillField(tree, 'provincia', 'Villa Clara')
		// base 1 % + provincia 5 % ⇒ recibe 94
		expect(amountCard(tree).props.amountCoin).toBe('94.00')
		expect(footerButton(tree).props.disabled).toBe(false)
	})

	test('con el PIN abierto, elegir un método con una opción vieja no deja que el autoenvío del PIN lo mande', async () => {
		withoutZones()
		const tree = await renderWithdraw()
		await selectCoin(tree, CASH_NO_ZONES)
		await typeQUSD(tree, '100')
		await fillField(tree, 'nombre_y_apellidos', 'Juan')
		await fillField(tree, 'provincia', 'Villa Clara')
		await fillField(tree, 'municipio', 'Santa Clara')
		await pressFooter(tree)
		// El formulario sigue editable bajo el paso de PIN
		await openBook(tree)
		await act(async () => { savedModal(tree).props.onSelect(OLD_CITY_PLACE) })
		expect(footerButton(tree).props.disabled).toBe(true)
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('1234') })
		expect(withdrawApi.withdraw).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('Completa los datos del retiro antes de confirmar')
		// Elegido el chip, el botón manda la opción buena con el PIN ya tecleado
		await fillField(tree, 'provincia', 'Villa Clara')
		expect(footerButton(tree).props.disabled).toBe(false)
		await pressFooter(tree)
		expect(withdrawApi.withdraw).toHaveBeenCalledTimes(1)
		expect(withdrawApi.withdraw).toHaveBeenCalledWith(expect.objectContaining({
			pin: '1234',
			details: { 'Nombre y Apellidos': 'Juan', Provincia: 'Villa Clara', Municipio: 'Santa Clara' },
		}))
	})

	test('con una moneda cripto, elegir un método marca el destino como wallet propia', async () => {
		userApi.getPaymentMethods.mockResolvedValue({ success: true, data: [USDT_METHOD] })
		const tree = await renderWithdraw()
		await selectCoin(tree, USDT)
		await act(async () => { tree.root.findByType('WithdrawDestinationSelector').props.onSelect('personal') })
		await openBook(tree)
		await act(async () => { savedModal(tree).props.onSelect(USDT_METHOD) })
		expect(tree.root.findByType('WithdrawAccountFields').props.workingForm).toEqual({ wallet_address: 'TXYZ' })
		expect(tree.root.findByType('WithdrawDestinationSelector').props.destination).toBe('personal')
	})
})
