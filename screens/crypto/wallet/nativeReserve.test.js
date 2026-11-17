/**
 * Lo que MÁX deja atrás en un nativo. En el formulario de swap lo que sale puede ser un swap
 * firmado desde la wallet, que cuesta mucho más que un envío: con la reserva de un envío, MÁX
 * de BNB por LI.FI se quedaba sin comisión y la red rechazaba la tx (2026-11-17).
 * @jest-environment node
 */
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ getAppRpcRouter: jest.fn() }))

const { getAppRpcRouter } = require('../../../wallet/registry/appRpcRouter')
const { estimateNativeReserve, SWAP_RESERVE_GAS } = require('./walletSendActions')
const { NATIVE_TRANSFER_GAS } = require('../../../wallet/evm/tx')

const RPC = { url: 'https://rpc.test', priority: 0, owner: 'x' }
const EVM = { kind: 'evm', chainId: 56, native: { symbol: 'BNB', decimals: 18 }, explorer: '', rpcs: [RPC] }
const SOLANA = { kind: 'solana', native: { symbol: 'SOL', decimals: 9 }, explorer: '', rpcs: [RPC] }
const TRON = { kind: 'tron', native: { symbol: 'TRX', decimals: 6 }, explorer: '', rpcs: [RPC] }

// BNB Smart Chain hoy: sin comisión base y 0,05 gwei de prioridad
const TIP = 50_000_000n
const RENT = { 0: 890_880, 165: 2_039_280 }

let calls
beforeEach(() => {
	calls = []
	getAppRpcRouter.mockReturnValue({ call: (_chainKey, fn) => fn(RPC, new AbortController().signal) })
	global.fetch = jest.fn(async (_url, init) => {
		const { method, params, id } = JSON.parse(init.body)
		calls.push({ method, params })
		const reply = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }) })
		if (method === 'eth_getBlockByNumber') return reply({ baseFeePerGas: '0x0' })
		if (method === 'eth_maxPriorityFeePerGas') return reply('0x' + TIP.toString(16))
		if (method === 'getMinimumBalanceForRentExemption') return reply(RENT[params[0]])
		throw new Error('método inesperado ' + method)
	})
})
afterEach(() => { delete global.fetch })

describe('EVM', () => {
	test('un envío reserva el gas de una transferencia, con margen', async () => {
		await expect(estimateNativeReserve(EVM, 'bsc')).resolves.toBe(NATIVE_TRANSFER_GAS * TIP * 12n / 10n)
	})

	test('el formulario de swap reserva el gas de un swap: MÁX de BNB tiene que poder pagarlo', async () => {
		const reserve = await estimateNativeReserve(EVM, 'bsc', null, 'swap')
		expect(reserve).toBe(SWAP_RESERVE_GAS * TIP * 12n / 10n)
		// Dos swaps reales por LI.FI en BNB Smart Chain, con su +30 % de margen: 288.318 de gas
		// estimado con un importe pequeño y 522.154 con 3 BNB (la ruta se reparte en más tramos)
		const smallSwapMaxFee = 288_318n * 130n / 100n * TIP
		const bigSwapMaxFee = 522_154n * 130n / 100n * TIP
		expect(reserve).toBeGreaterThan(bigSwapMaxFee)
		// La de un envío no llegaba ni a la décima parte del pequeño
		expect(await estimateNativeReserve(EVM, 'bsc')).toBeLessThan(smallSwapMaxFee / 10n)
	})
})

describe('Solana', () => {
	test('un envío reserva el mínimo de la cuenta más la comisión', async () => {
		await expect(estimateNativeReserve(SOLANA, 'solana')).resolves.toBe(890_880n + 20_000n)
		expect(calls.map(c => c.params[0])).toEqual([0])
	})

	test('el formulario de swap reserva además la renta de las cuentas de token que un swap abre', async () => {
		// El wSOL temporal, la del activo que llega y dos intermedias, más comisión con prioridad
		await expect(estimateNativeReserve(SOLANA, 'solana', null, 'swap')).resolves.toBe(890_880n + 4n * 2_039_280n + 100_000n)
		expect(calls.map(c => c.params[0]).sort((a, b) => a - b)).toEqual([0, 165])
	})
})

test('TRON no reserva aquí (su reserva es fija) y Bitcoin sin dirección tampoco', async () => {
	await expect(estimateNativeReserve(TRON, 'tron', null, 'swap')).resolves.toBe(0n)
	await expect(estimateNativeReserve({ kind: 'btc', native: { symbol: 'BTC', decimals: 8 }, explorer: '', rpcs: [RPC] }, 'bitcoin', null, 'swap')).resolves.toBe(0n)
	expect(calls).toHaveLength(0)
})
