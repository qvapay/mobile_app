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
let mockAuth = { user: { balance: '0' }, isAuthenticated: false }
jest.mock('../../../auth/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../../../wallet/WalletContext', () => ({ useWallet: jest.fn() }))
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ useEffectiveRegistry: () => ({ chains: { bsc: { kind: 'evm', native: { symbol: 'BNB', decimals: 18 } } } }) }))
jest.mock('./walletQueries', () => ({ useWalletAssets: jest.fn(), usePriceMap: jest.fn() }))
jest.mock('./energyQueries', () => ({ useEnergyPricesQuery: jest.fn(() => ({ data: undefined })), estimatePrice: jest.fn(() => null) }))
jest.mock('./usePendingEnergyOrder', () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock('./historyCache', () => ({ loadHistoryCache: jest.fn() }))
jest.mock('./exchangeDeposit', () => ({ markDepositSent: jest.fn(), markDepositAttempt: jest.fn(async () => {}), clearDepositSent: jest.fn(async () => {}) }))
jest.mock('./depositGuard', () => ({ checkDeposit: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }))
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
import { estimatePrice, useEnergyPricesQuery } from './energyQueries'
import usePendingEnergyOrder from './usePendingEnergyOrder'
import { loadHistoryCache } from './historyCache'
import { toast } from 'sonner-native'
import useWalletSendTx from './useWalletSendTx'
import { clearDepositSent, markDepositAttempt, markDepositSent } from './exchangeDeposit'
import { checkDeposit } from './depositGuard'
import { ROUTES } from '../../../routes'
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
let navigation
const openAuth = jest.fn()
const render = async (to, extra = {}) => {
	navigation = { replace: jest.fn(), popTo: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }
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
/** El aviso neutral explica la estafa sin señalar cuál de las dos es la falsa */
const SCAM = 'Así funciona una estafa conocida'
const checkbox = () => tree.root.find(node => node.props.testID === 'recipient-checked' && typeof node.type === 'string')

/** Lo que devuelve el motor de envío con una tx lista para firmar. */
const baseEngine = () => ({
	phase: 'ready', prepared: PREPARED, error: null, feeTier: 'normal', busy: false, authVisible: false,
	setFeeTier: jest.fn(), openAuth, closeAuth: jest.fn(), onAuthorized: jest.fn(), retry: jest.fn(),
	energyRented: false, energySlow: false, energyPending: false, markEnergyRented: jest.fn(), markEnergyPending: jest.fn(), onEnergyRented: jest.fn(),
})

beforeEach(() => {
	jest.clearAllMocks()
	caches = {}
	mockAuth = { user: { balance: '0' }, isAuthenticated: false }
	usePendingEnergyOrder.mockReturnValue(null)
	useEnergyPricesQuery.mockReturnValue({ data: undefined })
	estimatePrice.mockReturnValue(null)
	useWallet.mockReturnValue({ addresses: { evm: ME, tron: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8', btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', stx: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R', sol: 'So1ana1111111111111111111111111111111111111' } })
	useWalletAssets.mockReturnValue({ all: [USDT_BSC, BNB, USDT_ETH] })
	loadHistoryCache.mockImplementation(async (assetId) => caches[assetId] ?? cache([]))
	usePriceMap.mockReturnValue({})
	useWalletSendTx.mockReturnValue(baseEngine())
})

afterEach(() => { act(() => tree?.unmount()) })

test('imitación de Bob sacada del historial → aviso, y no se firma hasta marcar que se revisó', async () => {
	caches[USDT_BSC.id] = cache([
		tx({ direction: 'in', from: FAKE_BOB, to: ME, amount: '0.001' }),
		tx({ to: BOB }),
	])
	await render(FAKE_BOB)

	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(true)
	expect(hasText(SCAM)).toBe(true)
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
	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(true)
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
	// Las dos solo MANDARON algo (ninguna pasa por delante por haberle pagado). BOB2 se parece más
	// al destino, pero solo es "de confianza" mientras su entrada no sea polvo
	const BOB2 = `${FAKE_BOB.slice(0, 14)}${'1'.repeat(23)}${FAKE_BOB.slice(-5)}`
	caches[USDT_BSC.id] = cache([tx({ direction: 'in', from: BOB, to: ME, amount: '50' })])
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
	expect(hasText(SCAM)).toBe(true)
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

	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(true)
	expect(confirmButton().props.disabled).toBe(true)
})

test('Bob pagó, una imitación mandó $0.50 y el usuario le paga a Bob por primera vez: aviso neutral, nunca «la que ya usaste» sobre la falsa', async () => {
	caches[USDT_BSC.id] = cache([
		tx({ direction: 'in', from: BOB, to: ME, amount: '50' }),
		tx({ direction: 'in', from: FAKE_BOB, to: ME, amount: '0.5' }),
	])
	await render(BOB)

	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(true)
	expect(hasText('En tu historial hay otra dirección que empieza y termina igual que esta')).toBe(true)
	expect(hasText(SCAM)).toBe(true)
	expect(hasText('La otra, casi igual')).toBe(true)
	expect(hasText('Cuidado: esta dirección imita a otra')).toBe(false)
	expect(hasText('La que ya usaste')).toBe(false)
	expect(confirmButton().props.disabled).toBe(true)

	await act(async () => { checkbox().props.onPress() })
	expect(confirmButton().props.disabled).toBe(false)
})

test('le pagó por error 1 USDT a la imitación y luego pega la dirección real de Bob: nunca se presenta a la imitación como «la que ya usaste»', async () => {
	caches[USDT_BSC.id] = cache([
		tx({ direction: 'in', from: BOB, to: ME, amount: '50' }),
		tx({ direction: 'in', from: FAKE_BOB, to: ME, amount: '0.5' }),
		tx({ to: FAKE_BOB, amount: '1' }),
	])
	await render(BOB)

	expect(hasText('Cuidado: esta dirección imita a otra')).toBe(false)
	expect(hasText('La que ya usaste')).toBe(false)
	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(true)
	expect(confirmButton().props.disabled).toBe(true)
})

test('imita a la dirección PROPIA: la única comparación en la que el aviso puede decir cuál es la buena', async () => {
	const fakeMe = `${ME.slice(0, 10)}${'1'.repeat(27)}${ME.slice(-5)}`
	await render(fakeMe)

	expect(hasText('Cuidado: esta dirección imita a la tuya')).toBe(true)
	expect(hasText('Tu dirección')).toBe(true)
	expect(hasText('Cuidado: hay otra dirección casi igual en tu historial')).toBe(false)
	// Ya explica la estafa con su propio texto
	expect(hasText(SCAM)).toBe(false)
	expect(confirmButton().props.disabled).toBe(true)
})

// ── Lo que se le dice a quien envía cuando la red lo rechazaría ───────────────
describe('errores que se enseñan', () => {
	const describeError = () => useWalletSendTx.mock.calls[useWalletSendTx.mock.calls.length - 1][0].describeError
	const WOULD_REVERT = 'La red rechazaría este envío, así que no se ha firmado. Revisa tu saldo del token o inténtalo más tarde.'

	// T-02: el motivo del nodo («REVERT opcode executed») no le dice nada a nadie
	test('una simulación que revierte se explica sin la jerga del nodo, en TRON y en EVM', async () => {
		await render(BOB)
		expect(describeError()(new Error('tron: el envío revertiría: REVERT opcode executed'))).toBe(WOULD_REVERT)
		expect(describeError()(new Error('https://bsc: eth_estimateGas → execution reverted'))).toBe(WOULD_REVERT)
	})

	// E-02: ningún nodo dio un precio de gas dentro del tope. Antes habría salido «sin nodos»
	test('una comisión disparada en todos los nodos no se cuenta como falta de nodos', async () => {
		const { AllRpcsFailedError } = require('../../../wallet/registry/rpcRouter')
		await render(BOB)
		const spike = new AllRpcsFailedError('bsc', [new Error('evm: precio de gas fuera de rango (60000000000 wei por gas, tope 50000000000)')])
		expect(describeError()(spike)).toBe('La comisión de la red está muy por encima de lo normal, así que no se ha firmado nada. Inténtalo más tarde.')
		// Y sin nodos de verdad, el mensaje ya no nombra una red que quizá no es la del envío
		expect(describeError()(new AllRpcsFailedError('bsc', [new Error('timeout')]))).toBe('Ningún nodo de la red responde. Revisa tu conexión e inténtalo de nuevo.')
	})

	test('el saldo insuficiente conserva su mensaje, aunque llegue dentro de un revert', async () => {
		await render(BOB)
		expect(describeError()(new Error('https://bsc: eth_estimateGas → execution reverted: ERC20: transfer amount exceeds balance'))).toBe('La red rechazó la transacción por saldo insuficiente.')
	})
})

// ── El depósito de un intercambio no se manda dos veces ──────────────────────
// El proveedor espera UN envío de un importe exacto: un segundo no se cambia, se queda a la
// espera de una devolución manual. Había tres caminos para repetirlo (un seguimiento viejo
// que seguía ofreciendo «Enviar ahora», una nota que caducaba antes que la orden y una
// difusión sin respuesta que no dejaba nota); la comprobación va ahora antes del PIN
describe('depósito de un intercambio', () => {
	const press = () => act(async () => { await confirmButton().props.onPress() })
	/** Lo que la pantalla le pasó al motor de envío. */
	const engineArgs = () => useWalletSendTx.mock.calls[useWalletSendTx.mock.calls.length - 1][0]

	test('un envío normal no pregunta nada: abre el PIN', async () => {
		await render(BOB)
		await press()
		expect(checkDeposit).not.toHaveBeenCalled()
		expect(openAuth).toHaveBeenCalledTimes(1)
		expect(engineArgs().onAttempt).toBeUndefined()
		expect(engineArgs().onDropped).toBeUndefined()
	})

	test('sin depósito previo y con la orden esperándolo: abre el PIN', async () => {
		checkDeposit.mockResolvedValue({ allowed: true })
		await render(BOB, { exchangeUuid: 'ex-1' })
		await press()
		expect(checkDeposit).toHaveBeenCalledWith('ex-1')
		expect(openAuth).toHaveBeenCalledTimes(1)
		expect(navigation.popTo).not.toHaveBeenCalled()
	})

	test('ya salió uno (aunque el seguimiento de debajo aún ofreciera enviar): NO se pide el PIN', async () => {
		checkDeposit.mockResolvedValue({ allowed: false, reason: 'sent', txid: '0xabc' })
		await render(BOB, { exchangeUuid: 'ex-1' })
		await press()
		expect(openAuth).not.toHaveBeenCalled()
		expect(toast).toHaveBeenCalledWith('Ya enviaste el depósito de este intercambio.')
		expect(navigation.popTo).toHaveBeenCalledWith(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: 'ex-1', sentTxid: '0xabc' })
	})

	test('la orden ya no espera depósito (avanzó, caducó): tampoco', async () => {
		checkDeposit.mockResolvedValue({ allowed: false, reason: 'closed', status: 'expired' })
		await render(BOB, { exchangeUuid: 'ex-1' })
		await press()
		expect(openAuth).not.toHaveBeenCalled()
		expect(toast).toHaveBeenCalledWith('Este intercambio ya no espera un depósito.')
		expect(navigation.popTo).toHaveBeenCalledWith(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: 'ex-1' })
	})

	test('si no se pudo comprobar no se firma, y la pantalla se queda para reintentar', async () => {
		checkDeposit.mockResolvedValue({ allowed: false, reason: 'unknown' })
		await render(BOB, { exchangeUuid: 'ex-1' })
		await press()
		expect(openAuth).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalledWith('No pudimos comprobar el intercambio. Inténtalo de nuevo.')
		expect(navigation.popTo).not.toHaveBeenCalled()
	})

	test('la nota se escribe en cuanto la firma va a salir, con su hash y con qué preguntar después a la cadena, y se retira si consta que no entró', async () => {
		await render(BOB, { exchangeUuid: 'ex-1' })
		const ref = { kind: 'evm', chainKey: 'bsc', hash: '0xhash', from: '0xFROM', nonce: 7 }
		await engineArgs().onAttempt('0xhash', ref)
		expect(markDepositAttempt).toHaveBeenCalledWith('ex-1', '0xhash', ref)
		engineArgs().onDropped()
		expect(clearDepositSent).toHaveBeenCalledWith('ex-1')
	})

	test('al entrar se anota como enviado y se vuelve AL seguimiento que había (sin dejar una copia vieja debajo)', async () => {
		await render(BOB, { exchangeUuid: 'ex-1' })
		act(() => { engineArgs().onSent('0xhash') })
		expect(markDepositSent).toHaveBeenCalledWith('ex-1', '0xhash')
		expect(navigation.popTo).toHaveBeenCalledWith(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: 'ex-1', sentTxid: '0xhash' })
		expect(navigation.replace).not.toHaveBeenCalled()
	})

	test('un envío normal sigue yendo a su pantalla de éxito', async () => {
		await render(BOB)
		act(() => { engineArgs().onSent('0xhash') })
		expect(navigation.replace).toHaveBeenCalledWith(ROUTES.WALLET_SEND_SUCCESS, { assetId: USDT_BSC.id, txid: '0xhash', amount: '10', to: BOB })
		expect(markDepositSent).not.toHaveBeenCalled()
	})
})

// ── Un alquiler de energía ya cobrado no se vuelve a ofrecer (N-02) ───────────
describe('energía ya alquilada antes de abrir la pantalla', () => {
	const TRON_ME = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8'
	// Un envío de USDT en TRON sin energía: quema TRX, así que la pantalla ofrece alquilarla
	const PREPARED_TRON = {
		kind: 'tron',
		summary: PREPARED.summary,
		inner: {
			sponsored: false,
			fee: { energyNeeded: 65_000n, bandwidthNeeded: 345n, activatesAccount: false },
			resources: { energy: 0n, freeBandwidth: 600n, stakedBandwidth: 0n },
			params: { energyFeeSun: 100n, bandwidthFeeSun: 1000n, createAccountFeeSun: 1_000_000n },
		},
		intent: { from: TRON_ME },
	}
	const pendingOrder = (target) => ({ uuid: 'order-1', target_address: target, volume: 66_000, duration: '1h', status: 'dispatching' })
	const OFFER = 'Alquilar energía'
	const PAID = 'Ya pagaste un alquiler de energía para esta dirección'
	let markEnergyPending
	const engine = (over = {}) => {
		markEnergyPending = jest.fn()
		useWalletSendTx.mockReturnValue({ ...baseEngine(), prepared: PREPARED_TRON, markEnergyPending, ...over })
	}

	beforeEach(() => {
		mockAuth = { user: { uuid: 'ana', balance: '5' }, isAuthenticated: true }
		estimatePrice.mockReturnValue(0.55)
		usePriceMap.mockReturnValue({ BNB: 600 })
	})

	test('sin nada pendiente, se ofrece alquilar', async () => {
		engine()
		await render(BOB)
		expect(usePendingEnergyOrder).toHaveBeenCalledWith('ana')
		expect(hasText(OFFER)).toBe(true)
		expect(markEnergyPending).not.toHaveBeenCalled()
	})

	test('uno cobrado y sin entregar para la dirección que FIRMA arma el latch', async () => {
		usePendingEnergyOrder.mockReturnValue(pendingOrder(TRON_ME))
		engine()
		await render(BOB)
		expect(markEnergyPending).toHaveBeenCalled()
	})

	test('si era para otra dirección, no', async () => {
		usePendingEnergyOrder.mockReturnValue(pendingOrder('TOtraDireccionQueNoFirmaEsteEnvio1'))
		engine()
		await render(BOB)
		expect(markEnergyPending).not.toHaveBeenCalled()
		expect(hasText(OFFER)).toBe(true)
	})

	test('con el latch armado no se ofrece otro: se dice que ya está pagado', async () => {
		usePendingEnergyOrder.mockReturnValue(pendingOrder(TRON_ME))
		engine({ energyRented: true, energyPending: true })
		await render(BOB)
		expect(hasText(PAID)).toBe(true)
		expect(hasText(OFFER)).toBe(false)
	})

	test('sin sesión no se mira nada: el alquiler sale del saldo de la cuenta', async () => {
		mockAuth = { user: null, isAuthenticated: false }
		engine()
		await render(BOB)
		expect(usePendingEnergyOrder).toHaveBeenCalledWith(null)
	})
})
