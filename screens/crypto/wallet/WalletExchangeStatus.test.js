/**
 * Seguimiento de un intercambio: mientras la orden espera el depósito ofrece «Enviar ahora»,
 * y deja de ofrecerlo en cuanto consta que ya salió uno. Esa constancia es una nota en disco
 * que escribe OTRA pantalla (la del envío): antes solo se leía al montar, así que una copia
 * de esta pantalla que se quedaba debajo seguía ofreciendo enviar justo después de enviar.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
const mockFocus = { callbacks: [] }
jest.mock('@react-navigation/native', () => {
	const React = jest.requireActual('react')
	return {
		// La pantalla gana el foco al montarse; `focusAgain()` simula volver a ella
		useFocusEffect: (callback) => {
			mockFocus.callbacks.push(callback)
			React.useEffect(() => callback(), [callback])
		},
	}
})
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }))
jest.mock('@react-native-clipboard/clipboard', () => ({ __esModule: true, default: { setString: jest.fn() } }))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ useEffectiveRegistry: () => ({ chains: {} }) }))
jest.mock('./walletQueries', () => ({ useWalletAssets: jest.fn(), refreshHistoryAfterSend: jest.fn(), WALLET_BALANCES_KEY: ['wallet', 'balances'] }))
jest.mock('./exchangeQueries', () => ({ useExchangeOrderQuery: jest.fn() }))
jest.mock('./exchangeDeposit', () => ({ readDepositSent: jest.fn(), clearDepositSent: jest.fn(async () => {}) }))
jest.mock('./depositGuard', () => ({ settleDepositNote: jest.fn() }))
jest.mock('../../../helpers', () => ({ timeAgo: () => 'hace un momento' }))
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/particles/QPAssetIcon', () => 'QPAssetIcon')
jest.mock('../../../ui/particles/QPAddress', () => 'QPAddress')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { useWalletAssets } from './walletQueries'
import { useExchangeOrderQuery } from './exchangeQueries'
import { clearDepositSent, readDepositSent } from './exchangeDeposit'
import { settleDepositNote } from './depositGuard'
import { ROUTES } from '../../../routes'
import WalletExchangeStatus from './WalletExchangeStatus'

const USDT = { id: 'bsc:0x55', chainKey: 'bsc', kind: 'evm', symbol: 'USDT', decimals: 18, contract: '0x55' }
const SOL = { id: 'solana:native', chainKey: 'solana', kind: 'solana', symbol: 'SOL', decimals: 9, contract: null }
const order = (over = {}) => ({
	uuid: 'ex-1', status: 'awaiting_deposit', from_asset: USDT.id, to_asset: SOL.id, amount_in: '25', amount_out_expected: '0.1',
	deposit_address: '0xDeposito000000000000000000000000000000001', provider_label: 'Proveedor', created_at: '2026-11-13T10:00:00Z', ...over,
})

let tree
let navigation
const element = (params) => <WalletExchangeStatus navigation={navigation} route={{ params }} />
const render = async (params = { uuid: 'ex-1' }) => {
	navigation = { navigate: jest.fn(), popToTop: jest.fn(), goBack: jest.fn() }
	await act(async () => { tree = create(element(params)) })
}
/** El usuario vuelve a esta pantalla (p. ej. con «atrás» desde el envío). */
const focusAgain = () => act(async () => { mockFocus.callbacks[mockFocus.callbacks.length - 1]() })
const sendButton = () => tree.root.findAll(node => node.type === 'QPButton' && node.props.title === 'Enviar ahora')

beforeEach(() => {
	jest.clearAllMocks()
	mockFocus.callbacks = []
	useWalletAssets.mockReturnValue({ all: [USDT, SOL] })
	useExchangeOrderQuery.mockReturnValue({ data: order() })
	readDepositSent.mockResolvedValue(null)
	// Por defecto la cadena aún no sabe nada: la nota se queda como está
	settleDepositNote.mockImplementation(async note => note)
})
afterEach(() => { act(() => { tree?.unmount() }) })

test('esperando el depósito y sin nota: ofrece enviar, con la dirección y el importe exacto', async () => {
	await render()
	expect(sendButton()).toHaveLength(1)
	await act(async () => { await sendButton()[0].props.onPress() })
	expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.WALLET_SEND_CONFIRM, { assetId: USDT.id, to: order().deposit_address, amount: '25', exchangeUuid: 'ex-1' })
})

test('con nota de que ya salió: ni dirección ni botón', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: '0xabc', at: 1, pending: false })
	await render()
	expect(sendButton()).toHaveLength(0)
})

// El agujero: esta pantalla se quedó debajo mientras el usuario enviaba desde otra
test('la nota se escribió mientras esta pantalla estaba debajo: al volver a ella deja de ofrecer enviar', async () => {
	await render()
	expect(sendButton()).toHaveLength(1)

	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: '0xabc', at: 1, pending: false })
	await focusAgain()
	expect(sendButton()).toHaveLength(0)
})

test('una nota pendiente y sin hash (envío patrocinado sin respuesta) también lo quita', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: null, at: 1, pending: true })
	await render()
	expect(sendButton()).toHaveLength(0)
	const texts = tree.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children)
	expect(texts).toContain('Enviado, a la espera de confirmación')
})

test('si la nota llega entre pintar el botón y tocarlo, no se abre el envío', async () => {
	await render()
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: '0xabc', at: 1, pending: true })
	await act(async () => { await sendButton()[0].props.onPress() })
	expect(navigation.navigate).not.toHaveBeenCalled()
	expect(sendButton()).toHaveLength(0)
})

// Antes un «quizá salió» se quedaba así para siempre y la orden ya no se podía fondear desde la app
describe('una nota pendiente se aclara con la cadena al volver a la pantalla', () => {
	const pending = { uuid: 'ex-1', txid: '0xabc', at: 1, pending: true, ref: { kind: 'evm' } }

	test('la cadena confirma que no entró ni entrará: vuelve «Enviar ahora»', async () => {
		readDepositSent.mockResolvedValue(pending)
		settleDepositNote.mockResolvedValue(null)
		await render()
		expect(settleDepositNote).toHaveBeenCalledWith(pending)
		expect(sendButton()).toHaveLength(1)
	})

	test('la cadena dice que entró: sigue sin ofrecer enviar', async () => {
		readDepositSent.mockResolvedValue({ ...pending, txid: null })
		settleDepositNote.mockResolvedValue({ ...pending, txid: '0xreal', pending: false, ref: null })
		await render()
		expect(sendButton()).toHaveLength(0)
	})

	test('la cadena aún no lo sabe, o la consulta falla: sigue sin ofrecer enviar', async () => {
		readDepositSent.mockResolvedValue(pending)
		await render()
		expect(sendButton()).toHaveLength(0)

		settleDepositNote.mockRejectedValue(new Error('sin nodos'))
		await focusAgain()
		expect(sendButton()).toHaveLength(0)
	})

	test('una nota que ya consta enviada no se pregunta', async () => {
		readDepositSent.mockResolvedValue({ ...pending, pending: false })
		await render()
		expect(settleDepositNote).not.toHaveBeenCalled()
	})
})

// Al volver del envío con `popTo` esta pantalla es la MISMA, con parámetros nuevos
test('el hash que llega por parámetro después de montar también cuenta', async () => {
	await render()
	expect(sendButton()).toHaveLength(1)
	await act(async () => { tree.update(element({ uuid: 'ex-1', sentTxid: '0xabc' })) })
	expect(sendButton()).toHaveLength(0)
})

test('en cuanto la orden avanza manda su estado, y la nota se retira', async () => {
	readDepositSent.mockResolvedValue({ uuid: 'ex-1', txid: '0xabc', at: 1, pending: false })
	useExchangeOrderQuery.mockReturnValue({ data: order({ status: 'confirming' }) })
	await render()
	expect(clearDepositSent).toHaveBeenCalledWith('ex-1')
	expect(sendButton()).toHaveLength(0)
})
