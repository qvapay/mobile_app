/**
 * @jest-environment node
 *
 * De la ruta que manda qpweb a lo que firma la wallet: el par, el importe, el receptor y el
 * mínimo garantizado se contrastan con lo que el usuario eligió, no se toman del backend.
 */
import { onchainQuoteParams, OnchainSwapMismatchError, planOnchainSwap, routeForPrepare, toUnits } from './onchainSwapModel'
import { decodeLifiCall, encodeLifiCall, EvmUnsupportedRouteError } from '../../../wallet/evm/lifi'
import VECTORS from '../../../wallet/evm/lifiVectors.json'
import { EvmVerifyError } from '../../../wallet/evm/tx'

const ADDRESSES = { evm: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A', sol: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', tron: 'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe', btc: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', stx: 's' }
const BASE_USDC = { id: 'base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainKey: 'base', kind: 'evm', decimals: 6, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' }
const BASE_USDT = { id: 'base:0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', chainKey: 'base', kind: 'evm', decimals: 6, contract: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT' }
const BSC_USDT = { id: 'bsc:0x55d398326f99059fF775485246999027B3197955', chainKey: 'bsc', kind: 'evm', decimals: 18, contract: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' }
const ETH = { id: 'ethereum:native', chainKey: 'ethereum', kind: 'evm', decimals: 18, contract: null, symbol: 'ETH' }
const SOL = { id: 'solana:native', chainKey: 'solana', kind: 'solana', decimals: 9, contract: null, symbol: 'SOL' }
const SOL_USDC = { id: 'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chainKey: 'solana', kind: 'solana', decimals: 6, contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' }

/** Copia profunda que respeta los bigint (JSON no los admite). */
const deepClone = (value) => (Array.isArray(value)
	? value.map(deepClone)
	: value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, deepClone(inner)])) : value)

/** La ruta tal y como la mandaría qpweb, con una transacción REAL de LI.FI dentro (`lifiVectors.json`). */
const evmBuild = (name, from, to, over = {}) => {
	const v = VECTORS[name]
	const units = (value, decimals) => Number(value) / 10 ** decimals
	return {
		family: 'evm', provider: 'lifi', quote_id: 'q', expires_at: '', from_asset: from.id, to_asset: to.id,
		amount: units(v.from.amount, from.decimals), toAmount: units(v.toAmount, to.decimals), toAmountMin: units(v.toAmountMin, to.decimals),
		chainId: v.build.chainId, fromAmount: v.from.amount, tx: v.build.tx, approval: v.build.approval,
		...over,
	}
}
const solBuild = (over = {}) => ({
	family: 'solana', provider: 'jupiter', quote_id: 'q', expires_at: '', from_asset: SOL.id, to_asset: SOL_USDC.id,
	amount: 0.1, toAmount: 10.875069, toAmountMin: 10.820694, toAmountMinUnits: '10820694', inAmount: '100000000',
	instructions: {}, lookupTables: [],
	...over,
})

describe('unidades, con la misma regla que qpweb', () => {
	test('sin ruido de coma flotante', () => {
		expect(toUnits(0.1, 18)).toBe(100_000_000_000_000_000n)
		expect(toUnits(20, 6)).toBe(20_000_000n)
		expect(toUnits(1e-7, 18)).toBe(100_000_000_000n)
		expect(toUnits(0, 6)).toBeNull()
	})
})

describe('cotizar pidiendo rutas on-chain', () => {
	test('manda las familias que sabe firmar y las direcciones propias', () => {
		expect(onchainQuoteParams(ADDRESSES)).toEqual({ onchain: ['evm', 'solana', 'tron', 'btc'], addresses: { evm: ADDRESSES.evm, solana: ADDRESSES.sol, tron: ADDRESSES.tron, btc: ADDRESSES.btc } })
		expect(onchainQuoteParams(null)).toEqual({})
	})
})

describe('EVM (LI.FI)', () => {
	// 30 USDC → USDT en Base: cotizados 29,957319 USDT; la transacción garantiza 29,807532
	const SWAP = VECTORS.swapTokenToToken
	const plan = (over = {}, args = {}) => planOnchainSwap({
		build: evmBuild('swapTokenToToken', BASE_USDC, BASE_USDT, over), from: BASE_USDC, to: BASE_USDT, addresses: ADDRESSES, amount: 30, expectedOut: 29.957319, chainId: 8453, toChainId: 8453, ...args,
	})
	// 30 USDT de BNB Chain → SOL por un puente: cotizados 0,427986726 SOL
	const toSolana = (over = {}, args = {}) => planOnchainSwap({
		build: evmBuild('nearToSolNative', BSC_USDT, SOL, over), from: BSC_USDT, to: SOL, addresses: ADDRESSES, amount: 30, expectedOut: 0.427986726, chainId: 56, ...args,
	})

	test('la intención sale de la wallet: dueño, receptor propio, par, importe exacto y lo mínimo que tiene que llegar', () => {
		const p = plan()
		expect(p.family).toBe('evm')
		expect(p.intent).toEqual({
			chainId: 8453, owner: ADDRESSES.evm, receiver: ADDRESSES.evm, token: BASE_USDC.contract, decimals: 6, amountIn: 30_000_000n,
			to: { chainId: 8453, token: BASE_USDT.contract, decimals: 6 },
			// Lo cotizado menos el 3 % de holgura, y lo cotizado
			minOut: 29_058_599n, quoted: 29_957_319n,
		})
	})

	test('a Solana, el receptor es la dirección de Solana del propio usuario', () => {
		const p = toSolana()
		expect(p.intent.receiver).toBe(ADDRESSES.sol)
		expect(p.intent.to).toEqual({ chainId: 'solana', token: null, decimals: 9 })
		expect(p.minOut).toBe(BigInt(VECTORS.nearToSolNative.toAmountMin))
	})

	test('otro par, otro importe u otra cadena no pasan', () => {
		expect(() => plan({ to_asset: SOL.id })).toThrow(OnchainSwapMismatchError)
		expect(() => plan({ amount: 31 })).toThrow(/otro importe/)
		expect(() => plan({ fromAmount: '30000001' })).toThrow(/otro importe/)
		expect(() => plan({ chainId: 56 })).toThrow(/otra cadena/)
		expect(() => plan({}, { toChainId: undefined })).toThrow(/red de destino desconocida/)
	})

	test('un mínimo del JSON muy por debajo de lo enseñado no pasa', () => {
		expect(() => plan({ toAmountMin: 28 })).toThrow(/mucho menos/)
	})

	// O-02: el JSON podía decir un mínimo y la transacción llevar otro. El que se pinta es el de la cadena
	test('el mínimo que se enseña es el que lleva la TRANSACCIÓN, no el que dice el JSON', () => {
		expect(plan().minOut).toBe(BigInt(SWAP.toAmountMin))
		// El JSON presume de más: no cuenta
		expect(plan({ toAmountMin: 29.9 }).minOut).toBe(29_807_532n)
		// Sin nada cotizado, el suelo es el del JSON (menos el ruido de pasar por un decimal)
		expect(plan({}, { expectedOut: null }).intent).toMatchObject({ minOut: 29_807_532n - 29n, quoted: null })
		expect(() => plan({ toAmountMin: null }, { expectedOut: null })).toThrow(/no garantiza un mínimo/)
	})

	test('una transacción que garantiza menos de lo cotizado no se firma, diga lo que diga el JSON', () => {
		const { name, args } = decodeLifiCall(SWAP.build.tx.data)
		const forged = (change) => { const next = deepClone(args); change(next); return { tx: { ...SWAP.build.tx, data: encodeLifiCall(name, next) } } }
		expect(() => plan(forged((next) => { next[4] = 1n }))).toThrow(EvmVerifyError)
		expect(() => plan(forged((next) => { next[4] = 1n }))).toThrow(/menos de lo cotizado/)
		// Ni una que pague a otro, aunque el JSON sea impecable
		expect(() => plan(forged((next) => { next[3] = '0x000000000000000000000000000000000000dEaD' }))).toThrow(/no paga a tu wallet/)
	})

	test('una ruta por una función que la wallet no sabe leer no se planifica', () => {
		const relay = evmBuild('relayDepository', ETH, SOL)
		expect(() => planOnchainSwap({ build: relay, from: ETH, to: SOL, addresses: ADDRESSES, amount: 0.01, expectedOut: 0.25, chainId: 1 })).toThrow(EvmUnsupportedRouteError)
	})
})

describe('Solana (Jupiter)', () => {
	const plan = (over = {}, args = {}) => planOnchainSwap({ build: solBuild(over), from: SOL, to: SOL_USDC, addresses: ADDRESSES, amount: 0.1, expectedOut: 10.875069, ...args })

	test('el mínimo de la simulación es el garantizado por la ruta, y el dueño es la wallet', () => {
		const p = plan()
		expect(p.family).toBe('solana')
		expect(p.intent).toEqual({ owner: ADDRESSES.sol, inputMint: null, outputMint: SOL_USDC.contract, amountIn: 100_000_000n, minOut: 10_820_694n })
	})

	test('sin mínimo, o por otro importe, no pasa', () => {
		expect(() => plan({ toAmountMinUnits: null }, { expectedOut: null })).toThrow(/no garantiza/)
		expect(() => plan({ inAmount: '100000001' })).toThrow(/otro importe/)
	})
})

describe('TRON (SunSwap)', () => {
	const TRX = { id: 'tron:native', chainKey: 'tron', kind: 'tron', decimals: 6, contract: null, symbol: 'TRX' }
	const USDT_TRON = { id: 'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', chainKey: 'tron', kind: 'tron', decimals: 6, contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', symbol: 'USDT' }
	const build = (over = {}) => ({ family: 'tron', provider: 'sunswap', quote_id: 'q', expires_at: '', from_asset: USDT_TRON.id, to_asset: TRX.id, amount: 20, toAmount: 60.22, toAmountMin: 59.92, toAmountMinUnits: '59918826', router: 'x', path: [], ...over })

	test('la intención la arma la wallet: dueño, tokens e importe; del backend solo el mínimo', () => {
		const p = planOnchainSwap({ build: build(), from: USDT_TRON, to: TRX, addresses: ADDRESSES, amount: 20, expectedOut: 60.22 })
		expect(p.intent).toEqual({ owner: ADDRESSES.tron, inputToken: USDT_TRON.contract, outputToken: null, amountIn: 20_000_000n, minOut: 59_918_826n })
	})

	test('un mínimo irrisorio no pasa', () => {
		expect(() => planOnchainSwap({ build: build({ toAmountMinUnits: '1000000' }), from: USDT_TRON, to: TRX, addresses: ADDRESSES, amount: 20, expectedOut: 60.22 })).toThrow(/mucho menos/)
	})
})

describe('BTC (THORChain)', () => {
	const BTC = { id: 'bitcoin:native', chainKey: 'bitcoin', kind: 'btc', decimals: 8, contract: null, symbol: 'BTC' }
	const USDT_TRON = { id: 'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', chainKey: 'tron', kind: 'tron', decimals: 6, contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', symbol: 'USDT' }
	const build = (over = {}) => ({
		family: 'btc', provider: 'thorchain', quote_id: 'q', expires_at: '', from_asset: BTC.id, to_asset: USDT_TRON.id, amount: 0.005,
		toAmount: 408.53759756, toAmountMin: 404.45222158, memo: `=:TRON.USDT:${ADDRESSES.tron}:40445222158/1/0:t:40`,
		pool: 'TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T', amountSats: '500000', expiry: null, expectedOutUnits: '40853759756', ...over,
	})
	const plan = (over = {}, args = {}) => planOnchainSwap({ build: build(over), from: BTC, to: USDT_TRON, addresses: ADDRESSES, amount: 0.005, expectedOut: 408.53759756, serviceFeeBps: 40, ...args })

	test('el pool sale de la tabla de la wallet y el destino es su propia dirección TRON', () => {
		const p = plan()
		expect(p.intent).toMatchObject({ from: ADDRESSES.btc, amountSats: 500_000n, pool: 'TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T', destination: ADDRESSES.tron, shownOut: 40_853_759_756n, maxAffiliateBps: 40 })
		// El mínimo para pintarlo, en los decimales del destino (USDT de TRON: 6)
		expect(p.minOut).toBe(404_452_221n)
	})

	test('otro pool u otro importe no pasan', () => {
		expect(() => plan({ pool: 'ETH.ETH' })).toThrow(/otro activo/)
		expect(() => plan({ amountSats: '500001' })).toThrow(/otro importe/)
	})
})

// O-06: una tx EVM no caduca, así que nada obligaba a pedir la ruta otra vez. «Reintentar», o
// el paso del swap tras esperar al permiso, preparaban la de cuando se abrió la pantalla
describe('la ruta con la que se prepara un paso', () => {
	const AT = 1_800_000_000_000
	const TTL = 90_000
	const evm = { build: { family: 'evm', chainId: 8453 }, at: AT }
	const fresh = { build: { family: 'evm', chainId: 8453 }, at: AT + TTL + 5 }

	test('una ruta EVM reciente se usa tal cual, sin pedir nada', async () => {
		const fetchRoute = jest.fn()
		await expect(routeForPrepare(evm, AT + TTL - 1, fetchRoute)).resolves.toEqual({ route: evm, refreshed: false })
		expect(fetchRoute).not.toHaveBeenCalled()
	})

	test('una vieja no se vuelve a preparar: se pide otra', async () => {
		const fetchRoute = jest.fn(async () => fresh)
		await expect(routeForPrepare(evm, AT + TTL, fetchRoute)).resolves.toEqual({ route: fresh, refreshed: true })
		expect(fetchRoute).toHaveBeenCalledTimes(1)
	})

	test('si qpweb ya no la da (la cotización caducó, el precio se movió), el fallo llega a quien prepara', async () => {
		const gone = new Error('La cotización caducó')
		await expect(routeForPrepare(evm, AT + TTL, async () => { throw gone })).rejects.toBe(gone)
	})

	test('Solana, TRON y Bitcoin no pasan por aquí: su tx caduca sola o la codifica la wallet', async () => {
		const fetchRoute = jest.fn()
		for (const family of ['solana', 'tron', 'btc']) {
			const route = { build: { family }, at: AT }
			await expect(routeForPrepare(route, AT + 10 * TTL, fetchRoute)).resolves.toEqual({ route, refreshed: false })
		}
		expect(fetchRoute).not.toHaveBeenCalled()
	})
})
