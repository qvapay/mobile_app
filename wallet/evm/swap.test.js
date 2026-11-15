/**
 * @jest-environment node
 *
 * Swap EVM vía LI.FI con transacciones REALES de su API (`lifiVectors.json`, 14 nov 2026),
 * generadas para la dirección de la clave 0x11…11: USDC → USDT en Base (misma red) y USDT de
 * BNB Chain → SOL (cruza, y quien cobra es una dirección de Solana). Qué se comprueba dentro
 * de la calldata está en `lifi.test.js`; aquí, lo que rodea a la llamada y los pasos.
 */
import { parseTransaction } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import LIFI_VECTORS from './lifiVectors.json'
import { EvmUnsupportedRouteError } from './lifi'
import {
	encodeApprove,
	evmReceiptStatus,
	nextEvmSwapStep,
	prepareEvmSwapStep,
	signEvmSwapStep,
	verifyRouteBuild,
	LIFI_DIAMOND,
	MAX_SWAP_GAS,
} from './swap'

const VECTORS = { same: LIFI_VECTORS.swapTokenToToken.build, cross: LIFI_VECTORS.nearToSolNative.build }

const KEY_HEX = '0x' + '11'.repeat(32)
const KEY = Uint8Array.from({ length: 32 }, () => 0x11)
const OWNER = privateKeyToAccount(KEY_HEX).address
const SOL_RECEIVER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BASE_USDT = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955'
const ATTACKER = '0x000000000000000000000000000000000000dEaD'

// Lo cotizado: 29,957319 USDT y 0,427986726 SOL. `minOut` es eso menos el 3 % de holgura
const SAME = {
	chainId: 8453, owner: OWNER, receiver: OWNER, token: BASE_USDC, decimals: 6, amountIn: 30_000_000n,
	to: { chainId: 8453, token: BASE_USDT, decimals: 6 }, minOut: 29_058_599n, quoted: 29_957_319n,
}
const CROSS = {
	chainId: 56, owner: OWNER, receiver: SOL_RECEIVER, token: BSC_USDT, decimals: 18, amountIn: 30_000_000_000_000_000_000n,
	to: { chainId: 'solana', token: null, decimals: 9 }, minOut: 415_147_124n, quoted: 427_986_726n,
}
const clone = (v) => JSON.parse(JSON.stringify(v))

describe('la ruta que manda el backend', () => {

	test('las dos rutas reales pasan, y devuelven el mínimo que la cadena hace cumplir', () => {
		expect(verifyRouteBuild(VECTORS.same, SAME)).toMatchObject({ to: LIFI_DIAMOND, value: 0n, minOut: 29_807_532n, fn: 'swapTokensMultipleV3ERC20ToERC20' })
		expect(verifyRouteBuild(VECTORS.cross, CROSS)).toMatchObject({ value: 0n, minOut: 425_846_792n, fn: 'swapAndStartBridgeTokensViaNEARIntents' })
	})

	test('un router fuera de la lista no pasa', () => {
		const build = clone(VECTORS.same); build.tx.to = ATTACKER
		expect(() => verifyRouteBuild(build, SAME)).toThrow(/router no permitido/)
	})

	test('una ruta que no paga a la wallet del usuario no pasa', () => {
		expect(() => verifyRouteBuild(VECTORS.same, { ...SAME, receiver: ATTACKER })).toThrow(/no paga a tu wallet/)
		expect(() => verifyRouteBuild(VECTORS.cross, { ...CROSS, receiver: 'GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9' })).toThrow(/no paga a tu wallet/)
	})

	test('ni una que entregue otro activo, o menos de lo cotizado', () => {
		expect(() => verifyRouteBuild(VECTORS.same, { ...SAME, to: { ...SAME.to, token: BASE_USDC } })).toThrow(/acaba en otro activo/)
		expect(() => verifyRouteBuild(VECTORS.same, { ...SAME, minOut: 29_807_533n })).toThrow(/menos de lo cotizado/)
	})

	test('ni una por una función del router que la wallet no sabe leer', () => {
		const relay = LIFI_VECTORS.relayDepository
		const intent = { chainId: 1, owner: OWNER, receiver: SOL_RECEIVER, token: null, decimals: 18, amountIn: BigInt(relay.from.amount), to: relay.to, minOut: 1n, quoted: null }
		expect(() => verifyRouteBuild(relay.build, intent)).toThrow(EvmUnsupportedRouteError)
	})

	test('mandar valor al pagar con token no pasa', () => {
		const build = clone(VECTORS.same); build.tx.value = '0x1'
		expect(() => verifyRouteBuild(build, SAME)).toThrow(/valor distinto/)
	})

	test('permiso a otro contrato, por otro importe o de otro token no pasa', () => {
		const spender = clone(VECTORS.same); spender.approval.spender = ATTACKER
		expect(() => verifyRouteBuild(spender, SAME)).toThrow(/no permitido/)
		const amount = clone(VECTORS.same); amount.approval.amount = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
		expect(() => verifyRouteBuild(amount, SAME)).toThrow(/otro importe/)
		const token = clone(VECTORS.same); token.approval.token = BSC_USDT
		expect(() => verifyRouteBuild(token, SAME)).toThrow(/otro token/)
	})

	test('una ruta de otra cadena, o en una cadena sin router, no pasa', () => {
		expect(() => verifyRouteBuild(VECTORS.same, { ...SAME, chainId: 56 })).toThrow(/otra cadena/)
		expect(() => verifyRouteBuild({ ...VECTORS.same, chainId: 10 }, { ...SAME, chainId: 10 })).toThrow(/sin router/)
	})
})

describe('pasos: permiso exacto y luego swap', () => {

	test('sin permiso suficiente toca aprobar; con él, el swap', () => {
		expect(nextEvmSwapStep({ token: BASE_USDC, amountIn: 20n, allowance: 0n })).toEqual({ step: 'approve', remaining: 1 })
		expect(nextEvmSwapStep({ token: BASE_USDC, amountIn: 20n, allowance: 20n })).toEqual({ step: 'swap', remaining: 0 })
		expect(nextEvmSwapStep({ token: null, amountIn: 20n, allowance: 0n })).toEqual({ step: 'swap', remaining: 0 })
	})

	test('USDT de Ethereum con un permiso viejo exige ponerlo a 0 antes', () => {
		expect(nextEvmSwapStep({ token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', amountIn: 20n, allowance: 5n })).toEqual({ step: 'reset', remaining: 2 })
		// Otro token con permiso viejo: se cambia directamente
		expect(nextEvmSwapStep({ token: BASE_USDC, amountIn: 20n, allowance: 5n }).step).toBe('approve')
	})

	test('approve codificado con el importe exacto', () => {
		expect(encodeApprove(LIFI_DIAMOND, 20_000_000n)).toBe('0x095ea7b3' + '0'.repeat(24) + LIFI_DIAMOND.slice(2).toLowerCase() + (20_000_000).toString(16).padStart(64, '0'))
	})
})

describe('contra un nodo simulado', () => {

	const mockRpc = ({ allowance = 0n, gas = 300_000n, revert = false, receipt, baseFee = 1_000_000_000n } = {}) => {
		const calls = []
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params, id } = JSON.parse(init.body)
			calls.push({ method, params })
			const reply = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }), text: async () => JSON.stringify({ jsonrpc: '2.0', id, result }) })
			const error = (message) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, error: { code: 3, message } }), text: async () => '' })
			if (method === 'eth_call') return reply('0x' + allowance.toString(16).padStart(64, '0'))
			if (method === 'eth_getTransactionCount') return reply('0x7')
			if (method === 'eth_getBlockByNumber') return reply({ baseFeePerGas: '0x' + baseFee.toString(16) })
			if (method === 'eth_maxPriorityFeePerGas') return reply('0x3b9aca00')
			if (method === 'eth_estimateGas') return revert ? error('execution reverted') : reply('0x' + gas.toString(16))
			if (method === 'eth_getTransactionReceipt') return reply(receipt ?? null)
			throw new Error('método inesperado ' + method)
		})
		return calls
	}
	afterEach(() => { delete global.fetch })
	const RPC = { url: 'https://rpc.test', priority: 0 }

	test('sin permiso: el primer paso es aprobar EXACTO al diamond, y se simula desde la wallet', async () => {
		const calls = mockRpc({ allowance: 0n, gas: 50_000n })
		const prepared = await prepareEvmSwapStep(RPC, VECTORS.same, SAME)
		expect(prepared.step).toBe('approve')
		expect(prepared.tx.to).toBe(BASE_USDC)
		expect(prepared.tx.data).toBe(encodeApprove(LIFI_DIAMOND, 30_000_000n))
		expect(calls.find(c => c.method === 'eth_estimateGas').params[0].from).toBe(OWNER)
	})

	test('con permiso: el swap va al router con la calldata de LI.FI, firmado y verificado', async () => {
		mockRpc({ allowance: 30_000_000n })
		const prepared = await prepareEvmSwapStep(RPC, VECTORS.same, SAME)
		expect(prepared.step).toBe('swap')
		expect(prepared.tx.gas).toBe(390_000n)
		const signed = await signEvmSwapStep(prepared, KEY)
		const parsed = parseTransaction(signed.raw)
		expect(parsed.to.toLowerCase()).toBe(LIFI_DIAMOND.toLowerCase())
		expect(parsed.data).toBe(VECTORS.same.tx.data.toLowerCase())
		expect(parsed.nonce).toBe(7)
	})

	test('si la simulación revierte, no hay nada que firmar', async () => {
		mockRpc({ allowance: 30_000_000n, revert: true })
		await expect(prepareEvmSwapStep(RPC, VECTORS.same, SAME)).rejects.toThrow(/reverted/)
	})

	test('un gas desorbitado no se firma', async () => {
		mockRpc({ allowance: 30_000_000n, gas: MAX_SWAP_GAS })
		await expect(prepareEvmSwapStep(RPC, VECTORS.same, SAME)).rejects.toThrow(/anómalo/)
	})

	// E-02: el precio lo da el nodo; uno que conteste ×1000 hacía firmar una comisión desmesurada
	test('un precio de gas fuera de rango tampoco, y se prueba con otro nodo', async () => {
		// Base: tope de 100 gwei por gas; con 60 de base la tx autorizaría 2·60 + 1 = 121
		mockRpc({ allowance: 30_000_000n, baseFee: 60_000_000_000n })
		const err = await prepareEvmSwapStep(RPC, VECTORS.same, SAME).catch(e => e)
		expect(err.message).toMatch(/precio de gas fuera de rango/)
		expect(err.retryable).toBe(true)
	})

	test('firmar con otra clave no pasa', async () => {
		mockRpc({ allowance: 30_000_000n })
		const prepared = await prepareEvmSwapStep(RPC, VECTORS.same, SAME)
		await expect(signEvmSwapStep(prepared, Uint8Array.from({ length: 32 }, () => 0x22))).rejects.toThrow(/firmante distinto/)
	})

	test('recibo: minado bien, revertido o aún no', async () => {
		mockRpc({ receipt: { status: '0x1' } })
		expect(await evmReceiptStatus(RPC, '0xabc')).toBe(true)
		mockRpc({ receipt: { status: '0x0' } })
		expect(await evmReceiptStatus(RPC, '0xabc')).toBe(false)
		mockRpc({ receipt: null })
		expect(await evmReceiptStatus(RPC, '0xabc')).toBe(null)
	})
})
