/**
 * @jest-environment node
 *
 * De la ruta que manda qpweb a lo que firma la wallet: el par, el importe, el receptor y el
 * mínimo garantizado se contrastan con lo que el usuario eligió, no se toman del backend.
 */
import { onchainQuoteParams, OnchainSwapMismatchError, planOnchainSwap, toUnits } from './onchainSwapModel'

const ADDRESSES = { evm: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A', sol: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', tron: 'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe', btc: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', stx: 's' }
const BASE_USDC = { id: 'base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainKey: 'base', kind: 'evm', decimals: 6, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' }
const BASE_ETH = { id: 'base:native', chainKey: 'base', kind: 'evm', decimals: 18, contract: null, symbol: 'ETH' }
const SOL = { id: 'solana:native', chainKey: 'solana', kind: 'solana', decimals: 9, contract: null, symbol: 'SOL' }
const SOL_USDC = { id: 'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chainKey: 'solana', kind: 'solana', decimals: 6, contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' }

const evmBuild = (over = {}) => ({
	family: 'evm', provider: 'lifi', quote_id: 'q', expires_at: '', from_asset: BASE_USDC.id, to_asset: BASE_ETH.id,
	amount: 20, toAmount: 0.007985, toAmountMin: 0.007945, chainId: 8453, fromAmount: '20000000',
	tx: { to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', data: '0x', value: '0x0', gasLimit: null },
	approval: { token: BASE_USDC.contract, spender: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', amount: '20000000' },
	...over,
})
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
	const plan = (over = {}, args = {}) => planOnchainSwap({ build: evmBuild(over), from: BASE_USDC, to: BASE_ETH, addresses: ADDRESSES, amount: 20, expectedOut: 0.007985, chainId: 8453, ...args })

	test('la intención sale de la wallet: dueño, receptor propio, token e importe exacto', () => {
		const p = plan()
		expect(p.family).toBe('evm')
		expect(p.intent).toEqual({ chainId: 8453, owner: ADDRESSES.evm, receiver: ADDRESSES.evm, token: BASE_USDC.contract, amountIn: 20_000_000n })
	})

	test('a Solana, el receptor es la dirección de Solana del propio usuario', () => {
		const p = planOnchainSwap({ build: evmBuild({ to_asset: SOL.id, toAmountMin: 0.18 }), from: BASE_USDC, to: SOL, addresses: ADDRESSES, amount: 20, expectedOut: 0.182, chainId: 8453 })
		expect(p.intent.receiver).toBe(ADDRESSES.sol)
	})

	test('otro par, otro importe u otra cadena no pasan', () => {
		expect(() => plan({ to_asset: SOL.id })).toThrow(OnchainSwapMismatchError)
		expect(() => plan({ amount: 21 })).toThrow(/otro importe/)
		expect(() => plan({ fromAmount: '20000001' })).toThrow(/otro importe/)
		expect(() => plan({ chainId: 56 })).toThrow(/otra cadena/)
	})

	test('un mínimo garantizado muy por debajo de lo enseñado no pasa', () => {
		expect(() => plan({ toAmountMin: 0.0075 })).toThrow(/mucho menos/)
		// Dentro del margen (slippage 0,5% + deriva): pasa
		expect(plan({ toAmountMin: 0.0078 }).minOut).toBe(toUnits(0.0078, 18))
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
