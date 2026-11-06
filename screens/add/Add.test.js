/**
 * Behavior tests for the deposit ("Add money") screen — node environment with
 * every collaborator mocked (see keypadAmount.test.js for why node env, and
 * auth/screens/Login.test.js for the screen-testing pattern).
 * @jest-environment node
 */
let mockCoinCatalog = []
// Catálogo completo (`useCoins('all')`): de ahí salen las monedas «Vía P2P»
let mockAllCoins = []
jest.mock('../../hooks/useCoins', () => ({
	__esModule: true,
	default: (kind) => ({ coins: kind === 'all' ? mockAllCoins : mockCoinCatalog, isLoading: false }),
}))
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../settings/SettingsContext', () => ({ useSettings: () => ({ sounds: { enabled: true, transactionSound: true } }) }))
jest.mock('../../helpers/playSound', () => jest.fn())
jest.mock('../../helpers/walletDeeplinks', () => ({ detectInstalledWallets: jest.fn() }))
jest.mock('../../helpers/inAppReview', () => ({ maybeRequestReview: jest.fn() }))
// Puente con la wallet self-custody: sin wallet en estos tests (el botón "Pagar desde Mi Wallet" no aparece)
jest.mock('../../wallet/WalletContext', () => ({ useWallet: () => ({ hasWallet: false, isBackedUp: false, addresses: null }) }))
jest.mock('../crypto/wallet/useAssetCatalog', () => ({ useAssetCatalog: () => [] }))
jest.mock('../../ui/QPKeyboardView', () => {
	const React = require('react')
	const { View } = require('react-native')
	return ({ children, actions }) => React.createElement(View, null, children, actions)
})
jest.mock('../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../ui/QPAmountCard', () => 'QPAmountCard')
// QPFlipButton usa reanimated, que este entorno node no trae
jest.mock('../../ui/particles/QPFlipButton', () => { const C = 'QPFlipButton'; return { __esModule: true, default: C, FLIP_BUTTON_SIZE: 44 } })
jest.mock('../../ui/QPCoinPicker', () => 'QPCoinPicker')
jest.mock('../../ui/WalletPickerSheet', () => 'WalletPickerSheet')
jest.mock('./DepositDetailsModal', () => 'DepositDetailsModal')
jest.mock('./cardPaymentSheet', () => ({ presentCardDeposit: jest.fn() }))
jest.mock('./CardFeeModeSelector', () => 'CardFeeModeSelector')
jest.mock('./DepositViaP2PBlock', () => 'DepositViaP2PBlock')
// Acceso a la verificación del SSN y el pressable (Reanimated) que lo pinta
jest.mock('./SsnTierCta', () => 'SsnTierCta')
jest.mock('../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../api/client', () => {
	// userApi (GET /user/cip) importa el export nombrado: mismo objeto que el default
	const client = { get: jest.fn(), post: jest.fn() }
	return { __esModule: true, default: client, apiClient: client }
})
jest.mock('../../hooks/useTransactionSSE', () => jest.fn())
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
// Modal OFAC como host: el gate y la consulta /user/cip corren de verdad
jest.mock('../../ui/OfacAttestationModal', () => 'OfacAttestationModal')

import React from 'react'
import { Linking } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { detectInstalledWallets } from '../../helpers/walletDeeplinks'
import { maybeRequestReview } from '../../helpers/inAppReview'
import apiClient from '../../api/client'
import { presentCardDeposit } from './cardPaymentSheet'
import useTransactionSSE from '../../hooks/useTransactionSSE'
import playSound from '../../helpers/playSound'
import { toast } from 'sonner-native'
import Add from './Add'

const updateUser = jest.fn()
const navigate = jest.fn()
const USDT = { tick: 'USDT', name: 'Tether', min_in: '10', network: 'TRC20' }
const ETECSA = { tick: 'ETECSA', name: 'Saldo ETECSA', enabled_in: 0 }

// The SSE hook is mocked; capture its status callback so tests can emit updates
let sseCallback = null
// Se guardan para desmontarlos: un QueryClient vivo deja temporizadores de
// recolección abiertos y jest no llega a cerrar el proceso (patrón Send.test.js)
let trees = []
let clients = []

const renderAdd = async (renderParams) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	let tree
	await act(async () => {
		tree = create(
			<QueryClientProvider client={client}>
				<Add navigation={{ navigate }} route={{ params: renderParams }} />
			</QueryClientProvider>
		)
	})
	trees.push(tree)
	// React Query notifica por notifyManager (setTimeout): con fake timers hay que
	// mover el reloj para que la elegibilidad y la ficha CIP lleguen a la pantalla
	await settle()
	return tree
}
const settle = () => act(async () => { jest.advanceTimersByTime(50) })

const pickCoinAndAmount = async (tree, coin = USDT, amount = '50') => {
	await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(coin) })
	await act(async () => { tree.root.findAllByType('QPAmountCard')[0].props.onChangeAmount(amount) })
}

const pressGenerate = (tree) => act(async () => { tree.root.findByType('QPButton').props.onPress() })

// `GET /user/deposit-eligibility`: la ÚNICA fuente de si se pintan CARD y PAYPAL
const RAIL_ON = { eligible: true, tier: 'full', reason: null }
const RAIL_OFF = { eligible: false, tier: null, reason: 'NOT_ELIGIBLE' }
const SSN_TIER = { enabled: true, verified: false, cap: 500, used_30d: 0, remaining: 0, window_days: 30, resets_at: null }
const ELIGIBILITY = { channel: 'ios', card: RAIL_ON, paypal: RAIL_ON, bank: RAIL_OFF, ssn_tier: SSN_TIER }
const mockGets = ({ eligibility = ELIGIBILITY, cip = { us_person: false } } = {}) => apiClient.get.mockImplementation(url => {
	if (url === '/user/deposit-eligibility') {
		return eligibility instanceof Error ? Promise.reject(eligibility) : Promise.resolve({ data: { result: 'OK', data: eligibility } })
	}
	if (url === '/user/cip') { return cip instanceof Error ? Promise.reject(cip) : Promise.resolve({ data: cip }) }
	return Promise.resolve({ data: [] })
})

beforeEach(() => {
	jest.clearAllMocks()
	mockAllCoins = []
	jest.useFakeTimers()
	jest.spyOn(Linking, 'openURL').mockResolvedValue()
	useAuth.mockReturnValue({ user: { balance: '100.00' }, updateUser })
	apiClient.get.mockResolvedValue({ data: [] })
	apiClient.post.mockResolvedValue({ status: 200, data: { data: { transaction_uuid: 'tx-1', wallet: null } } })
	detectInstalledWallets.mockResolvedValue([])
	useTransactionSSE.mockImplementation((uuid, cb) => {
		sseCallback = cb
		return { isConnected: !!uuid }
	})
})
afterEach(async () => {
	// Desmontar DENTRO de act: con dos queries vivas, un unmount suelto deja trabajo de
	// React programado con los fake timers y jest no cierra el proceso
	for (const tree of trees) { await act(async () => { tree.unmount() }) }
	trees = []
	clients.forEach(client => client.clear())
	clients = []
	jest.useRealTimers()
	Linking.openURL.mockRestore()
})

test('sin catálogo avisa, y el aviso se va cuando llega', async () => {
	mockCoinCatalog = []
	const tree = await renderAdd()
	const screen = (params) => tree.update(<QueryClientProvider client={clients.at(-1)}><Add navigation={{ navigate }} route={{ params }} /></QueryClientProvider>)
	expect(JSON.stringify(tree.toJSON())).toContain('Error al cargar las monedas disponibles')
	mockCoinCatalog = [USDT]
	await act(async () => { screen() })
	expect(JSON.stringify(tree.toJSON())).not.toContain('Error al cargar las monedas disponibles')
	expect(tree.root.findByType('QPCoinPicker').props.coins).toEqual([USDT])
})

test('el catálogo llega de la caché compartida, sin pedirlo al montar', async () => {
	const coins = [{ name: 'Criptomonedas', coins: [USDT] }]
	mockCoinCatalog = coins
	const tree = await renderAdd()
	// useCoins sirve el catálogo desde memoria/disco y revalida por detrás
	expect(apiClient.get).not.toHaveBeenCalledWith('/coins/v2?enabled_in=true')
	expect(tree.root.findByType('QPCoinPicker').props.coins).toBe(coins)
})

describe('topup validations', () => {
	test('la moneda Y el importe del param llegan puestos', async () => {
		// Llegando desde el intercambio: antes solo viajaba la moneda y el campo quedaba
		// vacío, así que el flujo "solo cambiaba de pantalla".
		// OJO al catálogo: `useCoins` devuelve la lista PLANA, no la agrupada de los
		// fixtures viejos, y es sobre la plana sobre la que se busca el tick.
		mockCoinCatalog = [USDT]
		const tree = await renderAdd({ preselectedCoin: 'USDT', amount: '25' })
		expect(tree.root.findAllByType('QPAmountCard')[0].props.amount).toBe('25')
	})

	test('rejects a non-positive amount', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT, '0')
		await pressGenerate(tree)
		expect(toast.error).toHaveBeenCalledWith('Por favor ingresa un monto válido')
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('enforces the coin minimum with its name in the message', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT, '5')
		await pressGenerate(tree)
		expect(toast.error).toHaveBeenCalledWith('El monto mínimo para Tether es 10')
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('the button stays disabled until coin and amount are set', async () => {
		const tree = await renderAdd()
		expect(tree.root.findByType('QPButton').props.disabled).toBe(true)
		await pickCoinAndAmount(tree)
		expect(tree.root.findByType('QPButton').props.disabled).toBe(false)
	})
})

describe('deposit creation', () => {
	test('posts the topup payload and opens the invoice modal', async () => {
		const invoice = { transaction_uuid: 'tx-1', wallet: 'TAddr', coin: 'USDT', network: 'TRC20', value: '50' }
		apiClient.post.mockResolvedValue({ status: 200, data: { data: invoice } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'USDT', amount: 50 })
		const modal = tree.root.findByType('DepositDetailsModal')
		expect(modal.props.visible).toBe(true)
		expect(modal.props.topupData).toBe(invoice)
		expect(modal.props.countdown).toBe(1800)
	})

	test('fiat gateways with a redirect_url open externally', async () => {
		apiClient.post.mockResolvedValue({
			status: 200,
			data: { data: { transaction_uuid: 'tx-2', redirect_url: 'https://paypal.com/pay/x' } },
		})
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(Linking.openURL).toHaveBeenCalledWith('https://paypal.com/pay/x')
	})

	test('an API failure surfaces the retry message on screen', async () => {
		apiClient.post.mockRejectedValue(new Error('500'))
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(JSON.stringify(tree.toJSON())).toContain('Error al crear la solicitud de depósito, intente nuevamente en unos minutos')
	})

	test('crypto invoices trigger installed-wallet detection with the coin and network', async () => {
		apiClient.post.mockResolvedValue({
			status: 200,
			data: { data: { transaction_uuid: 'tx-3', wallet: 'TAddr', coin: 'USDT', network: 'TRC20' } },
		})
		detectInstalledWallets.mockResolvedValue([{ id: 'trust' }])
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(detectInstalledWallets).toHaveBeenCalledWith('USDT', 'TRC20')
		expect(tree.root.findByType('DepositDetailsModal').props.installedWallets).toEqual([{ id: 'trust' }])
	})
})

describe('depósito con tarjeta (CARD)', () => {
	const CARD = { tick: 'CARD', name: 'Tarjeta', min_in: '10', fee_in: '6' }
	const eligibleUser = {
		balance: '100.00',
		kyc: true,
		telegram_id: '1',
		phone_verified: true,
		created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
		vip: false,
		trustscore: 95,
	}
	const cardInvoice = {
		transaction_uuid: 'tx-card',
		wallet: 'pi_123',
		coin: 'CARD',
		value: '53',
		client_secret: 'pi_123_secret_abc',
		publishable_key: 'pk_test_x',
	}

	beforeEach(() => {
		mockCoinCatalog = [CARD, USDT]
		mockGets()
		useAuth.mockReturnValue({ user: eligibleUser, updateUser })
		apiClient.post.mockResolvedValue({ status: 200, data: { data: cardInvoice } })
		presentCardDeposit.mockResolvedValue({ status: 'paid' })
	})

	test('si el servidor no acepta tarjeta, CARD no sale ni en el catálogo ni en las pills', async () => {
		mockGets({ eligibility: { ...ELIGIBILITY, card: RAIL_OFF } })
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.coins).toEqual([USDT])
		expect(picker.props.defaultCoins.some(c => c.tick === 'CARD')).toBe(false)
	})

	test('con tarjeta aceptada ve CARD (misma referencia del catálogo) y la pill Tarjeta primero', async () => {
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.coins).toBe(mockCoinCatalog)
		expect(picker.props.defaultCoins[0]).toEqual({ tick: 'CARD', label: 'Tarjeta' })
	})

	test('sin respuesta de elegibilidad no se ofrecen los rieles gateados y se avisa con reintento', async () => {
		mockGets({ eligibility: new Error('network') })
		const tree = await renderAdd()
		expect(tree.root.findByType('QPCoinPicker').props.coins).toEqual([USDT])
		const notice = tree.root.findByProps({ testID: 'eligibility-error' })
		expect(JSON.stringify(tree.toJSON())).toContain('No pudimos comprobar qué métodos de depósito tienes disponibles')
		mockGets()
		await act(async () => { notice.findByType('QPPressable').props.onPress() })
		await settle()
		expect(tree.root.findByType('QPCoinPicker').props.coins).toBe(mockCoinCatalog)
		expect(tree.root.findAllByProps({ testID: 'eligibility-error' })).toHaveLength(0)
	})

	test('un tick gateado que el servidor niega después de elegirlo se suelta', async () => {
		let resolveEligibility
		apiClient.get.mockImplementation(url => (url === '/user/deposit-eligibility'
			? new Promise(resolve => { resolveEligibility = resolve })
			: Promise.resolve({ data: [] })))
		const tree = await renderAdd()
		// Sin respuesta aún, CARD ya no está en el catálogo; se fuerza la selección como
		// haría una pill o un param con la caché anterior
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(CARD) })
		expect(tree.root.findByType('QPCoinPicker').props.selectedCoin).toEqual(CARD)
		await act(async () => { resolveEligibility({ data: { result: 'OK', data: { ...ELIGIBILITY, card: RAIL_OFF } } }) })
		await settle()
		expect(tree.root.findByType('QPCoinPicker').props.selectedCoin).toBeNull()
	})

	test('generar el depósito abre el modal y presenta el PaymentSheet nativo', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'CARD', amount: 50, fee_mode: 'on_top' })
		expect(presentCardDeposit).toHaveBeenCalledWith(expect.objectContaining({ topupData: cardInvoice, user: eligibleUser }))
		const modal = tree.root.findByType('DepositDetailsModal')
		expect(modal.props.visible).toBe(true)
		// La hoja confirmó: queda en processing hasta que el webhook acredite (SSE 'paid')
		expect(modal.props.depositStatus).toBe('processing')
		// El id del PaymentIntent no es una dirección: nada de detección de wallets
		expect(detectInstalledWallets).not.toHaveBeenCalled()
	})

	test('el selector de fee aparece solo con CARD elegida (y su fee > 0)', async () => {
		const tree = await renderAdd()
		expect(tree.root.findAllByType('CardFeeModeSelector')).toHaveLength(0)
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(CARD) })
		const selector = tree.root.findByType('CardFeeModeSelector')
		expect(selector.props.value).toBe('on_top')
		expect(selector.props.feeRate).toBe(6)
		// Cambiar a otra moneda lo quita
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(USDT) })
		expect(tree.root.findAllByType('CardFeeModeSelector')).toHaveLength(0)
	})

	test('con CARD sin fee no hay selector y no cambia el flujo', async () => {
		const tree = await renderAdd()
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect({ ...CARD, fee_in: '0' }) })
		expect(tree.root.findAllByType('CardFeeModeSelector')).toHaveLength(0)
	})

	test('elegir "fee incluido" viaja en el POST; re-elegir moneda vuelve al default', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await act(async () => { tree.root.findByType('CardFeeModeSelector').props.onChange('included') })
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'CARD', amount: 50, fee_mode: 'included' })
		// Volver a seleccionar una moneda resetea el modo a on_top
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(CARD) })
		expect(tree.root.findByType('CardFeeModeSelector').props.value).toBe('on_top')
	})

	test('el POST de monedas no-CARD no lleva fee_mode', async () => {
		apiClient.post.mockResolvedValue({ status: 200, data: { data: { transaction_uuid: 'tx-1', wallet: 'TAddr', coin: 'USDT' } } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT)
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'USDT', amount: 50 })
	})

	test('cancelar la hoja deja la orden pendiente y permite reintentar desde el modal', async () => {
		presentCardDeposit.mockResolvedValue({ status: 'canceled' })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		const modal = tree.root.findByType('DepositDetailsModal')
		expect(modal.props.depositStatus).toBe('pending')
		presentCardDeposit.mockClear()
		await act(async () => { modal.props.onPayWithCard() })
		expect(presentCardDeposit).toHaveBeenCalledWith(expect.objectContaining({ topupData: cardInvoice }))
	})

	test('un fallo del PaymentSheet muestra el error en un toast', async () => {
		presentCardDeposit.mockResolvedValue({ status: 'failed', message: 'Tarjeta rechazada' })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		expect(toast.error).toHaveBeenCalledWith('Pago con tarjeta', { description: 'Tarjeta rechazada' })
		expect(tree.root.findByType('DepositDetailsModal').props.depositStatus).toBe('pending')
	})

	test('el rechazo del gate del servidor pinta su mensaje literal', async () => {
		apiClient.post.mockRejectedValue({ response: { data: { error: 'Método de pago no soportado para este usuario' } } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD)
		await pressGenerate(tree)
		expect(JSON.stringify(tree.toJSON())).toContain('Método de pago no soportado para este usuario')
	})
})

describe('nivel ssn: tarjeta y PayPal con cupo de $500 por 30 días', () => {
	const CARD = { tick: 'CARD', name: 'Tarjeta', min_in: '10', fee_in: '6' }
	const ssnEligibility = (over = {}) => ({
		...ELIGIBILITY,
		card: { eligible: true, tier: 'ssn', reason: null },
		paypal: { eligible: true, tier: 'ssn', reason: null },
		ssn_tier: { ...SSN_TIER, verified: true, remaining: 320.5, resets_at: '2026-12-01T12:00:00Z', ...over },
	})
	const rendered = (tree) => JSON.stringify(tree.toJSON())

	beforeEach(() => {
		mockCoinCatalog = [CARD, USDT]
		mockGets({ eligibility: ssnEligibility() })
	})

	test('bajo la moneda se ve lo que queda del cupo', async () => {
		const tree = await renderAdd()
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(CARD) })
		expect(rendered(tree)).toContain('Te quedan $320.5 de $500 en 30 días')
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(USDT) })
		expect(rendered(tree)).not.toContain('Te quedan $320.5')
	})

	test('un cobro bruto por encima del cupo se avisa inline y no se pide', async () => {
		const tree = await renderAdd()
		// 310 + 6 % = 328.6 > 320.5: el servidor cuenta el fee aparte contra el cupo
		await pickCoinAndAmount(tree, CARD, '310')
		await pressGenerate(tree)
		expect(apiClient.post).not.toHaveBeenCalled()
		expect(rendered(tree)).toContain('te quedan $320.5 de cupo en 30 días')
		expect(rendered(tree)).toContain('Vuelve a tener cupo el 1 dic')
	})

	test('con el fee incluido cuenta el importe tecleado', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD, '310')
		await act(async () => { tree.root.findByType('CardFeeModeSelector').props.onChange('included') })
		await pressGenerate(tree)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'CARD', amount: 310, fee_mode: 'included' })
	})

	test('cupo agotado: la fila sale apagada con la fecha y el botón no se activa', async () => {
		mockGets({ eligibility: ssnEligibility({ remaining: 0 }) })
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.disabledReasonFor(CARD)).toBe('Vuelve a tener cupo el 1 dic')
		expect(picker.props.disabledReasonFor(USDT)).toBeNull()
		await pickCoinAndAmount(tree, CARD, '20')
		expect(tree.root.findByType('QPButton').props.disabled).toBe(true)
		expect(rendered(tree)).toContain('Vuelve a tener cupo el 1 dic')
	})

	test('el 400 DEPOSIT_MONTHLY_LIMIT del servidor se redacta con su remaining y refresca el cupo', async () => {
		apiClient.post.mockRejectedValue({ response: { status: 400, data: { error: 'prosa del servidor', code: 'DEPOSIT_MONTHLY_LIMIT', cap: 500, used: 380, remaining: 120, resets_at: '2026-12-01T12:00:00Z' } } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD, '50')
		apiClient.get.mockClear()
		await pressGenerate(tree)
		expect(rendered(tree)).toContain('te quedan $120 de cupo en 30 días')
		expect(rendered(tree)).not.toContain('prosa del servidor')
		expect(apiClient.get).toHaveBeenCalledWith('/user/deposit-eligibility', { silent: true })
	})

	describe('el cupo cambia en el servidor', () => {
		const flush = () => act(async () => { await jest.advanceTimersByTimeAsync(50) })
		const CAP_DATE = '2026-12-01T12:00:00Z'
		const rejected = (remaining) => ({ response: { status: 400, data: { error: 'prosa', code: 'DEPOSIT_MONTHLY_LIMIT', cap: 500, used: 500 - remaining, remaining, resets_at: CAP_DATE } } })
		let remaining

		beforeEach(() => {
			remaining = 500
			apiClient.get.mockImplementation(url => {
				if (url === '/user/deposit-eligibility') { return Promise.resolve({ data: { result: 'OK', data: ssnEligibility({ remaining }) } }) }
				if (url === '/user/cip') { return Promise.resolve({ data: { us_person: false } }) }
				return Promise.resolve({ data: [] })
			})
			presentCardDeposit.mockResolvedValue({ status: 'canceled' })
			apiClient.post.mockResolvedValue({ status: 200, data: { data: { transaction_uuid: 'tx-1', wallet: 'pi_1', client_secret: 'cs_1' } } })
		})

		test('una orden abandonada baja el cupo que se enseña: lo pendiente de la última hora cuenta', async () => {
			const tree = await renderAdd()
			await flush()
			await pickCoinAndAmount(tree, CARD, '300')
			expect(rendered(tree)).toContain('Te quedan $500 de $500')
			remaining = 182 // el servidor ya cuenta los $318 de la orden
			await pressGenerate(tree)
			await flush()
			expect(rendered(tree)).toContain('Te quedan $182 de $500')
		})

		test('con el cupo fresco, el segundo intento se avisa sin pedir', async () => {
			const tree = await renderAdd()
			await flush()
			await pickCoinAndAmount(tree, CARD, '300')
			remaining = 182
			await pressGenerate(tree)
			await flush()
			await act(async () => { tree.root.findByType('DepositDetailsModal').props.onClose() })
			apiClient.post.mockClear()
			await act(async () => { tree.root.findAllByType('QPAmountCard')[0].props.onChangeAmount('200') })
			await pressGenerate(tree)
			await flush()
			expect(apiClient.post).not.toHaveBeenCalled()
			expect(rendered(tree)).toContain('te quedan $182 de cupo')
		})

		test('el aviso del 400 sigue en pantalla cuando llega el cupo nuevo', async () => {
			const tree = await renderAdd()
			await flush()
			await pickCoinAndAmount(tree, CARD, '50')
			remaining = 20 // gastado desde otro dispositivo: la pantalla aún no lo sabe
			apiClient.post.mockRejectedValue(rejected(20))
			await pressGenerate(tree)
			await flush()
			expect(rendered(tree)).toContain('Te quedan $20 de $500')
			expect(rendered(tree)).toContain('te quedan $20 de cupo')
		})

		test('otro error del intento tampoco se borra al refrescar el cupo', async () => {
			const tree = await renderAdd()
			await flush()
			await pickCoinAndAmount(tree, CARD, '50')
			apiClient.post.mockRejectedValue({ response: { status: 400, data: { error: 'Rechazado por el banco' } } })
			await pressGenerate(tree)
			remaining = 400
			await act(async () => { clients.at(-1).invalidateQueries({ queryKey: ['user', 'deposit-eligibility'] }) })
			await flush()
			expect(rendered(tree)).toContain('Te quedan $400 de $500')
			expect(rendered(tree)).toContain('Rechazado por el banco')
		})

		test('elegir otra moneda retira el aviso del cupo', async () => {
			const tree = await renderAdd()
			await flush()
			await pickCoinAndAmount(tree, CARD, '50')
			apiClient.post.mockRejectedValue(rejected(20))
			await pressGenerate(tree)
			await flush()
			expect(rendered(tree)).toContain('te quedan $20 de cupo')
			await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(USDT) })
			expect(rendered(tree)).not.toContain('te quedan $20 de cupo')
		})
	})

	test('el 429 RATE_LIMITED del nivel ssn tiene su propio aviso', async () => {
		apiClient.post.mockRejectedValue({ response: { status: 429, data: { error: 'Espera', code: 'RATE_LIMITED' } } })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, CARD, '50')
		await pressGenerate(tree)
		expect(rendered(tree)).toContain('Espera unos segundos antes de crear otro depósito')
	})
})

describe('acceso a la verificación del SSN desde Depositar', () => {
	const noRails = { ...ELIGIBILITY, card: RAIL_OFF, paypal: RAIL_OFF }
	const ssn = (over = {}) => ({ status: 'none', verified_at: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null, ...over })

	beforeEach(() => { mockCoinCatalog = [USDT] })

	test('persona de EE. UU. sin tarjeta ni PayPal y con la verificación a su alcance', async () => {
		mockGets({ eligibility: noRails, cip: { us_person: true, ssn_verification: ssn() } })
		const tree = await renderAdd()
		const cta = tree.root.findByType('SsnTierCta')
		await act(async () => { cta.props.onPress() })
		expect(navigate).toHaveBeenCalledWith('SettingsStack', { screen: 'Userdata', initial: false })
	})

	test('con el nivel apagado no sale, aunque pudiera verificar', async () => {
		const off = { ...noRails, card: { ...RAIL_OFF, reason: 'SSN_TIER_OFF' }, paypal: { ...RAIL_OFF, reason: 'SSN_TIER_OFF' }, ssn_tier: { ...SSN_TIER, enabled: false } }
		mockGets({ eligibility: off, cip: { us_person: true, ssn_verification: ssn() } })
		expect((await renderAdd()).root.findAllByType('SsnTierCta')).toHaveLength(0)
	})

	test('no sale para quien no es US person, ya tiene tarjeta o el nivel está apagado', async () => {
		mockGets({ eligibility: noRails, cip: { us_person: false } })
		expect((await renderAdd()).root.findAllByType('SsnTierCta')).toHaveLength(0)
		mockGets({ eligibility: ELIGIBILITY, cip: { us_person: true, ssn_verification: ssn() } })
		expect((await renderAdd()).root.findAllByType('SsnTierCta')).toHaveLength(0)
		mockGets({ eligibility: { ...noRails, card: { ...RAIL_OFF, reason: 'SSN_TIER_OFF' } }, cip: { us_person: true, ssn_verification: ssn({ status: 'verified', can_start: false }) } })
		expect((await renderAdd()).root.findAllByType('SsnTierCta')).toHaveLength(0)
	})
})

describe('real-time deposit status over SSE', () => {
	const openInvoice = async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		return tree
	}

	test('subscribes to the created transaction uuid', async () => {
		await openInvoice()
		expect(useTransactionSSE).toHaveBeenLastCalledWith('tx-1', expect.any(Function))
	})

	test('a paid status toasts, closes the modal, refreshes the balance and asks for review', async () => {
		const tree = await openInvoice()
		const client = clients[clients.length - 1]
		const invalidate = jest.spyOn(client, 'invalidateQueries')
		// Histórico infinito cacheado con dos páginas: el pago debe recortarlo a
		// la primera para que el refetch posterior sea UNA petición
		client.setQueryData(['transactions', 'list', {}], {
			pages: [[{ uuid: 't-old' }], [{ uuid: 't-older' }]],
			pageParams: [null, 2],
		})
		await act(async () => { sseCallback('paid') })
		expect(toast.success).toHaveBeenCalledWith('Pago confirmado', expect.anything())
		expect(tree.root.findByType('DepositDetailsModal').props.depositStatus).toBe('paid')
		// El historial también se refresca al momento (feed del Home + histórico)
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['home'] })
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['transactions'] })
		expect(client.getQueryData(['transactions', 'list', {}]).pages).toHaveLength(1)
		await act(async () => { jest.advanceTimersByTime(2000) })
		expect(tree.root.findByType('DepositDetailsModal').props.visible).toBe(false)
		await act(async () => { jest.advanceTimersByTime(1500) })
		expect(maybeRequestReview).toHaveBeenCalled()
	})

	test('a paid status plays the coin sound right away', async () => {
		await openInvoice()
		await act(async () => { sseCallback('paid') })
		expect(playSound).toHaveBeenCalledWith('money_in')
	})

	test('an expired status zeroes the 30-minute countdown', async () => {
		const tree = await openInvoice()
		await act(async () => { jest.advanceTimersByTime(5000) }) // countdown running
		expect(tree.root.findByType('DepositDetailsModal').props.countdown).toBe(1795)
		await act(async () => { sseCallback('expired') })
		expect(tree.root.findByType('DepositDetailsModal').props.countdown).toBe(0)
	})
})

describe('OFAC funding attestation', () => {
	const ATTESTATION = {
		purposeCode: 'P-1',
		attestations: { notProhibitedOfficial: true, notProhibitedPartyMember: true, notRestrictedList: true, lawfulPurpose: true },
		language: 'es',
	}
	const ofacModal = (tree) => tree.root.findByType('OfacAttestationModal')
	const mockCip = (cip) => apiClient.get.mockImplementation(url => (
		url === '/user/cip' ? (cip instanceof Error ? Promise.reject(cip) : Promise.resolve({ data: cip })) : Promise.resolve({ data: [] })
	))

	test('a non-US person deposits without any attestation', async () => {
		mockCip({ us_person: false })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(apiClient.get).toHaveBeenCalledWith('/user/cip', { silent: true })
		expect(ofacModal(tree).props.visible).toBe(false)
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'USDT', amount: 50 })
	})

	test('a US person must attest before the order exists, and the payload travels', async () => {
		mockCip({ us_person: true })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(ofacModal(tree).props).toMatchObject({ visible: true, scope: 'funding', context: 'topup', tick: 'USDT' })
		expect(apiClient.post).not.toHaveBeenCalled()
		await act(async () => { ofacModal(tree).props.onConfirm(ATTESTATION) })
		expect(apiClient.post).toHaveBeenCalledWith('/topup', { pay_method: 'USDT', amount: 50, compliance: ATTESTATION })
	})

	test('closing the attestation creates no order', async () => {
		mockCip({ us_person: true })
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		await act(async () => { ofacModal(tree).props.onClose() })
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('BANK deposits always attest, with the bank copy', async () => {
		mockCip({ us_person: false })
		const BANK = { tick: 'BANK', name: 'Transferencia bancaria', min_in: '10' }
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, BANK)
		await pressGenerate(tree)
		expect(ofacModal(tree).props).toMatchObject({ visible: true, scope: 'funding', context: 'deposit_bank' })
	})

	test('fail-closed: if the CIP profile cannot be read, the attestation is required', async () => {
		mockCip(new Error('network'))
		const tree = await renderAdd()
		await pickCoinAndAmount(tree)
		await pressGenerate(tree)
		expect(ofacModal(tree).props.visible).toBe(true)
		expect(apiClient.post).not.toHaveBeenCalled()
	})
})

describe('monedas «Vía P2P» (ETECSA y tarjetas cubanas)', () => {
	beforeEach(() => {
		mockCoinCatalog = [USDT]
		mockAllCoins = [{ ...USDT, enabled_in: 1 }, ETECSA, { tick: 'BANK_CUP', name: 'CUP', enabled_in: 1 }]
	})

	test('salen al final del selector con su etiqueta; una habilitada para depósito no cuenta', async () => {
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.coins.map(c => c.tick)).toEqual(['USDT', 'ETECSA'])
		expect(picker.props.badges).toEqual({ ETECSA: 'Vía P2P' })
	})

	test('sin ninguna, el catálogo conserva su identidad y no hay etiquetas', async () => {
		mockAllCoins = []
		const tree = await renderAdd()
		const picker = tree.root.findByType('QPCoinPicker')
		expect(picker.props.coins).toBe(mockCoinCatalog)
		expect(picker.props.badges).toBeUndefined()
	})

	test('elegirla apaga el importe (y lo vacía), apaga el botón y enseña el bloque de ofertas; nunca POST /topup', async () => {
		const tree = await renderAdd()
		await pickCoinAndAmount(tree, USDT, '50')
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(ETECSA) })
		const amountCard = tree.root.findAllByType('QPAmountCard')[0]
		expect(amountCard.props.amount).toBe('')
		expect(amountCard.props.disabled).toBe(true)
		expect(tree.root.findByType('QPButton').props.disabled).toBe(true)
		expect(tree.root.findByType('DepositViaP2PBlock').props.coin).toBe(ETECSA)
		await pressGenerate(tree)
		expect(apiClient.post).not.toHaveBeenCalled()
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('volver a una moneda normal retira el bloque y reactiva el formulario', async () => {
		const tree = await renderAdd()
		await act(async () => { tree.root.findByType('QPCoinPicker').props.onSelect(ETECSA) })
		await pickCoinAndAmount(tree, USDT, '50')
		expect(tree.root.findAllByType('DepositViaP2PBlock')).toHaveLength(0)
		expect(tree.root.findByType('QPButton').props.disabled).toBe(false)
	})

	test('el deep link qvapay://add?coin=ETECSA la preselecciona (param `coin`)', async () => {
		const tree = await renderAdd({ coin: 'ETECSA' })
		expect(tree.root.findByType('DepositViaP2PBlock').props.coin).toBe(ETECSA)
	})
})
