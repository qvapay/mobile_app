/**
 * @jest-environment node
 *
 * Swap EVM vía LI.FI con transacciones REALES de su API (10 oct 2026), generadas para la
 * dirección de la clave 0x11…11: USDC→ETH en Base (mismo usuario) y USDT de BSC → SOL en
 * Solana (receptor = una dirección de Solana, codificada como bytes32 en la calldata).
 */
import { parseTransaction } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
	encodeApprove,
	evmReceiptStatus,
	nextEvmSwapStep,
	prepareEvmSwapStep,
	receiverWord,
	signEvmSwapStep,
	verifyRouteBuild,
	LIFI_DIAMOND,
	MAX_SWAP_GAS,
} from './swap'

const VECTORS = {
	"same": {
		"chainId": 8453,
		"tx": {
			"to": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
			"data": "0x2c57e884800403cfe9bc740e019fc693a6dfbfab16b9557bdff35381476c086f53553e8200000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a000000000000000000000000000000000000000000000000001c3236ef5c57ad000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000067176617061790000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30783030303030303030303030303030303030303030303030303030303030303030303030303030303000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000200000000000000000000000000ce40449b773a3e6e5e769adb4e567179d4828cbd000000000000000000000000ce40449b773a3e6e5e769adb4e567179d4828cbd000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000000000000000000000000000000000000001312d0000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a4332d746b000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c06ebbefd94032b85424d51906e2a335efae264b000000000000000000000000000000000000000000000000000000000000c35000000000000000000000000000000000000000000000000000000000000000000000000000000000c87de04e2ec1f4282dff2933a2d58199f688fc3d000000000000000000000000c87de04e2ec1f4282dff2933a2d58199f688fc3d000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000013069b000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d33f0bde25ef555692193a40e908d94bddbc988356cd7f1679eab4000000000000000000000000013069b00000000000000000001c3236ef5c57ae075692193a40e908d94bddbc988356cd7f1679eab41231deb6f5749ef6ce6943a275a1d3e7486f4eae833589fcd6edb6e08f4c7c32d4f71b54bda02913eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee9a972d8c3a8dd27e5811cbcb75ebdac924fb53a1dbc6998296caa1652a810dc8d3baf4a8294330f1420000000000000000000000000000000000000645050204f925e2b4910601ff00000000000000000000000000",
			"value": "0x0",
			"gasLimit": "0xddc8d"
		},
		"approval": {
			"token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			"spender": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
			"amount": "20000000"
		},
		"tool": "nordstern"
	},
	"cross": {
		"chainId": 56,
		"tx": {
			"to": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
			"data": "0x80c65808000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002200000000000000000000000000000000000000000000000000000000000000420ce6d016b5d6308dd37d0c0f6c603a1e74c9a036691ef28c2ecad2b1ca76dd7e600000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055d398326f99059ff775485246999027b319795500000000000000000000000011f111f111f111f111f111f111f111f111f111f100000000000000000000000000000000000000000000000114dca34ce50b0000000000000000000000000000000000000000000000000000000416edef1601be0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056d6179616e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006717661706179000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000ce40449b773a3e6e5e769adb4e567179d4828cbd000000000000000000000000ce40449b773a3e6e5e769adb4e567179d4828cbd00000000000000000000000055d398326f99059ff775485246999027b319795500000000000000000000000055d398326f99059ff775485246999027b3197955000000000000000000000000000000000000000000000001158e460913d0000000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a4332d746b00000000000000000000000055d398326f99059ff775485246999027b319795500000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c06ebbefd94032b85424d51906e2a335efae264b00000000000000000000000000000000000000000000000000b1a2bc2ec50000000000000000000000000000000000000000000000000000000000007e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f200000000000000000000000040ffe85a28dc9993541449464d7529a9221429600000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000000000000000000000000000114dca34ce50b00000000000000000000000000000000000000000000000000000000000000000244a3a3083400000000000000000000000055d398326f99059ff775485246999027b319795500000000000000000000000000000000000000000000000114dca34ce50b0000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a7e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f20000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a5aa6e2171b416e1d27ec53ca8c13db3f91a89cd000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011490cf0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001ed550000000000000000000000000000000000000000000000000000000000046eae000000000000000000000000000000000000000000000000000000006acb12dc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000025d504f079d2aae21fd41dfb6fd79a25f6322cc12d330871d185e1e1abba6b1fb00000000000000000000000000000000000000000000000000000000000002200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
			"value": "0x0",
			"gasLimit": "0xa347b"
		},
		"approval": {
			"token": "0x55d398326f99059fF775485246999027B3197955",
			"spender": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
			"amount": "20000000000000000000"
		},
		"tool": "mayan"
	}
}

const KEY_HEX = '0x' + '11'.repeat(32)
const KEY = Uint8Array.from({ length: 32 }, () => 0x11)
const OWNER = privateKeyToAccount(KEY_HEX).address
const SOL_RECEIVER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955'
const ATTACKER = '0x000000000000000000000000000000000000dEaD'

const SAME = { chainId: 8453, owner: OWNER, receiver: OWNER, token: BASE_USDC, amountIn: 20_000_000n }
const CROSS = { chainId: 56, owner: OWNER, receiver: SOL_RECEIVER, token: BSC_USDT, amountIn: 20_000_000_000_000_000_000n }
const clone = (v) => JSON.parse(JSON.stringify(v))

describe('la ruta que manda el backend', () => {

	test('las dos rutas reales pasan', () => {
		expect(verifyRouteBuild(VECTORS.same, SAME).to).toBe(LIFI_DIAMOND)
		expect(verifyRouteBuild(VECTORS.cross, CROSS).value).toBe(0n)
	})

	test('el receptor de Solana se busca como sus 32 bytes', () => {
		expect(receiverWord(SOL_RECEIVER)).toHaveLength(64)
		expect(VECTORS.cross.tx.data.toLowerCase()).toContain(receiverWord(SOL_RECEIVER))
	})

	test('un router fuera de la lista no pasa', () => {
		const build = clone(VECTORS.same); build.tx.to = ATTACKER
		expect(() => verifyRouteBuild(build, SAME)).toThrow(/router no permitido/)
	})

	test('una ruta que no paga a la wallet del usuario no pasa', () => {
		expect(() => verifyRouteBuild(VECTORS.same, { ...SAME, receiver: ATTACKER })).toThrow(/no paga a tu wallet/)
		expect(() => verifyRouteBuild(VECTORS.cross, { ...CROSS, receiver: 'GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9' })).toThrow(/no paga a tu wallet/)
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

	const mockRpc = ({ allowance = 0n, gas = 300_000n, revert = false, receipt } = {}) => {
		const calls = []
		global.fetch = jest.fn(async (_url, init) => {
			const { method, params, id } = JSON.parse(init.body)
			calls.push({ method, params })
			const reply = (result) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }), text: async () => JSON.stringify({ jsonrpc: '2.0', id, result }) })
			const error = (message) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, error: { code: 3, message } }), text: async () => '' })
			if (method === 'eth_call') return reply('0x' + allowance.toString(16).padStart(64, '0'))
			if (method === 'eth_getTransactionCount') return reply('0x7')
			if (method === 'eth_getBlockByNumber') return reply({ baseFeePerGas: '0x3b9aca00' })
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
		expect(prepared.tx.data).toBe(encodeApprove(LIFI_DIAMOND, 20_000_000n))
		expect(calls.find(c => c.method === 'eth_estimateGas').params[0].from).toBe(OWNER)
	})

	test('con permiso: el swap va al router con la calldata de LI.FI, firmado y verificado', async () => {
		mockRpc({ allowance: 20_000_000n })
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
		mockRpc({ allowance: 20_000_000n, revert: true })
		await expect(prepareEvmSwapStep(RPC, VECTORS.same, SAME)).rejects.toThrow(/reverted/)
	})

	test('un gas desorbitado no se firma', async () => {
		mockRpc({ allowance: 20_000_000n, gas: MAX_SWAP_GAS })
		await expect(prepareEvmSwapStep(RPC, VECTORS.same, SAME)).rejects.toThrow(/anómalo/)
	})

	test('firmar con otra clave no pasa', async () => {
		mockRpc({ allowance: 20_000_000n })
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
