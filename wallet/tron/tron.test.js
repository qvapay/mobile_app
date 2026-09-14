/**
 * @jest-environment node
 *
 * Enviar en TRON contra un fixture REAL: el depósito de 1 USDT TRC-20 que
 * aceptó la red el 2026-09-12 (txID 59a57a6e…). Si el decodificador, el
 * recálculo del txID o la convención de firma se desviaran de java-tron,
 * esto falla antes de que ninguna tx real se rechace.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import bs58 from 'bs58'

import { decodeFields, encodeBytesField, encodeVarint, encodeVarintField, hexToBytes, bytesToHex } from './protobuf'
import {
	broadcastTronTransaction,
	computeFeeLimit,
	computeTronBurn,
	decodeTronRaw,
	encodeSignedTronTransaction,
	encodeTrc20TransferParams,
	isValidTronAddress,
	MAX_FEE_LIMIT_SUN,
	prepareTronSend,
	signTronTransaction,
	tronTxId,
	TRON_TX_RPC,
	TronVerifyError,
	verifyTronTransaction,
} from './tx'
import { parseUnits } from '../chains/units'
import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import { isRetryableRpcError } from '../registry/rpcRouter'

const FIXTURE = {
	txID: '59a57a6ece659c6792ca63ce568886c1b876823a08e464b1998badf0f4f9a97f',
	raw_data_hex: '0a024db522089341d33e550cdeef4098f68ac789345aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a15413650a7fc3fd9c32a46913cf76b4b157ce6efc625121541a614f803b6fd780986a42c78ec9c7f77e6ded13c2244a9059cbb000000000000000000000000e4fa48a8512b9c332177674bb83d74e01265102800000000000000000000000000000000000000000000000000000000000f424070d5a587c7893490018084af5f',
	signature: '70ff8f852e7a05431a929cb05def3974b4a1775d214a103e70b3954c9f9efce668ccf3d6fbfeeedfed43602c49bd963d20767d7b7229b1301f2d9361cd2abd911b',
	from: 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy',
	to: 'TWqvtpZkwfpbjujqJtzLsVx5bm79wFDJTg',
	usdt: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
}
const INTENT = { from: FIXTURE.from, to: FIXTURE.to, amount: 1_000_000n, contract: FIXTURE.usdt }
const RPC = { url: 'https://api.trongrid.io', priority: 10, owner: 'trongrid' }
const asciiBytes = (text) => Uint8Array.from(text, ch => ch.charCodeAt(0))
const asciiHex = (text) => bytesToHex(asciiBytes(text))
const PARAMS = { energyFeeSun: 100n, bandwidthFeeSun: 1000n, createAccountFeeSun: 1_000_000n }

const tronAddressFromPubkey = (pub) => {
	const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false)
	const payload = new Uint8Array(21)
	payload[0] = 0x41
	payload.set(keccak_256(uncompressed.slice(1)).slice(-20), 1)
	const full = new Uint8Array(25)
	full.set(payload)
	full.set(sha256(sha256(payload)).slice(0, 4), 21)
	return bs58.encode(full)
}

/** Recupera el firmante de r‖s‖(27+rec) como haría java-tron. */
const recoverSigner = (rawHex, signatureHex) => {
	const sig = hexToBytes(signatureHex)
	const recovered = new Uint8Array(65)
	recovered[0] = sig[64] - 27
	recovered.set(sig.slice(0, 64), 1)
	return tronAddressFromPubkey(secp256k1.recoverPublicKey(recovered, hexToBytes(tronTxId(rawHex)), { prehash: false }))
}

describe('protobuf mínimo', () => {
	test('varint round-trip y campos', () => {
		for (const v of [0n, 1n, 127n, 128n, 300n, 200_000_000n, 1789271391000n]) {
			expect(decodeFields(encodeVarintField(18, v))[0]).toMatchObject({ field: 18, varint: v })
		}
		expect(bytesToHex(encodeVarint(300))).toBe('ac02')
		const msg = encodeBytesField(1, hexToBytes('4db5'))
		expect(bytesToHex(msg)).toBe('0a024db5')
		expect(() => decodeFields(hexToBytes('0a05aa'))).toThrow(/truncado/)
	})
})

describe('decodeTronRaw + txID', () => {
	test('decodifica el fixture real campo a campo', () => {
		const raw = decodeTronRaw(FIXTURE.raw_data_hex)
		expect(raw).toMatchObject({ refBlockBytes: '4db5', refBlockHash: '9341d33e550cdeef', expiration: 1789271391000n, timestamp: 1789271331541n, feeLimit: 200_000_000n })
		expect(raw.contracts).toHaveLength(1)
		expect(raw.contracts[0]).toMatchObject({
			type: 'TriggerSmartContract',
			owner: '3650a7fc3fd9c32a46913cf76b4b157ce6efc625',
			contract: 'a614f803b6fd780986a42c78ec9c7f77e6ded13c',
			callValue: 0n,
			data: 'a9059cbb' + encodeTrc20TransferParams(FIXTURE.to, 1_000_000n),
		})
	})

	test('txID = sha256(raw_data)', () => {
		expect(tronTxId(FIXTURE.raw_data_hex)).toBe(FIXTURE.txID)
	})
})

describe('verifyTronTransaction', () => {
	test('acepta la tx del fixture con la intención exacta', () => {
		expect(() => verifyTronTransaction(FIXTURE, INTENT, 200_000_000n)).not.toThrow()
	})

	test('rechaza destino, cantidad, contrato, owner, txID y fee_limit distintos', () => {
		expect(() => verifyTronTransaction(FIXTURE, { ...INTENT, to: FIXTURE.from }, 200_000_000n)).toThrow(TronVerifyError)
		expect(() => verifyTronTransaction(FIXTURE, { ...INTENT, amount: 999_999n }, 200_000_000n)).toThrow(/calldata/)
		expect(() => verifyTronTransaction(FIXTURE, { ...INTENT, contract: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8' }, 200_000_000n)).toThrow(/contrato/)
		expect(() => verifyTronTransaction(FIXTURE, { ...INTENT, from: FIXTURE.to }, 200_000_000n)).toThrow(/owner/)
		expect(() => verifyTronTransaction({ ...FIXTURE, txID: 'ab'.repeat(32) }, INTENT, 200_000_000n)).toThrow(/txID/)
		expect(() => verifyTronTransaction(FIXTURE, INTENT, 100_000_000n)).toThrow(/fee_limit/)
		// Una TRC-20 jamás pasa por TRX nativo ni al revés
		expect(() => verifyTronTransaction(FIXTURE, { ...INTENT, contract: null }, 0n)).toThrow(/TransferContract/)
	})
})

describe('firma', () => {
	test('la firma real del fixture recupera al owner (convención r‖s‖27+rec verificada)', () => {
		expect(recoverSigner(FIXTURE.raw_data_hex, FIXTURE.signature)).toBe(FIXTURE.from)
	})

	test('signTronTransaction produce una firma que java-tron atribuiría a nuestra dirección', () => {
		const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
		const signature = signTronTransaction(FIXTURE.raw_data_hex, derivePrivateKey(seed, 'tron'))
		expect(signature).toHaveLength(130)
		expect([27, 28]).toContain(parseInt(signature.slice(128), 16))
		expect(recoverSigner(FIXTURE.raw_data_hex, signature)).toBe(deriveAddresses(seed).tron)
	})

	test('la envoltura Transaction{raw, signature} se decodifica a los mismos bytes', () => {
		const wrapped = decodeFields(hexToBytes(encodeSignedTronTransaction(FIXTURE.raw_data_hex, FIXTURE.signature)))
		expect(bytesToHex(wrapped[0].bytes)).toBe(FIXTURE.raw_data_hex)
		expect(bytesToHex(wrapped[1].bytes)).toBe(FIXTURE.signature)
	})
})

describe('fees', () => {
	test('computeTronBurn: energía y ancho de banda solo si faltan; activación de cuenta', () => {
		const need = { energyNeeded: 65_000n, bandwidthNeeded: 345n, activatesAccount: false }
		expect(computeTronBurn(need, { freeBandwidth: 600n, stakedBandwidth: 0n, energy: 0n }, PARAMS)).toBe(6_500_000n)
		expect(computeTronBurn(need, { freeBandwidth: 0n, stakedBandwidth: 0n, energy: 100_000n }, PARAMS)).toBe(345_000n)
		expect(computeTronBurn(need, { freeBandwidth: 100n, stakedBandwidth: 1000n, energy: 65_000n }, PARAMS)).toBe(0n)
		expect(computeTronBurn({ ...need, energyNeeded: 0n, activatesAccount: true }, { freeBandwidth: 600n, stakedBandwidth: 0n, energy: 0n }, PARAMS)).toBe(1_000_000n)
	})

	test('computeFeeLimit: +30% con suelo de 5 TRX y tope de 100 TRX', () => {
		expect(computeFeeLimit(65_000n, PARAMS)).toBe(8_450_000n)
		expect(computeFeeLimit(1_000n, PARAMS)).toBe(5_000_000n)
		expect(computeFeeLimit(10_000_000n, PARAMS)).toBe(MAX_FEE_LIMIT_SUN)
	})
})

describe('helpers', () => {
	test('isValidTronAddress', () => {
		expect(isValidTronAddress(FIXTURE.to)).toBe(true)
		expect(isValidTronAddress('TWqvtpZkwfpbjujqJtzLsVx5bm79wFDJTh')).toBe(false)
		expect(isValidTronAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false)
		expect(isValidTronAddress('')).toBe(false)
	})

	test('parseUnits', () => {
		expect(parseUnits('1', 6)).toBe(1_000_000n)
		expect(parseUnits('0.5', 6)).toBe(500_000n)
		expect(parseUnits(' 12,5 ', 6)).toBe(12_500_000n)
		expect(parseUnits('1.000000', 6)).toBe(1_000_000n)
		expect(() => parseUnits('1.0000001', 6)).toThrow(/decimales/)
		expect(() => parseUnits('abc', 6)).toThrow()
		expect(() => parseUnits('-1', 6)).toThrow()
		expect(() => parseUnits('', 6)).toThrow()
	})

	test('TRON_TX_RPC descarta la capa jsonrpc', () => {
		expect(TRON_TX_RPC(RPC)).toBe(true)
		expect(TRON_TX_RPC({ ...RPC, api: 'jsonrpc' })).toBe(false)
	})
})

describe('prepareTronSend / broadcast (nodo simulado)', () => {
	let calls
	const mockNode = (handlers) => {
		calls = []
		global.fetch = jest.fn(async (url, init) => {
			const path = new URL(url).pathname
			const body = JSON.parse(init.body)
			calls.push({ path, body })
			const handler = handlers[path]
			if (!handler) return { ok: false, status: 404, json: async () => ({}) }
			const res = handler(body)
			return { ok: true, status: 200, json: async () => res }
		})
	}
	afterEach(() => { delete global.fetch })

	/** Re-codifica el raw del fixture con otro fee_limit (campo 18): lo que devolvería un nodo honesto a nuestra petición. */
	const withFeeLimit = (rawHex, feeLimit) => bytesToHex(new Uint8Array(decodeFields(hexToBytes(rawHex)).flatMap(f => {
		if (f.field === 18) return [...encodeVarintField(18, feeLimit)]
		return f.bytes ? [...encodeBytesField(f.field, f.bytes)] : [...encodeVarintField(f.field, f.varint)]
	})))

	const chainParams = () => ({ chainParameter: [{ key: 'getEnergyFee', value: 100 }, { key: 'getTransactionFee', value: 1000 }, { key: 'getCreateNewAccountFeeInSystemContract', value: 1000000 }] })

	test('TRC-20: estima, construye, verifica y calcula la quema', async () => {
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({ freeNetLimit: 600, freeNetUsed: 0 }),
			'/wallet/triggerconstantcontract': () => ({ result: { result: true }, energy_used: 64_285 }),
			'/wallet/triggersmartcontract': (body) => {
				// Lo que un nodo honesto devolvería: el fixture es exactamente esta intención
				expect(body).toMatchObject({ owner_address: FIXTURE.from, contract_address: FIXTURE.usdt, function_selector: 'transfer(address,uint256)', parameter: encodeTrc20TransferParams(FIXTURE.to, 1_000_000n), visible: true })
				const raw_data_hex = withFeeLimit(FIXTURE.raw_data_hex, BigInt(body.fee_limit))
				return { result: { result: true }, transaction: { txID: tronTxId(raw_data_hex), raw_data_hex } }
			},
		})
		const prepared = await prepareTronSend(RPC, INTENT)
		expect(prepared.fee.energyNeeded).toBe(64_285n)
		// fee_limit = ⌊64285·1,3⌋·100 = 8.357.000 sun (bigint trunca), y el raw verificado lo lleva
		expect(prepared.fee.feeLimitSun).toBe(8_357_000n)
		expect(prepared.raw.feeLimit).toBe(8_357_000n)
		expect(prepared.fee.burnSun).toBe(6_428_500n)
		expect(prepared.fee.bandwidthNeeded).toBe(BigInt(FIXTURE.raw_data_hex.length / 2) + 69n)
		expect(prepared.raw.contracts[0].type).toBe('TriggerSmartContract')
	}, 10_000)

	test('TRC-20: un nodo que devuelve OTRA tx (o un fee_limit inflado) no pasa la verificación', async () => {
		const honest = (body) => { const raw_data_hex = withFeeLimit(FIXTURE.raw_data_hex, BigInt(body.fee_limit)); return { result: { result: true }, transaction: { txID: tronTxId(raw_data_hex), raw_data_hex } } }
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({}),
			'/wallet/triggerconstantcontract': () => ({ result: { result: true }, energy_used: 64_285 }),
			'/wallet/triggersmartcontract': honest,
		})
		// La tx del nodo es de 1 USDT; pedimos 2 → calldata distinta
		await expect(prepareTronSend(RPC, { ...INTENT, amount: 2_000_000n })).rejects.toThrow(TronVerifyError)
		// Nodo que ignora nuestro fee_limit y mete 200 TRX (el fixture original)
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({}),
			'/wallet/triggerconstantcontract': () => ({ result: { result: true }, energy_used: 64_285 }),
			'/wallet/triggersmartcontract': () => ({ result: { result: true }, transaction: { txID: FIXTURE.txID, raw_data_hex: FIXTURE.raw_data_hex } }),
		})
		await expect(prepareTronSend(RPC, INTENT)).rejects.toThrow(/fee_limit/)
	})

	test('TRC-20: el nodo rechaza la estimación con mensaje en hex → error no reintentable legible', async () => {
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({}),
			'/wallet/triggerconstantcontract': () => ({ result: { result: false, message: asciiHex('REVERT opcode executed') } }),
		})
		const err = await prepareTronSend(RPC, INTENT).catch(e => e)
		expect(err.message).toMatch(/REVERT opcode executed/)
		expect(isRetryableRpcError(err)).toBe(false)
	})

	test('TRX nativo: createtransaction verificado + activación de cuenta nueva', async () => {
		const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
		const from = deriveAddresses(seed).tron
		const to = FIXTURE.to
		// raw mínimo construido a mano: TransferContract(owner, to, amount)
		const addr = (a) => hexToBytes('41' + require('../chains/tron').tronToHex20(a))
		const value = new Uint8Array([...encodeBytesField(1, addr(from)), ...encodeBytesField(2, addr(to)), ...encodeVarintField(3, 5_000_000n)])
		const any = new Uint8Array([...encodeBytesField(1, asciiBytes('type.googleapis.com/protocol.TransferContract')), ...encodeBytesField(2, value)])
		const contract = new Uint8Array([...encodeVarintField(1, 1n), ...encodeBytesField(2, any)])
		const rawHex = bytesToHex(new Uint8Array([...encodeBytesField(1, hexToBytes('4db5')), ...encodeBytesField(4, hexToBytes('9341d33e550cdeef')), ...encodeVarintField(8, 1789271391000n), ...encodeBytesField(11, contract), ...encodeVarintField(14, 1789271331541n)]))
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({ freeNetLimit: 600, freeNetUsed: 600 }),
			'/wallet/getaccount': () => ({}),
			'/wallet/createtransaction': () => ({ txID: tronTxId(rawHex), raw_data_hex: rawHex }),
		})
		const prepared = await prepareTronSend(RPC, { from, to, amount: 5_000_000n, contract: null })
		expect(prepared.raw.contracts[0]).toMatchObject({ type: 'TransferContract', amount: 5_000_000n })
		expect(prepared.fee.activatesAccount).toBe(true)
		// sin ancho de banda libre: bytes*1000 + 1 TRX de activación
		expect(prepared.fee.burnSun).toBe((BigInt(rawHex.length / 2) + 69n) * 1000n + 1_000_000n)
		expect(prepared.fee.feeLimitSun).toBe(0n)
	})

	test('broadcast: éxito, duplicado = éxito, rechazo legible, SERVER_BUSY rota', async () => {
		mockNode({ '/wallet/broadcasthex': () => ({ result: true, txid: FIXTURE.txID }) })
		await expect(broadcastTronTransaction(RPC, FIXTURE.raw_data_hex, FIXTURE.signature)).resolves.toEqual({ txid: FIXTURE.txID, duplicate: false })
		expect(calls[0].body.transaction).toBe(encodeSignedTronTransaction(FIXTURE.raw_data_hex, FIXTURE.signature))

		mockNode({ '/wallet/broadcasthex': () => ({ result: false, code: 'DUP_TRANSACTION_ERROR', message: '' }) })
		await expect(broadcastTronTransaction(RPC, FIXTURE.raw_data_hex, FIXTURE.signature)).resolves.toEqual({ txid: FIXTURE.txID, duplicate: true })

		mockNode({ '/wallet/broadcasthex': () => ({ result: false, code: 'SIGERROR', message: asciiHex('validate signature error') }) })
		const rejected = await broadcastTronTransaction(RPC, FIXTURE.raw_data_hex, FIXTURE.signature).catch(e => e)
		expect(rejected.message).toMatch(/SIGERROR.*validate signature error/)
		expect(isRetryableRpcError(rejected)).toBe(false)

		mockNode({ '/wallet/broadcasthex': () => ({ result: false, code: 'SERVER_BUSY', message: '' }) })
		const busy = await broadcastTronTransaction(RPC, FIXTURE.raw_data_hex, FIXTURE.signature).catch(e => e)
		expect(isRetryableRpcError(busy)).toBe(true)
	})
})
