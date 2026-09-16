/**
 * Comportamiento de la pantalla de Swap (saldo QvaPay ↔ QUSD en Stacks) con todos los
 * colaboradores simulados: validación del importe contra saldo/límite, el paso de PIN del
 * OUT (auto-submit, payload, saldo, navegación), y el IN con tx patrocinada (prepareSend
 * con sponsored, firma UNA vez, nunca se difunde desde la app, reintento por nonce).
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ useEffectiveRegistry: () => ({ chains: { stacks: { kind: 'stacks', native: { symbol: 'STX', decimals: 6 } } } }) }))
jest.mock('./walletQueries', () => ({ useWalletAssets: jest.fn(), refreshHistoryAfterSend: jest.fn(), WALLET_BALANCES_KEY: ['wallet', 'balances'] }))
jest.mock('./walletSendActions', () => ({ prepareSend: jest.fn(), signPrepared: jest.fn(), broadcastSigned: jest.fn() }))
jest.mock('../../../api/swapApi', () => ({ swapApi: { getPairs: jest.fn(), create: jest.fn(), get: jest.fn(), cancel: jest.fn() } }))
jest.mock('../../../api/withdrawApi', () => ({ withdrawApi: { requestPin: jest.fn() } }))
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPSwitch', () => 'QPSwitch')
jest.mock('./components/AssetIcon', () => 'AssetIcon')
jest.mock('./components/WalletAuthModal', () => 'WalletAuthModal')
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
import { prepareSend, signPrepared, broadcastSigned } from './walletSendActions'
import { swapApi } from '../../../api/swapApi'
import { toast } from 'sonner-native'
import WalletSwap from './WalletSwap'

const STX = 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R'
const TREASURY = 'SP3KC0MTNW34S1ZXD36JYKFD3JJMWA01M54BYX1JY'
const ASSET = 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD'
const PAIR = { id: 'QVAPAY:QUSD_STACKS', base: 'QVAPAY', quote: 'QUSD_STACKS', rate: 1, fee_bps: 0, min: 1, max: 5000, decimals: 8, asset: ASSET, contract_id: 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD', asset_name: 'QUSD', treasury: TREASURY, network: 'stacks', enabled: true, disabled_reason: null }
const QUSD_ASSET = { id: `stacks:${ASSET}`, chainKey: 'stacks', chainName: 'Stacks', kind: 'stacks', symbol: 'QUSD', decimals: 8, contract: ASSET, logoTick: 'QUSD', networkTick: 'STX', amount: '40', amountLabel: '40', usd: 40, hasBalance: true, stable: true, priceTick: 'QUSD' }

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = () => act(async () => { await sleep(30) })

let queryClient
let navigation
const render = async (params) => {
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	let tree
	await act(async () => {
		tree = create(
			<QueryClientProvider client={queryClient}>
				<WalletSwap navigation={navigation} route={{ params }} />
			</QueryClientProvider>,
		)
	})
	await settle()
	return tree
}
const amountInput = (tree) => tree.root.findByType(TextInput)
const footer = (tree) => tree.root.findByType('QPButton')
const typeAmount = (tree, value) => act(async () => { amountInput(tree).props.onChangeText(value) })
const pressFooter = (tree) => act(async () => { footer(tree).props.onPress() })
const flipDirection = (tree, side) => act(async () => { tree.root.findByType('QPSwitch').props.onChange(side) })

let tree
beforeEach(() => {
	jest.clearAllMocks()
	navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() }
	useAuth.mockReturnValue({ user: { balance: 120.5, two_factor_secret: null }, updateUser: jest.fn() })
	useWallet.mockReturnValue({ addresses: { evm: '0x1', tron: 'T1', btc: 'bc1', stx: STX, stxPublicKey: '02aa' } })
	useWalletAssets.mockReturnValue({ all: [QUSD_ASSET] })
	swapApi.getPairs.mockResolvedValue({ success: true, data: { data: [PAIR], limits: { kyc: false, daily: 300, monthly: 1000, available: 100, requires_kyc: false }, sponsor: { daily_per_user: 10, used_today: 0, remaining_today: 10, max_fee_ustx: 20000 }, wallet: { stx: STX } }, status: 200 })
	swapApi.create.mockResolvedValue({ success: true, data: { data: { uuid: 'swap-1', status: 'pending', direction: 'out' }, balance: 115.5 }, status: 201 })
	prepareSend.mockResolvedValue({ kind: 'stacks', inner: { sponsored: true } })
	signPrepared.mockResolvedValue({ kind: 'stacks', signed: { hex: 'c0ffee', txid: 'ab'.repeat(32) } })
})
afterEach(async () => {
	if (tree) { await act(async () => { tree.unmount() }); tree = null }
	queryClient?.clear()
})

describe('importe y límites', () => {
	test('CTA deshabilitado sin importe, por saldo insuficiente, por límite y por decimales; MAX = min(saldo, límite, max del par)', async () => {
		tree = await render()
		expect(footer(tree).props.disabled).toBe(true)
		await typeAmount(tree, '5')
		expect(footer(tree).props.disabled).toBe(false)
		await typeAmount(tree, '121')     // saldo custodial 120.5
		expect(footer(tree).props.disabled).toBe(true)
		await typeAmount(tree, '100.01')  // límite disponible 100
		expect(footer(tree).props.disabled).toBe(true)
		await typeAmount(tree, '1.234')
		expect(footer(tree).props.disabled).toBe(true)
		await typeAmount(tree, '0.5')     // mínimo del par 1
		expect(footer(tree).props.disabled).toBe(true)
		// MAX en OUT: min(120.5, 100, 5000) = 100
		const max = tree.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.onPress && n.type !== 'QPButton').find(n => n.props.hitSlop === 8)
		await act(async () => { max.props.onPress() })
		expect(amountInput(tree).props.value).toBe('100.00')
		// MAX en IN: min(40 en wallet, 100, 5000) = 40
		await flipDirection(tree, 'right')
		await act(async () => { max.props.onPress() })
		expect(amountInput(tree).props.value).toBe('40.00')
	})

	test('la wallet registrada distinta de la local bloquea el CTA', async () => {
		swapApi.getPairs.mockResolvedValue({ success: true, data: { data: [PAIR], limits: { available: null }, sponsor: {}, wallet: { stx: 'SPOTHER' } }, status: 200 })
		tree = await render()
		await typeAmount(tree, '5')
		expect(footer(tree).props.disabled).toBe(true)
	})
})

describe('OUT (saldo → wallet)', () => {
	test('Continuar abre el paso de PIN; 4 dígitos auto-envían con la clave estable, actualizan saldo y navegan al estado', async () => {
		tree = await render()
		await typeAmount(tree, '5')
		expect(tree.root.findAllByType('PinConfirmStep')).toHaveLength(0)
		await pressFooter(tree)
		const pinStep = tree.root.findByType('PinConfirmStep')
		expect(pinStep.props.codeLength).toBe(4)
		await act(async () => { pinStep.props.onChangePin('1234') })
		await settle()
		expect(swapApi.create).toHaveBeenCalledTimes(1)
		const payload = swapApi.create.mock.calls[0][0]
		expect(payload).toMatchObject({ direction: 'out', pair: PAIR.id, amount: '5.00', toAddress: STX, pin: '1234' })
		expect(payload.idempotencyKey).toMatch(/^[A-Za-z0-9._-]{8,64}$/)
		expect(useAuth.mock.results[0].value.updateUser).toHaveBeenCalledWith({ balance: 115.5 })
		expect(navigation.replace).toHaveBeenCalledWith('WalletSwapStatus', { uuid: 'swap-1' })
		expect(broadcastSigned).not.toHaveBeenCalled()
	})

	test('con TOTP el paso pide 6 dígitos; un código inválido limpia el PIN y no navega', async () => {
		useAuth.mockReturnValue({ user: { balance: 120.5, two_factor_secret: 'secret' }, updateUser: jest.fn() })
		swapApi.create.mockResolvedValue({ success: false, error: 'Código inválido', status: 400, details: { code: 'CODE_INVALID' } })
		tree = await render()
		await typeAmount(tree, '5')
		await pressFooter(tree)
		const pinStep = tree.root.findByType('PinConfirmStep')
		expect(pinStep.props.hasOTP).toBe(true)
		await act(async () => { pinStep.props.onMethodToggle('right') })
		expect(tree.root.findByType('PinConfirmStep').props.codeLength).toBe(6)
		await act(async () => { tree.root.findByType('PinConfirmStep').props.onChangePin('123456') })
		await settle()
		expect(swapApi.create).toHaveBeenCalledTimes(1)
		expect(toast.error).toHaveBeenCalledWith('Código inválido')
		expect(tree.root.findByType('PinConfirmStep').props.pin).toBe('')
		expect(navigation.replace).not.toHaveBeenCalled()
	})
})

describe('IN (wallet → saldo, patrocinada)', () => {
	test('prepara con sponsored:true hacia la tesorería del par, firma UNA vez tras el gate y manda el hex; nunca difunde', async () => {
		tree = await render({ direction: 'in' })
		await typeAmount(tree, '5')
		await pressFooter(tree)
		await settle()
		expect(prepareSend).toHaveBeenCalledTimes(1)
		const [chain, intent, tier, options] = prepareSend.mock.calls[0]
		expect(chain.kind).toBe('stacks')
		expect(intent).toEqual({ chainKey: 'stacks', from: STX, fromPublicKey: '02aa', to: TREASURY, amount: 500000000n, contract: ASSET })
		expect(tier).toBe('normal')
		expect(options).toEqual({ sponsored: true })
		const modal = tree.root.findByType('WalletAuthModal')
		expect(modal.props.visible).toBe(true)
		// Doble autorización: una sola firma, una sola petición
		await act(async () => { modal.props.onAuthorized(); modal.props.onAuthorized() })
		await settle()
		expect(signPrepared).toHaveBeenCalledTimes(1)
		expect(swapApi.create).toHaveBeenCalledTimes(1)
		expect(swapApi.create.mock.calls[0][0]).toMatchObject({ direction: 'in', pair: PAIR.id, amount: '5.00', signedTx: 'c0ffee', asset: ASSET })
		expect(broadcastSigned).not.toHaveBeenCalled()
		expect(navigation.replace).toHaveBeenCalledWith('WalletSwapStatus', { uuid: 'swap-1' })
	})

	test('sin clave pública Stacks el CTA falla con un error legible y no firma', async () => {
		useWallet.mockReturnValue({ addresses: { evm: '0x1', tron: 'T1', btc: 'bc1', stx: STX } })
		tree = await render({ direction: 'in' })
		await typeAmount(tree, '5')
		await pressFooter(tree)
		await settle()
		expect(prepareSend).not.toHaveBeenCalled()
		expect(signPrepared).not.toHaveBeenCalled()
		expect(footer(tree).props.title).toBe('Reintentar')
	})

	test('un rechazo por nonce descarta la firma: el reintento reconstruye y re-firma con clave nueva', async () => {
		swapApi.create.mockResolvedValueOnce({ success: false, error: 'nonce', status: 400, details: { code: 'ORIGIN_NONCE_MISMATCH', reason: 'nonce' } })
		tree = await render({ direction: 'in' })
		await typeAmount(tree, '5')
		await pressFooter(tree)
		await settle()
		await act(async () => { tree.root.findByType('WalletAuthModal').props.onAuthorized() })
		await settle()
		expect(swapApi.create).toHaveBeenCalledTimes(1)
		expect(footer(tree).props.title).toBe('Reintentar')
		await pressFooter(tree)
		await settle()
		expect(prepareSend).toHaveBeenCalledTimes(2)
		await act(async () => { tree.root.findByType('WalletAuthModal').props.onAuthorized() })
		await settle()
		expect(signPrepared).toHaveBeenCalledTimes(2)
		expect(swapApi.create).toHaveBeenCalledTimes(2)
		expect(swapApi.create.mock.calls[1][0].idempotencyKey).not.toBe(swapApi.create.mock.calls[0][0].idempotencyKey)
	})

	test('un fallo de red conserva la firma: el reintento reenvía el MISMO hex con la MISMA clave', async () => {
		swapApi.create.mockResolvedValueOnce({ success: false, error: 'Network Error' })
		tree = await render({ direction: 'in' })
		await typeAmount(tree, '5')
		await pressFooter(tree)
		await settle()
		await act(async () => { tree.root.findByType('WalletAuthModal').props.onAuthorized() })
		await settle()
		await pressFooter(tree)
		await settle()
		expect(signPrepared).toHaveBeenCalledTimes(1)
		expect(prepareSend).toHaveBeenCalledTimes(1)
		expect(swapApi.create).toHaveBeenCalledTimes(2)
		expect(swapApi.create.mock.calls[1][0].idempotencyKey).toBe(swapApi.create.mock.calls[0][0].idempotencyKey)
		expect(navigation.replace).toHaveBeenCalledWith('WalletSwapStatus', { uuid: 'swap-1' })
	})
})
