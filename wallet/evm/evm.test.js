/**
 * @jest-environment node
 *
 * Enviar en EVM: construcción con fee real (EIP-1559 y legacy), firma
 * verificada (parse + firmante recuperado) y broadcast idempotente.
 */
import { parseTransaction } from 'viem'

import {
	broadcastEvmTransaction,
	checksumAddress,
	encodeErc20Transfer,
	EvmVerifyError,
	isValidEvmAddress,
	NATIVE_TRANSFER_GAS,
	prepareEvmSend,
	signEvmTransaction,
	verifySignedEvmTransaction,
} from './tx'
import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import { isRetryableRpcError } from '../registry/rpcRouter'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SEED = mnemonicToSeed(MNEMONIC)
const FROM = deriveAddresses(SEED).evm // 0x9858EfFD232B4033E47d90003D41EC34EcaEda94
const TO = '0x55d398326f99059fF775485246999027B3197955'
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955'
const RPC = { url: 'https://bsc', priority: 10, owner: 'x' }
const BSC = { kind: 'evm', chainId: 56, native: { symbol: 'BNB', decimals: 18 }, explorer: '', rpcs: [RPC] }

let calls
const mockRpc = (handlers) => {
	calls = []
	global.fetch = jest.fn(async (url, init) => {
		const body = JSON.parse(init.body)
		calls.push(body)
		const handler = handlers[body.method]
		if (!handler) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: `method ${body.method} not found` } }) }
		const result = handler(body.params)
		if (result instanceof Error) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: 3, message: result.message } }) }
		return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) }
	})
}
afterEach(() => { delete global.fetch })

const gwei = (n) => BigInt(n) * 10n ** 9n
const hex = (v) => `0x${BigInt(v).toString(16)}`

describe('direcciones y calldata', () => {
	test('EIP-55: mezcla de mayúsculas con checksum incorrecto = inválida; todo minúsculas vale', () => {
		expect(isValidEvmAddress(FROM)).toBe(true)
		expect(isValidEvmAddress(FROM.toLowerCase())).toBe(true)
		expect(isValidEvmAddress(FROM.slice(0, -1) + (FROM.endsWith('4') ? '5' : '4'))).toBe(false)
		expect(isValidEvmAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94'.replace('EfFD', 'effd'))).toBe(false)
		expect(isValidEvmAddress('TWqvtpZkwfpbjujqJtzLsVx5bm79wFDJTg')).toBe(false)
		expect(checksumAddress(FROM.toLowerCase())).toBe(FROM)
	})

	test('transfer(address,uint256)', () => {
		expect(encodeErc20Transfer(TO, 1_000_000n)).toBe('0xa9059cbb' + '00000000000000000000000055d398326f99059ff775485246999027b3197955' + '00000000000000000000000000000000000000000000000000000000000f4240')
	})
})

describe('prepareEvmSend', () => {
	test('nativo EIP-1559: 21000 gas, nonce pending, maxFee = 2·base + priority', async () => {
		mockRpc({
			eth_getTransactionCount: (params) => { expect(params).toEqual([FROM, 'pending']); return '0x3' },
			eth_getBlockByNumber: () => ({ baseFeePerGas: hex(gwei(1)) }),
			eth_maxPriorityFeePerGas: () => hex(gwei(2)),
		})
		const prepared = await prepareEvmSend(RPC, BSC, { chainId: 56, from: FROM, to: TO, amount: 10n ** 15n, contract: null })
		expect(prepared.tx).toMatchObject({ type: 'eip1559', chainId: 56, nonce: 3, to: TO, value: 10n ** 15n, data: '0x', gas: NATIVE_TRANSFER_GAS, maxFeePerGas: gwei(4), maxPriorityFeePerGas: gwei(2) })
		expect(prepared.fee).toEqual({ gasLimit: 21_000n, estimatedWei: 21_000n * gwei(3), maxWei: 21_000n * gwei(4), eip1559: true })
		expect(calls.map(c => c.method)).not.toContain('eth_estimateGas')
	})

	test('token: estimateGas +25%, value 0, calldata transfer; legacy si el bloque no trae baseFee', async () => {
		mockRpc({
			eth_getTransactionCount: () => '0x0',
			eth_getBlockByNumber: () => ({}),
			eth_gasPrice: () => hex(gwei(5)),
			eth_estimateGas: (params) => { expect(params[0]).toMatchObject({ from: FROM, to: USDT_BSC, value: '0x0' }); return hex(52_000) },
		})
		const prepared = await prepareEvmSend(RPC, BSC, { chainId: 56, from: FROM, to: TO, amount: 10n ** 18n, contract: USDT_BSC })
		expect(prepared.tx).toMatchObject({ type: 'legacy', to: USDT_BSC, value: 0n, data: encodeErc20Transfer(TO, 10n ** 18n), gas: 65_000n, gasPrice: gwei(5) })
		expect(prepared.fee).toEqual({ gasLimit: 65_000n, estimatedWei: 65_000n * gwei(5), maxWei: 65_000n * gwei(5), eip1559: false })
	})

	test('prioridad sugerida 0 → suelo de 1 gwei; nodo sin eth_maxPriorityFeePerGas también', async () => {
		mockRpc({ eth_getTransactionCount: () => '0x0', eth_getBlockByNumber: () => ({ baseFeePerGas: hex(gwei(10)) }), eth_maxPriorityFeePerGas: () => '0x0' })
		const a = await prepareEvmSend(RPC, BSC, { chainId: 56, from: FROM, to: TO, amount: 1n, contract: null })
		expect(a.tx.maxPriorityFeePerGas).toBe(gwei(1))
		mockRpc({ eth_getTransactionCount: () => '0x0', eth_getBlockByNumber: () => ({ baseFeePerGas: hex(gwei(10)) }) })
		const b = await prepareEvmSend(RPC, BSC, { chainId: 56, from: FROM, to: TO, amount: 1n, contract: null })
		expect(b.tx.maxPriorityFeePerGas).toBe(gwei(1))
	})

	test('estimación revertida → error legible no reintentable; chainId ajeno y gas anómalo también fallan', async () => {
		mockRpc({ eth_getTransactionCount: () => '0x0', eth_getBlockByNumber: () => ({ baseFeePerGas: hex(gwei(1)) }), eth_maxPriorityFeePerGas: () => hex(gwei(1)), eth_estimateGas: () => new Error('execution reverted: BEP20: transfer amount exceeds balance') })
		const err = await prepareEvmSend(RPC, BSC, { chainId: 56, from: FROM, to: TO, amount: 1n, contract: USDT_BSC }).catch(e => e)
		expect(err.message).toMatch(/exceeds balance/)
		expect(isRetryableRpcError(err)).toBe(false)
		await expect(prepareEvmSend(RPC, BSC, { chainId: 1, from: FROM, to: TO, amount: 1n, contract: null })).rejects.toThrow(/chainId/)
		mockRpc({ eth_getTransactionCount: () => '0x0', eth_getBlockByNumber: () => ({ baseFeePerGas: hex(gwei(1)) }), eth_maxPriorityFeePerGas: () => hex(gwei(1)), eth_estimateGas: () => hex(5_000_000) })
		await expect(prepareEvmSend(RPC, BSC, { chainId: 56, from: FROM, to: TO, amount: 1n, contract: USDT_BSC })).rejects.toThrow(/anómalo/)
	})
})

describe('firma verificada', () => {
	const intent = { chainId: 56, from: FROM, to: TO, amount: 10n ** 15n, contract: null }
	const prepared = { intent, tx: { type: 'eip1559', chainId: 56, nonce: 0, to: TO, value: 10n ** 15n, data: '0x', gas: 21_000n, maxFeePerGas: gwei(4), maxPriorityFeePerGas: gwei(2) }, fee: { gasLimit: 21_000n, estimatedWei: 0n, maxWei: 0n, eip1559: true } }

	test('la tx firmada parsea a la intención y recupera nuestra dirección', async () => {
		const signed = await signEvmTransaction(prepared, derivePrivateKey(SEED, 'evm'))
		expect(signed.hash).toMatch(/^0x[0-9a-f]{64}$/)
		expect(parseTransaction(signed.raw)).toMatchObject({ chainId: 56, to: TO.toLowerCase(), value: 10n ** 15n })
		await expect(verifySignedEvmTransaction(signed.raw, prepared)).resolves.toBeUndefined()
	})

	test('una tx firmada por OTRA clave o con otro destino no pasa', async () => {
		const otherKey = new Uint8Array(32).fill(7)
		await expect(signEvmTransaction(prepared, otherKey)).rejects.toThrow(EvmVerifyError)
		const signed = await signEvmTransaction(prepared, derivePrivateKey(SEED, 'evm'))
		await expect(verifySignedEvmTransaction(signed.raw, { ...prepared, intent: { ...intent, to: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' } })).rejects.toThrow(/destino/)
		await expect(verifySignedEvmTransaction(signed.raw, { ...prepared, intent: { ...intent, amount: 1n } })).rejects.toThrow(/valor/)
	})
})

describe('broadcastEvmTransaction', () => {
	const signed = { raw: '0x02f8', hash: '0x' + 'ab'.repeat(32) }

	test('éxito, already known = duplicado, nonce too low con tx conocida = duplicado, fondos insuficientes = error', async () => {
		mockRpc({ eth_sendRawTransaction: () => signed.hash })
		await expect(broadcastEvmTransaction(RPC, signed)).resolves.toEqual({ hash: signed.hash, duplicate: false })

		mockRpc({ eth_sendRawTransaction: () => new Error('already known') })
		await expect(broadcastEvmTransaction(RPC, signed)).resolves.toEqual({ hash: signed.hash, duplicate: true })

		mockRpc({ eth_sendRawTransaction: () => new Error('nonce too low'), eth_getTransactionByHash: () => ({ hash: signed.hash }) })
		await expect(broadcastEvmTransaction(RPC, signed)).resolves.toEqual({ hash: signed.hash, duplicate: true })

		mockRpc({ eth_sendRawTransaction: () => new Error('insufficient funds for gas * price + value') })
		const err = await broadcastEvmTransaction(RPC, signed).catch(e => e)
		expect(err.message).toMatch(/insufficient funds/)
		expect(isRetryableRpcError(err)).toBe(false)
	})
})
