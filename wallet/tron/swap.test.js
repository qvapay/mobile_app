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
