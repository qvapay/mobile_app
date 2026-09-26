/**
 * Comportamiento de la pantalla de Swap (saldo QvaPay ↔ QUSD en Stacks) con los colaboradores
 * simulados: texto y estado del botón según el importe, saneado del input, chips de
 * porcentaje, invertir sentido, hoja de revisión con PIN (saldo → wallet) y firma
 * patrocinada tras el gate de la wallet (wallet → saldo): una sola firma, nunca se difunde
 * desde la app, reintento por red con el mismo hex y por nonce re-firmando.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../../settings/SettingsContext', () => ({ useSettings: () => ({ getSetting: (_s, _k, fallback) => fallback }) }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ useEffectiveRegistry: () => ({ chains: { stacks: { kind: 'stacks', native: { symbol: 'STX', decimals: 6 } } } }) }))
jest.mock('./walletQueries', () => ({ useWalletAssets: jest.fn(), usePriceMap: () => ({ QUSD: 1 }), refreshHistoryAfterSend: jest.fn(), WALLET_BALANCES_KEY: ['wallet', 'balances'] }))
jest.mock('./walletSendActions', () => ({ prepareSend: jest.fn(), signPrepared: jest.fn(), broadcastSigned: jest.fn() }))
jest.mock('../../../api/swapApi', () => ({ swapApi: { getPairs: jest.fn(), create: jest.fn(), get: jest.fn(), cancel: jest.fn() } }))
jest.mock('../../../api/withdrawApi', () => ({ withdrawApi: { requestPin: jest.fn() } }))
// El agregador cripto↔cripto convive en esta pantalla; se simula en su frontera para que
// estos tests sigan siendo del motor custodial (y para no arrastrar api/client → device-info)
// Catálogo de monedas vacío: estos tests son del motor custodial, así que los rieles de
// depósito/retiro quedan cerrados y no cambian ninguna aserción (y no se arrastra api/client)
jest.mock('../../../hooks/useCoins', () => ({ __esModule: true, default: jest.fn(() => ({ coins: [], isLoading: false })) }))
jest.mock('../../../api/exchangeApi', () => ({
	exchangeApi: {
		catalog: jest.fn(async () => ({ success: true, data: { supported: [], unsupported: {} }, status: 200 })),
		quote: jest.fn(), create: jest.fn(), get: jest.fn(), list: jest.fn(),
	},
}))
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPAssetIcon', () => 'QPAssetIcon')
jest.mock('./components/WalletAuthModal', () => 'WalletAuthModal')
jest.mock('../../../ui/particles/QPFlipButton', () => { const C = 'QPFlipButton'; return { __esModule: true, default: C, FLIP_BUTTON_SIZE: 44 } })
jest.mock('./components/swap/SwapDetails', () => 'SwapDetails')
jest.mock('../../../ui/QPAssetSheet', () => 'QPAssetSheet')
jest.mock('./components/swap/SwapReviewSheet', () => 'SwapReviewSheet')
jest.mock('../../transaction/PinConfirmStep', () => 'PinConfirmStep')
jest.mock('sonner-native', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { TextInput } from 'react-native'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthContext'
import { useWallet } from '../../../wallet/WalletContext'
import { useWalletAssets } from './walletQueries'
import useCoins from '../../../hooks/useCoins'
import { prepareSend, signPrepared, broadcastSigned } from './walletSendActions'
import { swapApi } from '../../../api/swapApi'
import { toast } from 'sonner-native'
import QPAmountCard from '../../../ui/QPAmountCard'
import WalletSwap from './WalletSwap'

const STX = 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R'
const TREASURY = 'SP3KC0MTNW34S1ZXD36JYKFD3JJMWA01M54BYX1JY'
const ASSET = 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD'
const PAIR = { id: 'QVAPAY:QUSD_STACKS', base: 'QVAPAY', quote: 'QUSD_STACKS', rate: 1, fee_bps: 0, min: 1, max: 5000, decimals: 8, asset: ASSET, contract_id: 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD', asset_name: 'QUSD', treasury: TREASURY, network: 'stacks', enabled: true, disabled_reason: null }
const QUSD_ASSET = { id: `stacks:${ASSET}`, chainKey: 'stacks', chainName: 'Stacks', kind: 'stacks', symbol: 'QUSD', decimals: 8, contract: ASSET, logoTick: 'QUSD', networkTick: 'STX', amount: '40', amountLabel: '40', usd: 40, hasBalance: true, stable: true, priceTick: 'QUSD' }
const pairsPayload = (over = {}) => ({ success: true, data: { data: [PAIR], limits: { kyc: false, daily: 300, monthly: 1000, available: 100, requires_kyc: false }, sponsor: { daily_per_user: 10, used_today: 0, remaining_today: 10, max_fee_ustx: 20000 }, wallet: { stx: STX }, ...over }, status: 200 })

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = (ms = 30) => act(async () => { await sleep(ms) })

let queryClient
let navigation
let tree
const render = async (params) => {
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	await act(async () => {
		tree = create(<QueryClientProvider client={queryClient}><WalletSwap navigation={navigation} route={{ params }} /></QueryClientProvider>)
	})
	await settle()
	return tree
}
const input = () => tree.root.findByType(TextInput)
// La hoja de revisión está simulada: el único QPButton renderizado es el del pie
const footer = () => tree.root.findByType('QPButton')
const cards = () => tree.root.findAllByType(QPAmountCard)
const reviewSheet = () => tree.root.findByType('SwapReviewSheet')
const assetSheet = () => tree.root.findByType('QPAssetSheet')
const type = (text) => act(async () => { input().props.onChangeText(text) })
const press = (node) => act(async () => { node.props.onPress() })

beforeEach(() => {
	jest.clearAllMocks()
	navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() }
	useAuth.mockReturnValue({ user: { balance: 120.5, two_factor_secret: null }, updateUser: jest.fn() })
	useWallet.mockReturnValue({ addresses: { evm: '0x1', tron: 'T1', btc: 'bc1', stx: STX, stxPublicKey: '02aa' } })
	useWalletAssets.mockReturnValue({ all: [QUSD_ASSET] })
	swapApi.getPairs.mockResolvedValue(pairsPayload())
	swapApi.create.mockResolvedValue({ success: true, data: { data: { uuid: 'swap-1', status: 'pending', direction: 'out' }, balance: 115.5 }, status: 201 })
	prepareSend.mockResolvedValue({ kind: 'stacks', inner: { sponsored: true } })
	signPrepared.mockResolvedValue({ kind: 'stacks', signed: { hex: 'c0ffee', txid: 'ab'.repeat(32) } })
})
afterEach(async () => {
	if (tree) { await act(async () => { tree.unmount() }); tree = null }
	queryClient?.clear()
})

describe('el riel llega con moneda E importe', () => {
	const BTC_COIN = { tick: 'BTC', name: 'Bitcoin', logo: 'btc', network: 'BTC', price: '85000', enabled_out: true, enabled_in: true }
	const BTC_ASSET = { id: 'bitcoin:native', chainKey: 'bitcoin', chainName: 'Bitcoin', kind: 'btc', symbol: 'BTC', decimals: 8, contract: null, logoTick: 'BTC', networkTick: 'BTC', amount: '0', amountLabel: '0', usd: 0, hasBalance: false, stable: false, priceTick: 'BTC' }

	beforeEach(() => {
		useCoins.mockReturnValue({ coins: [BTC_COIN], isLoading: false })
		useWalletAssets.mockReturnValue({ all: [QUSD_ASSET, BTC_ASSET] })
	})

	test('saldo → BTC navega a Retirar con la moneda, la dirección Y el importe', async () => {
		await render()
		// El lado que recibe pasa a BTC: saldo → BTC es el riel de retiro
		await press({ props: cards()[1].props.token })
		await act(async () => { assetSheet().props.onSelect(BTC_ASSET.id) })
		await settle()

		await type('25')
		await settle()

		await press(footer())
		expect(navigation.navigate).toHaveBeenCalledWith('Withdraw', expect.objectContaining({
			preselectedCoin: 'BTC',
			amount: '25',
		}))
	})
})

describe('selección de los dos lados', () => {

	test('cada tarjeta abre SU propio selector', async () => {
		await render()
		const [payCard, receiveCard] = cards()
		await press({ props: payCard.props.token })
		expect(assetSheet().props.title).toBe('¿Qué entregas?')
		await act(async () => { assetSheet().props.onClose() })
		await press({ props: receiveCard.props.token })
		expect(assetSheet().props.title).toBe('¿Qué quieres recibir?')
	})

	test('elegir en un lado NO toca el otro', async () => {
		await render()
		// Estado inicial: saldo → QUSD. Se cambia solo el lado de abajo.
		await press({ props: cards()[1].props.token })
		await act(async () => { assetSheet().props.onSelect(QUSD_ASSET.id) })
		await settle()
		// El de arriba sigue siendo el saldo, no se ha movido
		expect(cards()[0].props.token.symbol).toBe('USD')
	})

	test('la tarjeta refleja lo que elegiste, aunque la combinación no tenga motor', async () => {
		// El bug: con una combinación que no es saldo↔QUSD, las tarjetas seguían pintando la
		// vista del motor QUSD, así que elegir otro activo devolvía el lado de arriba al saldo
		await render()
		await press({ props: cards()[0].props.token })
		await act(async () => { assetSheet().props.onSelect(QUSD_ASSET.id) })
		await settle()
		expect(cards()[0].props.token.symbol).toBe('QUSD')
	})

	test('el lado del saldo se llama USD, no "Saldo QvaPay"', async () => {
		await render()
		expect(cards()[0].props.token.symbol).toBe('USD')
		await press({ props: cards()[0].props.token })
		expect(assetSheet().props.options[0]).toMatchObject({ id: 'balance', title: 'USD' })
	})
})

describe('formulario', () => {
	test('el botón explica qué falta y solo se habilita en "Revisar swap"', async () => {
		await render()
		expect(footer().props).toMatchObject({ title: 'Introduce un importe', disabled: true })
		await type('5')
		expect(footer().props).toMatchObject({ title: 'Revisar swap', disabled: false })
		await type('121')
		expect(footer().props).toMatchObject({ title: 'Saldo USD insuficiente', disabled: true })
		await type('100.01')
		expect(footer().props).toMatchObject({ title: 'Límite de hoy: 100.00', disabled: true })
		await type('0.5')
		expect(footer().props).toMatchObject({ title: 'Mínimo 1.00', disabled: true })
	})

	test('el input se sanea (coma, decimales) y la tarjeta de recibir calcula 1:1', async () => {
		await render()
		await type('12,345')
		expect(input().props.value).toBe('12.34')
		expect(cards()[1].props.amount).toBe('12.34')
		expect(cards()[1].props.token.symbol).toBe('QUSD')
	})

	test('chips sobre el máximo movible (min de saldo, límite y tope); invertir cambia qué paga', async () => {
		await render()
		const chipsOut = cards()[0].props.chips
		expect(chipsOut.map(c => c.label)).toEqual(['25%', '50%', 'MÁX'])
		await act(async () => { chipsOut[2].onPress() })
		expect(input().props.value).toBe('100.00')
		await act(async () => { cards()[0].props.chips[1].onPress() })
		expect(input().props.value).toBe('50.00')

		await press(tree.root.findByType('QPFlipButton'))
		expect(cards()[0].props.token.symbol).toBe('QUSD')
		expect(cards()[1].props.token.symbol).toBe('USD')
		await act(async () => { cards()[0].props.chips[2].onPress() })
		expect(input().props.value).toBe('40.00')
	})

	test('wallet registrada distinta de la local → "Registra tu wallet" deshabilitado', async () => {
		swapApi.getPairs.mockResolvedValue(pairsPayload({ wallet: { stx: 'SPOTHER' } }))
		await render()
		await type('5')
		expect(footer().props).toMatchObject({ title: 'Registra tu wallet', disabled: true })
	})
})

describe('saldo → wallet (PIN de cuenta)', () => {
	test('Revisar abre la hoja; Confirmar pide el PIN; 4 dígitos envían y navegan al estado', async () => {
		await render()
		await type('5')
		await press(footer())
		expect(reviewSheet().props.visible).toBe(true)
		expect(reviewSheet().props.from).toMatchObject({ amount: '5.00', symbol: 'USD' })
		expect(reviewSheet().props.to).toMatchObject({ amount: '5.00', symbol: 'QUSD' })
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)

		await act(async () => { reviewSheet().props.onConfirm() })
		const pin = tree.root.findByType('PinConfirmStep')
		expect(pin.props.codeLength).toBe(4)
		await act(async () => { pin.props.onChangePin('1234') })
		await settle()

		expect(swapApi.create).toHaveBeenCalledTimes(1)
		expect(swapApi.create.mock.calls[0][0]).toMatchObject({ direction: 'out', pair: PAIR.id, amount: '5.00', toAddress: STX, pin: '1234' })
		expect(useAuth.mock.results[0].value.updateUser).toHaveBeenCalledWith({ balance: 115.5 })
		expect(navigation.replace).toHaveBeenCalledWith('WalletSwapStatus', { uuid: 'swap-1' })
		expect(broadcastSigned).not.toHaveBeenCalled()
	})

	test('con TOTP pide 6; un código inválido limpia el PIN y no navega', async () => {
		useAuth.mockReturnValue({ user: { balance: 120.5, two_factor_secret: 'secret' }, updateUser: jest.fn() })
		swapApi.create.mockResolvedValue({ success: false, error: 'Código inválido', status: 400, details: { code: 'CODE_INVALID' } })
		await render()
		await type('5')
		await press(footer())
		await act(async () => { reviewSheet().props.onConfirm() })
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onMethodToggle('right') })
		expect(tree.root.findByType('PinConfirmStep').props.codeLength).toBe(6)
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('123456') })
		await settle()
		expect(toast.error).toHaveBeenCalledWith('Código inválido')
		expect(tree.root.findByType('PinConfirmStep').props.pin).toBe('')
		expect(navigation.replace).not.toHaveBeenCalled()
	})
})

describe('wallet → saldo (patrocinada)', () => {
	const confirmIn = async () => {
		await type('5')
		await press(footer())
		await act(async () => { reviewSheet().props.onConfirm() })
		expect(reviewSheet().props.visible).toBe(false)
		await settle(420) // la hoja se cierra antes de abrir el gate de la wallet
	}

	test('prepara sponsored hacia la tesorería del par, firma UNA vez y manda el hex; nunca difunde', async () => {
		await render({ direction: 'in' })
		await confirmIn()
		expect(prepareSend).toHaveBeenCalledTimes(1)
		const [chain, intent, tier, options] = prepareSend.mock.calls[0]
		expect(chain.kind).toBe('stacks')
		expect(intent).toEqual({ chainKey: 'stacks', from: STX, fromPublicKey: '02aa', to: TREASURY, amount: 500000000n, contract: ASSET })
		expect(tier).toBe('normal')
		expect(options).toEqual({ sponsored: true })
		const modal = tree.root.findByType('WalletAuthModal')
		expect(modal.props.visible).toBe(true)
		await act(async () => { modal.props.onAuthorized(); modal.props.onAuthorized() })
		await settle()
		expect(signPrepared).toHaveBeenCalledTimes(1)
		expect(swapApi.create).toHaveBeenCalledTimes(1)
		expect(swapApi.create.mock.calls[0][0]).toMatchObject({ direction: 'in', pair: PAIR.id, amount: '5.00', signedTx: 'c0ffee', asset: ASSET })
		expect(broadcastSigned).not.toHaveBeenCalled()
		expect(navigation.replace).toHaveBeenCalledWith('WalletSwapStatus', { uuid: 'swap-1' })
	})

	test('sin clave pública Stacks: error legible y botón "Reintentar", sin firmar', async () => {
		useWallet.mockReturnValue({ addresses: { evm: '0x1', tron: 'T1', btc: 'bc1', stx: STX } })
		await render({ direction: 'in' })
		await confirmIn()
		expect(prepareSend).not.toHaveBeenCalled()
		expect(signPrepared).not.toHaveBeenCalled()
		expect(footer().props.title).toBe('Reintentar')
	})

	test('rechazo por nonce: "Reintentar" reconstruye y re-firma con clave nueva', async () => {
		swapApi.create.mockResolvedValueOnce({ success: false, error: 'nonce', status: 400, details: { code: 'ORIGIN_NONCE_MISMATCH', reason: 'nonce' } })
		await render({ direction: 'in' })
		await confirmIn()
		await act(async () => { tree.root.findByType('WalletAuthModal').props.onAuthorized() })
		await settle()
		expect(footer().props.title).toBe('Reintentar')
		await press(footer())
		await settle()
		expect(prepareSend).toHaveBeenCalledTimes(2)
		await act(async () => { tree.root.findByType('WalletAuthModal').props.onAuthorized() })
		await settle()
		expect(signPrepared).toHaveBeenCalledTimes(2)
		expect(swapApi.create).toHaveBeenCalledTimes(2)
		expect(swapApi.create.mock.calls[1][0].idempotencyKey).not.toBe(swapApi.create.mock.calls[0][0].idempotencyKey)
	})

	test('fallo de red: "Reintentar" reenvía el MISMO hex con la MISMA clave', async () => {
		swapApi.create.mockResolvedValueOnce({ success: false, error: 'Network Error' })
		await render({ direction: 'in' })
		await confirmIn()
		await act(async () => { tree.root.findByType('WalletAuthModal').props.onAuthorized() })
		await settle()
		await press(footer())
		await settle()
		expect(signPrepared).toHaveBeenCalledTimes(1)
		expect(prepareSend).toHaveBeenCalledTimes(1)
		expect(swapApi.create).toHaveBeenCalledTimes(2)
		expect(swapApi.create.mock.calls[1][0].idempotencyKey).toBe(swapApi.create.mock.calls[0][0].idempotencyKey)
		expect(navigation.replace).toHaveBeenCalledWith('WalletSwapStatus', { uuid: 'swap-1' })
	})
})
