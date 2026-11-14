/**
 * @jest-environment node
 *
 * Swap TRX ↔ USDT por SunSwap V2. Las tres transacciones de abajo las construyó TronGrid
 * (10 oct 2026, sin firmar) a partir de la codificación de este módulo: la verificación
 * tiene que aceptarlas byte a byte y rechazar cualquier variación.
 */
import { keccak256, toBytes } from 'viem'

import {
	encodeApproveCall,
	encodeSwapCall,
	lastUintOfArray,
	prepareTronSwapStep,
	swapPath,
	tronTxStatus,
	verifyTronCall,
	SUNSWAP_V2_ROUTER,
	TRON_SWAP_FUNCTIONS,
	WTRX,
} from './swap'
import { tronToHex20 } from '../chains/tron'
import { bytesToHex, concatBytes, encodeBytesField, encodeVarintField, hexToBytes } from './protobuf'
import { decodeTronRaw, encodeDecodedTronRaw, tronTxId, TronVerifyError, TRON_TX_VALIDITY_MS } from './tx'

const VECTORS = {
	"owner": "TV6MuMXfmLbBqPZvBHdwFsDnQeVfnmiuSi",
	"approve": {
		"txID": "42727ccd92c1869dc242c22738792692602408cb8b60deda5792719160533f9d",
		"raw_data_hex": "0a029ef72208f1add0205bfb968440b8d499ca92345aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a1541d1c4bb7b2f39aba5707711719b2236b5b605af2e121541a614f803b6fd780986a42c78ec9c7f77e6ded13c2244095ea7b30000000000000000000000006e0617948fe030a7e4970f8389d4ad295f249b7e0000000000000000000000000000000000000000000000000000000001312d0070e49896ca923490018087a70e",
		"result": {
			"result": true
		}
	},
	"tokensForTrx": {
		"txID": "5fb563a5aa964c3221969ba92964b9c7c709b394dcf766d262522702f4edc046",
		"raw_data_hex": "0a029ef8220832bc4c372294eafd40f0eb99ca92345af002081f12eb020a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412b5020a1541d1c4bb7b2f39aba5707711719b2236b5b605af2e1215416e0617948fe030a7e4970f8389d4ad295f249b7e22840218cbafe50000000000000000000000000000000000000000000000000000000001312d00000000000000000000000000000000000000000000000000000000000392006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000d1c4bb7b2f39aba5707711719b2236b5b605af2e000000000000000000000000000000000000000000000000000000006acb2c200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c000000000000000000000000891cdb91d149f23b1a45d9c5ca78a88d0cb44c1870de9996ca923490018087a70e",
		"result": {
			"result": true
		}
	},
	"trxForTokens": {
		"txID": "862a6631eb6d74e5344bfc9948915e52e74542daea3da3e6f5a93d3795a9ce93",
		"raw_data_hex": "0a029ef8220832bc4c372294eafd40f0eb99ca92345ad502081f12d0020a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e7472616374129a020a1541d1c4bb7b2f39aba5707711719b2236b5b605af2e1215416e0617948fe030a7e4970f8389d4ad295f249b7e1880dac40922e4017ff36ab50000000000000000000000000000000000000000000000000000000000632ea00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000d1c4bb7b2f39aba5707711719b2236b5b605af2e000000000000000000000000000000000000000000000000000000006acb2c200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000891cdb91d149f23b1a45d9c5ca78a88d0cb44c18000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c70c39a96ca923490018087a70e",
		"result": {
			"result": true
		}
	}
}

const OWNER = VECTORS.owner
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const ATTACKER = 'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe'
const DEADLINE = 1791700000
const SELL_USDT = { owner: OWNER, inputToken: USDT, outputToken: null, amountIn: 20_000_000n, minOut: 59_000_000n }
const BUY_USDT = { owner: OWNER, inputToken: null, outputToken: USDT, amountIn: 20_000_000n, minOut: 6_400_000n }

// --- Lo que construiría un nodo que quiere colar OTRA llamada -------------------------
const addressBytes = (address) => hexToBytes(`41${tronToHex20(address)}`)
const TRIGGER_URL = Uint8Array.from('type.googleapis.com/protocol.TriggerSmartContract', ch => ch.charCodeAt(0))
/** Transaction.raw con un TriggerSmartContract cuyo contenido (`value`) se pasa tal cual. */
const triggerTx = (value, feeLimit = 30_000_000n) => {
	const raw_data_hex = bytesToHex(concatBytes(
		encodeBytesField(1, hexToBytes('9ef7')),
		encodeBytesField(4, hexToBytes('f1add0205bfb9684')),
		encodeVarintField(8, 1791700060000n),
		encodeBytesField(11, concatBytes(encodeVarintField(1, 31n), encodeBytesField(2, concatBytes(encodeBytesField(1, TRIGGER_URL), encodeBytesField(2, value))))),
		encodeVarintField(14, 1791700000000n),
		encodeVarintField(18, feeLimit),
	))
	return { txID: tronTxId(raw_data_hex), raw_data_hex }
}
const approveData = (spender, amount) => hexToBytes('095ea7b3' + encodeApproveCall(spender, amount))
const approveValue = (...extra) => concatBytes(encodeBytesField(1, addressBytes(OWNER)), encodeBytesField(2, addressBytes(USDT)), encodeBytesField(4, approveData(SUNSWAP_V2_ROUTER, 20_000_000n)), ...extra)
const APPROVE_EXPECTED = { owner: OWNER, contract: USDT, callValue: 0n, data: '095ea7b3' + encodeApproveCall(SUNSWAP_V2_ROUTER, 20_000_000n), feeLimitSun: 30_000_000n }
const UNLIMITED = 2n ** 256n - 1n

describe('ABI', () => {

	test('los selectores son los keccak de sus firmas', () => {
		for (const { signature, selector } of Object.values(TRON_SWAP_FUNCTIONS)) {
			expect(keccak256(toBytes(signature)).slice(2, 10)).toBe(selector)
		}
	})

	test('TRX viaja como WTRX en la ruta', () => {
		expect(swapPath(SELL_USDT)).toEqual([USDT, WTRX])
		expect(swapPath(BUY_USDT)).toEqual([WTRX, USDT])
	})

	test('getAmountsOut: se lee el último elemento', () => {
		const word = (n) => BigInt(n).toString(16).padStart(64, '0')
		expect(lastUintOfArray(word(0x20) + word(2) + word(20_000_000) + word(60_220_055))).toBe(60_220_055n)
	})
})

describe('verificación contra transacciones reales del nodo', () => {

	const expectSwap = (intent, min, name) => {
		const call = encodeSwapCall(intent, min, DEADLINE)
		return { owner: OWNER, contract: SUNSWAP_V2_ROUTER, callValue: call.callValue, data: TRON_SWAP_FUNCTIONS[call.fn].selector + call.parameter, feeLimitSun: 30_000_000n, name }
	}

	test('el approve EXACTO al router pasa', () => {
		const raw = verifyTronCall(VECTORS.approve, { owner: OWNER, contract: USDT, callValue: 0n, data: '095ea7b3' + encodeApproveCall(SUNSWAP_V2_ROUTER, 20_000_000n), feeLimitSun: 30_000_000n })
		expect(raw.contracts).toHaveLength(1)
	})

	test('vender USDT por TRX y comprar USDT con TRX pasan, con el receptor = el usuario', () => {
		verifyTronCall(VECTORS.tokensForTrx, expectSwap(SELL_USDT, 59_900_000n))
		verifyTronCall(VECTORS.trxForTokens, expectSwap(BUY_USDT, 6_500_000n))
	})

	test('otro receptor, otro mínimo u otro importe no pasan', () => {
		expect(() => verifyTronCall(VECTORS.tokensForTrx, expectSwap({ ...SELL_USDT, owner: ATTACKER }, 59_900_000n))).toThrow(/owner distinto|calldata/)
		expect(() => verifyTronCall(VECTORS.tokensForTrx, expectSwap(SELL_USDT, 59_900_001n))).toThrow(/calldata/)
		expect(() => verifyTronCall(VECTORS.trxForTokens, expectSwap({ ...BUY_USDT, amountIn: 20_000_001n }, 6_500_000n))).toThrow(/call_value/)
	})

	test('un approve a otro spender o un contrato distinto no pasan', () => {
		expect(() => verifyTronCall(VECTORS.approve, { owner: OWNER, contract: USDT, callValue: 0n, data: '095ea7b3' + encodeApproveCall(ATTACKER, 20_000_000n), feeLimitSun: 30_000_000n })).toThrow(/calldata/)
		expect(() => verifyTronCall(VECTORS.approve, { owner: OWNER, contract: SUNSWAP_V2_ROUTER, callValue: 0n, data: '095ea7b3' + encodeApproveCall(SUNSWAP_V2_ROUTER, 20_000_000n), feeLimitSun: 30_000_000n })).toThrow(/contrato distinto/)
	})

	test('un fee_limit por encima de lo autorizado no pasa', () => {
		expect(() => verifyTronCall(VECTORS.approve, { owner: OWNER, contract: USDT, callValue: 0n, data: '095ea7b3' + encodeApproveCall(SUNSWAP_V2_ROUTER, 20_000_000n), feeLimitSun: 29_999_999n })).toThrow(/fee_limit/)
	})

	test('un txID que no es el hash del raw no pasa', () => {
		expect(() => verifyTronCall({ ...VECTORS.approve, txID: '00'.repeat(32) }, { owner: OWNER, contract: USDT, callValue: 0n, data: '', feeLimitSun: 1n })).toThrow(/txID/)
	})

	test('las tres de TronGrid son canónicas: decodificar y volver a codificar da los mismos bytes', () => {
		for (const name of ['approve', 'tokensForTrx', 'trxForTokens']) {
			expect(bytesToHex(encodeDecodedTronRaw(decodeTronRaw(VECTORS[name].raw_data_hex)))).toBe(VECTORS[name].raw_data_hex)
		}
	})
})

describe('un nodo no puede esconder otra llamada detrás de la buena', () => {
	// protobuf estándar (java-tron) ejecuta el ÚLTIMO valor de un campo singular repetido

	test('control: el approve exacto, sin nada colado, pasa', () => {
		expect(() => verifyTronCall(triggerTx(approveValue()), APPROVE_EXPECTED)).not.toThrow()
	})

	test('approve al router seguido de un approve ILIMITADO al atacante no pasa', () => {
		const tx = triggerTx(approveValue(encodeBytesField(4, approveData(ATTACKER, UNLIMITED))))
		expect(() => verifyTronCall(tx, APPROVE_EXPECTED)).toThrow(TronVerifyError)
		expect(() => verifyTronCall(tx, APPROVE_EXPECTED)).toThrow(/campo 4 repetido/)
	})

	test('otro contrato escondido detrás del token, o un TRC-10 adjunto a la llamada, tampoco', () => {
		expect(() => verifyTronCall(triggerTx(approveValue(encodeBytesField(2, addressBytes(ATTACKER)))), APPROVE_EXPECTED)).toThrow(/campo 2 repetido/)
		// call_token_value + token_id: la llamada se llevaría además un TRC-10 del usuario
		expect(() => verifyTronCall(triggerTx(approveValue(encodeVarintField(5, 1_000_000n), encodeVarintField(6, 1002000n))), APPROVE_EXPECTED)).toThrow(/campo 5, que no se admite/)
	})

	test('comprar con TRX: un segundo call_value detrás del pedido no pasa', () => {
		const call = encodeSwapCall(BUY_USDT, 6_500_000n, DEADLINE)
		const data = hexToBytes(TRON_SWAP_FUNCTIONS[call.fn].selector + call.parameter)
		const value = (...extra) => concatBytes(encodeBytesField(1, addressBytes(OWNER)), encodeBytesField(2, addressBytes(SUNSWAP_V2_ROUTER)), encodeVarintField(3, call.callValue), encodeBytesField(4, data), ...extra)
		const expected = { owner: OWNER, contract: SUNSWAP_V2_ROUTER, callValue: call.callValue, data: TRON_SWAP_FUNCTIONS[call.fn].selector + call.parameter, feeLimitSun: 30_000_000n }
		expect(() => verifyTronCall(triggerTx(value()), expected)).not.toThrow()
		expect(() => verifyTronCall(triggerTx(value(encodeVarintField(3, 999_000_000_000n))), expected)).toThrow(/campo 3 repetido/)
	})
})

describe('preparar contra un nodo simulado', () => {

	const word = (n) => BigInt(n).toString(16).padStart(64, '0')
	const mockNode = ({ allowance = 0n, quoted = 60_201_006n, revert = false, tx, energy = 240_000 } = {}) => {
		const calls = []
		global.fetch = jest.fn(async (url, init) => {
			const path = new URL(url).pathname
			const body = JSON.parse(init.body)
			calls.push({ path, body })
			const reply = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) })
			if (path === '/wallet/getchainparameters') return reply({ chainParameter: [{ key: 'getEnergyFee', value: 100 }, { key: 'getTransactionFee', value: 1000 }] })
			if (path === '/wallet/getaccountresource') return reply({ freeNetLimit: 600, freeNetUsed: 0 })
			if (path === '/wallet/triggerconstantcontract') {
				if (body.function_selector.startsWith('allowance')) return reply({ result: { result: true }, constant_result: [word(allowance)] })
				if (body.function_selector.startsWith('getAmountsOut')) return reply({ result: { result: true }, constant_result: [word(0x20) + word(2) + word(20_000_000) + word(quoted)] })
				return revert ? reply({ result: { result: false, message: '5452414e534645525f4641494c4544' } }) : reply({ result: { result: true }, energy_used: energy })
			}
			if (path === '/wallet/triggersmartcontract') return reply({ result: { result: true }, transaction: tx })
			if (path === '/wallet/gettransactioninfobyid') return reply(body.value === 'ok' ? { id: 'ok', receipt: { result: 'SUCCESS' } } : body.value === 'bad' ? { id: 'bad', receipt: { result: 'REVERT' } } : {})
			throw new Error('ruta inesperada ' + path)
		})
		return calls
	}
	afterEach(() => { delete global.fetch })
	const RPC = { url: 'https://tron.test', priority: 0 }
	const now = () => (DEADLINE - 600) * 1000

	// 240k de energía × 1,3 × 100 sun = 31,2 TRX de fee_limit: autoriza los 30 con que se construyeron los vectores
	test('sin permiso, el primer paso es el approve EXACTO al router', async () => {
		mockNode({ allowance: 0n, tx: VECTORS.approve })
		const prepared = await prepareTronSwapStep(RPC, SELL_USDT, { now })
		expect(prepared.step).toBe('approve')
		expect(prepared.remaining).toBe(1)
		expect(prepared.fee.energyNeeded).toBe(240_000n)
	})

	test('la vigencia se cuenta en el reloj del teléfono: uno adelantado no ve la tx caducada', async () => {
		// `expiration` es hora de la CADENA; este teléfono va una hora por delante de ella
		const phone = Number(decodeTronRaw(VECTORS.approve.raw_data_hex).expiration) + 3_600_000
		mockNode({ allowance: 0n, tx: VECTORS.approve })
		const prepared = await prepareTronSwapStep(RPC, SELL_USDT, { now: () => phone })
		expect(prepared.expiresAt).toBe(phone + TRON_TX_VALIDITY_MS)
	})

	test('con permiso: el mínimo de la tx es getAmountsOut − 0,5%, y el nodo devolvió exactamente eso', async () => {
		const calls = mockNode({ allowance: 20_000_000n, tx: VECTORS.tokensForTrx })
		const prepared = await prepareTronSwapStep(RPC, SELL_USDT, { now })
		expect(prepared.step).toBe('swap')
		expect(prepared.quotedOut).toBe(60_201_006n)
		expect(prepared.amountOutMin).toBe(59_900_000n)
		const build = calls.find(c => c.path === '/wallet/triggersmartcontract')
		expect(build.body.contract_address).toBe(SUNSWAP_V2_ROUTER)
	})

	test('si el nodo devuelve OTRA tx (otro mínimo), no pasa', async () => {
		mockNode({ allowance: 20_000_000n, quoted: 60_301_006n, tx: VECTORS.tokensForTrx })
		await expect(prepareTronSwapStep(RPC, SELL_USDT, { now })).rejects.toThrow(/calldata/)
	})

	test('si el nodo esconde un approve ilimitado al atacante detrás del exacto, el paso no se prepara', async () => {
		mockNode({ allowance: 0n, tx: triggerTx(approveValue(encodeBytesField(4, approveData(ATTACKER, UNLIMITED)))) })
		await expect(prepareTronSwapStep(RPC, SELL_USDT, { now })).rejects.toThrow(TronVerifyError)
		// Y el mismo approve sin nada colado sí
		mockNode({ allowance: 0n, tx: triggerTx(approveValue()) })
		await expect(prepareTronSwapStep(RPC, SELL_USDT, { now })).resolves.toMatchObject({ step: 'approve' })
	})

	test('un fee_limit más alto de lo que la simulación autoriza no pasa', async () => {
		mockNode({ allowance: 0n, tx: VECTORS.approve, energy: 120_000 })
		await expect(prepareTronSwapStep(RPC, SELL_USDT, { now })).rejects.toThrow(/fee_limit/)
	})

	test('si el precio empeoró por debajo del mínimo enseñado, no se construye nada', async () => {
		const calls = mockNode({ allowance: 20_000_000n, quoted: 59_000_000n })
		await expect(prepareTronSwapStep(RPC, SELL_USDT, { now })).rejects.toThrow(/precio empeoró/)
		expect(calls.some(c => c.path === '/wallet/triggersmartcontract')).toBe(false)
	})

	test('si la simulación revierte, no se construye nada', async () => {
		const calls = mockNode({ allowance: 20_000_000n, revert: true })
		await expect(prepareTronSwapStep(RPC, SELL_USDT, { now })).rejects.toThrow(/revierte/)
		expect(calls.some(c => c.path === '/wallet/triggersmartcontract')).toBe(false)
	})

	test('estado de la tx: entró bien, revirtió o aún no', async () => {
		mockNode()
		expect(await tronTxStatus(RPC, 'ok')).toBe(true)
		expect(await tronTxStatus(RPC, 'bad')).toBe(false)
		expect(await tronTxStatus(RPC, 'nada')).toBe(null)
	})
})
