/**
 * El destino en la pantalla de confirmar un envío: con el historial que la wallet guarda en
 * disco, una dirección que imita a una de confianza (address poisoning) bloquea "Confirmar y
 * firmar" hasta que el usuario marca que la revisó; una conocida no molesta, una nueva solo
 * avisa. La tx, el patrocinio y la energía se simulan en su frontera: estos tests son del
 * destino, no del motor de envío.
 * @jest-environment node
 */
jest.mock('../../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../../theme/themeTokens')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => ({ user: { balance: '0' }, isAuthenticated: false }) }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ useEffectiveRegistry: () => ({ chains: { bsc: { kind: 'evm', native: { symbol: 'BNB', decimals: 18 } } } }) }))
jest.mock('./walletQueries', () => ({ useWalletAssets: jest.fn(), usePriceMap: jest.fn() }))
jest.mock('./energyQueries', () => ({ useEnergyPricesQuery: () => ({ data: undefined }), estimatePrice: () => null }))
jest.mock('./historyCache', () => ({ loadHistoryCache: jest.fn() }))
jest.mock('./exchangeDeposit', () => ({ markDepositSent: jest.fn() }))
jest.mock('./useWalletSendTx', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('./useGaslessSend', () => ({ __esModule: true, default: () => ({ state: { phase: 'disabled', grant: null, reason: null, remainingToday: null, renewsAt: null }, bridge: null }) }))
jest.mock('../../../ui/particles/QPButton', () => 'QPButton')
jest.mock('../../../ui/particles/QPPressable', () => 'QPPressable')
jest.mock('../../../ui/particles/QPAssetIcon', () => 'QPAssetIcon')
jest.mock('./components/WalletAuthModal', () => 'WalletAuthModal')
jest.mock('./components/EnergyRentModal', () => 'EnergyRentModal')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import { useWallet } from '../../../wallet/WalletContext'
import { usePriceMap, useWalletAssets } from './walletQueries'
import { loadHistoryCache } from './historyCache'
import useWalletSendTx from './useWalletSendTx'
import WalletSendConfirm from './WalletSendConfirm'

const ME = '0x2A6f3C8bD3eE0c4F5a1b7c9D0e1F2a3B4c5D6e7F'
const BOB = '0x8f3Ae21cB57D9a0C4e6F1b2D3c4E5f6A7b8CC9d1'
// Generada para imitar a Bob: mismos extremos, medio distinto
const FAKE_BOB = '0x8f3Ae2d41F0b9C7e2A5d8E1f3B6c9a0D2e4CC9d1'

const asset = (chainKey, contract, symbol, priceTick = null) => ({
	id: `${chainKey}:${contract ?? 'native'}`, chainKey, chainName: chainKey.toUpperCase(), kind: 'evm', symbol, decimals: 18,
	contract, priceTick, stable: !!contract, logoTick: symbol, networkTick: chainKey, tokenProgram: null, stock: null,
	amount: '100', rawAmount: '100000000000000000000', amountLabel: '100', staked: '0', stakedLabel: '0',
})
const USDT_BSC = asset('bsc', '0x55d398326f99059fF775485246999027B3197955', 'USDT')
const BNB = asset('bsc', null, 'BNB', 'BNB')
const USDT_ETH = asset('ethereum', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT')

const tx = (over) => ({ hash: `h${Math.random()}`, time: 1_790_000_000, direction: 'out', from: ME, to: BOB, amount: '120', symbol: 'USDT', contract: null, fee: null, status: 'confirmed', ...over })
const cache = (items) => ({ items, olderCursor: null, complete: true, updatedAt: 1 })

const PREPARED = {
	kind: 'evm',
	summary: { amount: 10n * 10n ** 18n, feeEstimated: 1000n, feeMax: 2000n, activatesAccount: false, expiresAt: null, feeTier: null, feeOptions: [] },
	inner: { sponsored: false },
	intent: { from: ME },
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const settle = () => act(async () => { await sleep(20) })

let caches
let tree
let screen
const render = async (to, extra = {}) => {
	const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }
	screen = () => <WalletSendConfirm navigation={navigation} route={{ params: { assetId: USDT_BSC.id, to, amount: '10', ...extra } }} />
	await act(async () => { tree = create(screen()) })
	await settle()
	return tree
}
/** Llega un precio nuevo (el catálogo se refresca solo, las xStocks cada 20 s) y la pantalla repinta. */
const pricesArrive = async (prices) => {
	usePriceMap.mockReturnValue(prices)
	await act(async () => { tree.update(screen()) })
}
const authModal = () => tree.root.find(node => node.type === 'WalletAuthModal')
const confirmButton = () => tree.root.find(node => node.type === 'QPButton' && node.props.title === 'Confirmar y firmar')
const texts = () => tree.root.findAllByType(Text).map(node => [].concat(node.props.children).filter(c => typeof c === 'string').join(''))
const hasText = (text) => texts().some(value => value.includes(text))
const checkbox = () => tree.root.find(node => node.props.testID === 'recipient-checked' && typeof node.type === 'string')

beforeEach(() => {
	caches = {}
	useWallet.mockReturnValue({ addresses: { evm: ME, tron: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', stx: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R', sol: 'So1ana1111111111111111111111111111111111111' } })
	useWalletAssets.mockReturnValue({ all: [USDT_BSC, BNB, USDT_ETH] })
	loadHistoryCache.mockImplementation(async (assetId) => caches[assetId] ?? cache([]))
	usePriceMap.mockReturnValue({})
	useWalletSendTx.mockReturnValue({
		phase: 'ready', prepared: PREPARED, error: null, feeTier: 'normal', busy: false, authVisible: false,
		setFeeTier: jest.fn(), openAuth: jest.fn(), closeAuth: jest.fn(), onAuthorized: jest.fn(), retry: jest.fn(),
		energyRented: false, energySlow: false, markEnergyRented: jest.fn(), onEnergyRented: jest.fn(),
	})
})

afterEach(() => { act(() => tree?.unmount()) })

test('imitación de Bob sacada del historial → aviso, y no se firma hasta marcar que se revisó', async () => {
	caches[USDT_BSC.id] = cache([
		tx({ direction: 'in', from: FAKE_BOB, to: ME, amount: '0.001' }),
		tx({ to: BOB }),
	])
	await render(FAKE_BOB)

	expect(hasText('Cuidado: esta dirección imita a otra')).toBe(true)
	// Las dos direcciones, con el medio que cambia aparte
	expect(hasText('d41F0b9C7e2A5d8E1f3B6c9a0D2e4')).toBe(true)
	expect(hasText('1cB57D9a0C4e6F1b2D3c4E5f6A7b8')).toBe(true)
	expect(confirmButton().props.disabled).toBe(true)

	await act(async () => { checkbox().props.onPress() })
	expect(checkbox().props.accessibilityState.checked).toBe(true)
	expect(confirmButton().props.disabled).toBe(false)
})

test('lo enviado en Ethereum protege un envío en BSC: la misma dirección EVM, otro historial', async () => {
	caches[USDT_ETH.id] = cache([tx({ to: BOB })])
	await render(FAKE_BOB)

	expect(loadHistoryCache).toHaveBeenCalledWith(USDT_ETH.id, ME)
	expect(hasText('Cuidado: esta dirección imita a otra')).toBe(true)
	expect(confirmButton().props.disabled).toBe(true)
})

test('solo polvo de una dirección sin nada a lo que se parezca → sospechosa, también bloquea', async () => {
	const stranger = '0x1111111111111111111111111111111111111111'
	caches[USDT_BSC.id] = cache([tx({ direction: 'in', from: stranger, to: ME, amount: '0.000001' })])
	await render(stranger)

	expect(hasText('Cuidado: dirección sospechosa')).toBe(true)
	expect(confirmButton().props.disabled).toBe(true)
})

test('a quien ya se le envió dinero → ni aviso ni bloqueo', async () => {
	caches[USDT_BSC.id] = cache([tx({ to: BOB })])
	await render(BOB.toLowerCase())

	expect(hasText('Cuidado')).toBe(false)
	expect(hasText('Es la primera vez')).toBe(false)
	expect(confirmButton().props.disabled).toBe(false)
})

test('una dirección nueva → solo el recordatorio de compararla entera', async () => {
	await render(BOB)

	expect(hasText('Es la primera vez que envías a esta dirección')).toBe(true)
	expect(confirmButton().props.disabled).toBe(false)
})

test('mientras se lee el historial del disco no se puede confirmar', async () => {
	const pending = []
	loadHistoryCache.mockImplementation(() => new Promise(resolve => { pending.push(() => resolve(cache([]))) }))
	await render(BOB)
	expect(pending.length).toBeGreaterThan(0)
	expect(confirmButton().props.disabled).toBe(true)

	await act(async () => { pending.forEach(release => release()) })
	await settle()
	expect(confirmButton().props.disabled).toBe(false)
})

test('el veredicto cambia con el PIN abierto: al autorizar se vuelve a mirar y no se firma', async () => {
	// La única huella del destino es una entrada mínima de BNB; sin precio no se puede llamar polvo
	const stranger = '0x1111111111111111111111111111111111111111'
	caches[BNB.id] = cache([tx({ direction: 'in', from: stranger, to: ME, amount: '0.00001', symbol: 'BNB' })])
	await render(stranger)
	expect(confirmButton().props.disabled).toBe(false)

	// Pulsa confirmar; la biometría captura el callback ANTES de esperar al sistema
	const authorizeLater = authModal().props.onAuthorized
	// Con el aviso del sistema en pantalla llega el precio: $0.006 es polvo y el destino, sospechoso
	await pricesArrive({ BNB: 600 })
	expect(hasText('Cuidado: dirección sospechosa')).toBe(true)

	const sendTx = useWalletSendTx.mock.results.at(-1).value
	await act(async () => { authorizeLater() })
	expect(sendTx.onAuthorized).not.toHaveBeenCalled()
	expect(sendTx.closeAuth).toHaveBeenCalled()
})

test('lo marcado vale para ESE aviso: si el aviso pasa a señalar otra dirección, hay que volver a revisar', async () => {
	// BOB2 se parece más al destino que Bob, pero solo es "de confianza" mientras su entrada no sea polvo
	const BOB2 = `${FAKE_BOB.slice(0, 14)}${'1'.repeat(23)}${FAKE_BOB.slice(-5)}`
	caches[USDT_BSC.id] = cache([tx({ to: BOB })])
	caches[BNB.id] = cache([tx({ direction: 'in', from: BOB2, to: ME, amount: '0.00001', symbol: 'BNB' })])
	await render(FAKE_BOB)
	expect(hasText(BOB2.slice(14, 37))).toBe(true)
	await act(async () => { checkbox().props.onPress() })
	expect(confirmButton().props.disabled).toBe(false)

	await pricesArrive({ BNB: 600 })
	// Ahora imita a Bob, y eso no lo revisó nadie
	expect(hasText('1cB57D9a0C4e6F1b2D3c4E5f6A7b8')).toBe(true)
	expect(checkbox().props.accessibilityState.checked).toBe(false)
	expect(confirmButton().props.disabled).toBe(true)
})

test('ya pagó una vez a la imitación (o fue el envío de prueba): el siguiente envío también avisa, sin señalar cuál es la buena', async () => {
	caches[USDT_BSC.id] = cache([
		tx({ to: FAKE_BOB, amount: '1' }),
		tx({ to: BOB }),
	])
	await render(FAKE_BOB)

	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(true)
	expect(hasText('La otra, casi igual')).toBe(true)
	// No dice "la que ya usaste": las dos se usaron y no se sabe cuál es la de verdad
	expect(hasText('La que ya usaste')).toBe(false)
	expect(confirmButton().props.disabled).toBe(true)

	await act(async () => { checkbox().props.onPress() })
	expect(confirmButton().props.disabled).toBe(false)
})

test('depósito de un intercambio: sin el recordatorio de compararla "con la que te dieron" (la generó el proveedor)', async () => {
	await render(BOB, { exchangeUuid: 'ex-1' })

	expect(hasText('Es la primera vez')).toBe(false)
	expect(confirmButton().props.disabled).toBe(false)
})

test('depósito de un intercambio que imita a una dirección de confianza: el aviso que bloquea se queda', async () => {
	caches[USDT_BSC.id] = cache([tx({ to: BOB })])
	await render(FAKE_BOB, { exchangeUuid: 'ex-1' })

	expect(hasText('Cuidado: esta dirección imita a otra')).toBe(true)
	expect(confirmButton().props.disabled).toBe(true)
})
