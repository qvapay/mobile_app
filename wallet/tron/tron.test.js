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

import { bytesOf, concatBytes, decodeExact, decodeFields, encodeBytesField, encodeVarint, encodeVarintField, hexToBytes, bytesToHex, varintOf } from './protobuf'
import {
	broadcastTronTransaction,
	computeFeeLimit,
	computeTronBurn,
	computeTronBurnBreakdown,
	decodeTronRaw,
	encodeDecodedTronRaw,
	encodeSignedTronTransaction,
	encodeTrc20TransferParams,
	isValidTronAddress,
	MAX_FEE_LIMIT_SUN,
	prepareTronSend,
	signTronTransaction,
	tronTxId,
	TRON_TX_RPC,
	TRON_TX_VALIDITY_MS,
	TronVerifyError,
	verifyTronTransaction,
} from './tx'
import { tronToHex20 } from '../chains/tron'
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

// --- Lo que se firma no admite una segunda lectura ------------------------------------
//
// El contrato viaja como bytes opacos (`Any.value`): el hash que se firma los cubre tal
// cual, y protobuf estándar (el de java-tron) ejecuta el ÚLTIMO valor de un campo singular
// repetido. Un nodo que mande `{destino: Bob, …, destino: atacante}` no puede pasar por
// «a Bob». Estos raws son los que construiría ese nodo.

const BOB = FIXTURE.to
const ATTACKER = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
const addressBytes = (address) => hexToBytes(`41${tronToHex20(address)}`)
const typeUrl = (name) => asciiBytes(`type.googleapis.com/protocol.${name}`)

/** Transaction.Contract { 1 tipo · 2 Any { 1 type_url · 2 valor } } más lo que se quiera colar. */
const contractOf = (code, name, value, { anyExtra = [], contractExtra = [] } = {}) => concatBytes(
	encodeVarintField(1, code),
	encodeBytesField(2, concatBytes(encodeBytesField(1, typeUrl(name)), encodeBytesField(2, value), ...anyExtra)),
	...contractExtra,
)

/** Transaction.raw con los campos del fixture alrededor del contrato. `between`/`after` cuelan campos en el raw. */
const rawHexOf = (contract, { feeLimit = 0n, between = [], after = [] } = {}) => bytesToHex(concatBytes(
	encodeBytesField(1, hexToBytes('4db5')),
	encodeBytesField(4, hexToBytes('9341d33e550cdeef')),
	encodeVarintField(8, 1789271391000n),
	...between,
	encodeBytesField(11, contract),
	encodeVarintField(14, 1789271331541n),
	...(feeLimit ? [encodeVarintField(18, feeLimit)] : []),
	...after,
))
const txOf = (raw_data_hex) => ({ txID: tronTxId(raw_data_hex), raw_data_hex })

const TRX_INTENT = { from: FIXTURE.from, to: BOB, amount: 1_000_000n, contract: null }
const transferValue = (...extra) => concatBytes(encodeBytesField(1, addressBytes(FIXTURE.from)), encodeBytesField(2, addressBytes(BOB)), encodeVarintField(3, 1_000_000n), ...extra)
const transferTx = (...extra) => txOf(rawHexOf(contractOf(1n, 'TransferContract', transferValue(...extra))))

const GOOD_DATA = hexToBytes('a9059cbb' + encodeTrc20TransferParams(BOB, 1_000_000n))
const EVIL_DATA = hexToBytes('a9059cbb' + encodeTrc20TransferParams(ATTACKER, 5_000_000_000_000n))
const triggerValue = (...extra) => concatBytes(encodeBytesField(1, addressBytes(FIXTURE.from)), encodeBytesField(2, addressBytes(FIXTURE.usdt)), encodeBytesField(4, GOOD_DATA), ...extra)
const triggerTx = (value, options) => txOf(rawHexOf(contractOf(31n, 'TriggerSmartContract', value, options), { feeLimit: 30_000_000n }))
const verifyTrc20 = (tx) => verifyTronTransaction(tx, INTENT, 30_000_000n)

describe('decodificación estricta: un campo repetido, de más o mal codificado no se firma', () => {

	test('los raws de control (sin nada raro) pasan: el rechazo de abajo es por lo que se cuela', () => {
		expect(() => verifyTronTransaction(transferTx(), TRX_INTENT, 0n)).not.toThrow()
		expect(() => verifyTrc20(triggerTx(triggerValue()))).not.toThrow()
	})

	test('TRX: «1 TRX a Bob» seguido de «todo al atacante» (gana el último en la red) no pasa', () => {
		const tx = transferTx(encodeBytesField(2, addressBytes(ATTACKER)), encodeVarintField(3, 999_000_000_000n))
		expect(() => verifyTronTransaction(tx, TRX_INTENT, 0n)).toThrow(TronVerifyError)
		expect(() => verifyTronTransaction(tx, TRX_INTENT, 0n)).toThrow(/campo 2 repetido/)
		// Tampoco con solo el importe repetido
		expect(() => verifyTronTransaction(transferTx(encodeVarintField(3, 999_000_000_000n)), TRX_INTENT, 0n)).toThrow(/campo 3 repetido/)
	})

	test('TRC-20: una segunda calldata o un segundo contrato detrás de los buenos no pasan', () => {
		expect(() => verifyTrc20(triggerTx(triggerValue(encodeBytesField(4, EVIL_DATA))))).toThrow(/campo 4 repetido/)
		expect(() => verifyTrc20(triggerTx(triggerValue(encodeBytesField(2, addressBytes(ATTACKER)))))).toThrow(/campo 2 repetido/)
		expect(() => verifyTrc20(triggerTx(triggerValue(encodeBytesField(1, addressBytes(ATTACKER)))))).toThrow(/campo 1 repetido/)
	})

	test('repetidos en los niveles de fuera (Any, Contract, raw) tampoco', () => {
		const evilValue = concatBytes(encodeBytesField(1, addressBytes(FIXTURE.from)), encodeBytesField(2, addressBytes(FIXTURE.usdt)), encodeBytesField(4, EVIL_DATA))
		// Un segundo `value` en el Any, un segundo `parameter` y un segundo `type` en el Contract
		expect(() => verifyTrc20(triggerTx(triggerValue(), { anyExtra: [encodeBytesField(2, evilValue)] }))).toThrow(/Any trae el campo 2 repetido/)
		expect(() => verifyTrc20(triggerTx(triggerValue(), { contractExtra: [encodeBytesField(2, concatBytes(encodeBytesField(1, typeUrl('TriggerSmartContract')), encodeBytesField(2, evilValue)))] }))).toThrow(/Contract trae el campo 2 repetido/)
		expect(() => verifyTrc20(triggerTx(triggerValue(), { contractExtra: [encodeVarintField(1, 1n)] }))).toThrow(/Contract trae el campo 1 repetido/)
		// Un segundo fee_limit o una segunda expiration en el raw
		const contract = contractOf(31n, 'TriggerSmartContract', triggerValue())
		expect(() => verifyTrc20(txOf(rawHexOf(contract, { feeLimit: 30_000_000n, after: [encodeVarintField(18, 15_000_000_000n)] })))).toThrow(/Transaction\.raw trae el campo 18 repetido/)
		expect(() => verifyTrc20(txOf(rawHexOf(contract, { feeLimit: 30_000_000n, between: [encodeVarintField(8, 1789357791000n)] })))).toThrow(/Transaction\.raw trae el campo 8 repetido/)
	})

	test('campos que la wallet nunca pide no se firman: memo, Permission_id, TRC-10 adjunto, tipos ajenos', () => {
		const contract = contractOf(31n, 'TriggerSmartContract', triggerValue())
		// Transaction.raw.data (memo, campo 10)
		expect(() => verifyTrc20(txOf(rawHexOf(contract, { feeLimit: 30_000_000n, between: [encodeBytesField(10, asciiBytes('hola'))] })))).toThrow(/Transaction\.raw trae el campo 10, que no se admite/)
		// Contract.Permission_id (campo 5): firmar con otro permiso de la cuenta
		expect(() => verifyTrc20(triggerTx(triggerValue(), { contractExtra: [encodeVarintField(5, 2n)] }))).toThrow(/Contract trae el campo 5, que no se admite/)
		// call_token_value + token_id (5 y 6): moverían un TRC-10 del usuario junto a la llamada
		expect(() => verifyTrc20(triggerTx(triggerValue(encodeVarintField(5, 1_000_000n), encodeVarintField(6, 1002000n))))).toThrow(/TriggerSmartContract trae el campo 5, que no se admite/)
		expect(() => verifyTronTransaction(transferTx(encodeBytesField(4, asciiBytes('x'))), TRX_INTENT, 0n)).toThrow(/TransferContract trae el campo 4, que no se admite/)
		// Un contrato que la wallet no usa (2 = TransferAssetContract), aunque el resto cuadre
		expect(() => decodeTronRaw(rawHexOf(contractOf(2n, 'TransferAssetContract', transferValue())))).toThrow(/tipo de contrato 2 no admitido/)
		// Y uno conocido con el type_url de otro
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TriggerSmartContract', transferValue())))).toThrow(/type_url/)
	})

	test('una transferencia de TRX con fee_limit no pasa', () => {
		const tx = txOf(rawHexOf(contractOf(1n, 'TransferContract', transferValue()), { feeLimit: 30_000_000n }))
		expect(() => verifyTronTransaction(tx, TRX_INTENT, 0n)).toThrow(/fee_limit/)
	})

	test('otro wire type en un campo conocido no pasa', () => {
		// amount (campo 3) como bytes en vez de varint
		const value = concatBytes(encodeBytesField(1, addressBytes(FIXTURE.from)), encodeBytesField(2, addressBytes(BOB)), encodeBytesField(3, hexToBytes('c0843d')))
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', value)))).toThrow(/campo 3 con wire type 2/)
	})

	test('mismo contenido, otra codificación: tampoco (lo firmado tiene que ser la forma canónica)', () => {
		const owner = encodeBytesField(1, addressBytes(FIXTURE.from))
		const to = encodeBytesField(2, addressBytes(BOB))
		const key3 = Uint8Array.of(0x18)
		// 1.000.000 = c0 84 3d; con relleno, c0 84 bd 80 00 decodifica al mismo número
		const padded = concatBytes(owner, to, key3, hexToBytes('c084bd8000'))
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', padded)))).toThrow(/canónica/)
		// Campos del contrato fuera de orden
		const shuffled = concatBytes(to, owner, encodeVarintField(3, 1_000_000n))
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', shuffled)))).toThrow(/canónica/)
		// Un valor por defecto escrito a mano: call_value = 0
		const explicitZero = concatBytes(owner, encodeBytesField(2, addressBytes(FIXTURE.usdt)), Uint8Array.of(0x18, 0x00), encodeBytesField(4, GOOD_DATA))
		expect(() => decodeTronRaw(rawHexOf(contractOf(31n, 'TriggerSmartContract', explicitZero), { feeLimit: 30_000_000n }))).toThrow(/canónica/)
		// Campos del raw fuera de orden (timestamp antes que el contrato)
		const contract = contractOf(1n, 'TransferContract', transferValue())
		const rawShuffled = bytesToHex(concatBytes(encodeBytesField(1, hexToBytes('4db5')), encodeBytesField(4, hexToBytes('9341d33e550cdeef')), encodeVarintField(8, 1789271391000n), encodeVarintField(14, 1789271331541n), encodeBytesField(11, contract)))
		expect(() => decodeTronRaw(rawShuffled)).toThrow(/canónica/)
	})

	test('enteros que java-tron leería distinto no pasan', () => {
		const head = concatBytes(encodeBytesField(1, addressBytes(FIXTURE.from)), encodeBytesField(2, addressBytes(BOB)), Uint8Array.of(0x18))
		// Bits por encima de 64: java los descarta en silencio y leería otro importe
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', concatBytes(head, hexToBytes('ffffffffffffffffff7f')))))).toThrow(/64 bits/)
		// Once bytes
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', concatBytes(head, hexToBytes('8080808080808080808001')))))).toThrow(TronVerifyError)
		// Bit 63 puesto: para java es un importe negativo
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', concatBytes(head, hexToBytes('ffffffffffffffffff01')))))).toThrow(/64 bits/)
	})

	test('basura en vez de protobuf es un TronVerifyError, no un error cualquiera', () => {
		expect(() => decodeTronRaw('0a05aa')).toThrow(TronVerifyError)
		expect(() => decodeTronRaw('zz')).toThrow(TronVerifyError)
		// Una dirección que no mide 21 bytes
		const value = concatBytes(encodeBytesField(1, hexToBytes('41aabb')), encodeBytesField(2, addressBytes(BOB)), encodeVarintField(3, 1n))
		expect(() => decodeTronRaw(rawHexOf(contractOf(1n, 'TransferContract', value)))).toThrow(TronVerifyError)
	})

	test('los bytes reales de mainnet son canónicos: decodificar y volver a codificar da lo mismo', () => {
		expect(bytesToHex(encodeDecodedTronRaw(decodeTronRaw(FIXTURE.raw_data_hex)))).toBe(FIXTURE.raw_data_hex)
	})

	test('la primitiva de firma no firma un raw que no se lee sin ambigüedad', () => {
		const key = derivePrivateKey(mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), 'tron')
		const tx = transferTx(encodeBytesField(2, addressBytes(ATTACKER)), encodeVarintField(3, 999_000_000_000n))
		expect(() => signTronTransaction(tx.raw_data_hex, key)).toThrow(TronVerifyError)
		expect(() => signTronTransaction(rawHexOf(contractOf(2n, 'TransferAssetContract', transferValue())), key)).toThrow(TronVerifyError)
		expect(signTronTransaction(transferTx().raw_data_hex, key)).toHaveLength(130)
	})

	test('lector protobuf: un campo singular repetido o con otro wire type lanza en vez de devolver el primero', () => {
		const twice = decodeFields(concatBytes(encodeVarintField(3, 1n), encodeVarintField(3, 2n)))
		expect(() => varintOf(twice, 3)).toThrow(/campo 3 repetido/)
		const twiceBytes = decodeFields(concatBytes(encodeBytesField(2, hexToBytes('aa')), encodeBytesField(2, hexToBytes('bb'))))
		expect(() => bytesOf(twiceBytes, 2)).toThrow(/campo 2 repetido/)
		expect(() => varintOf(decodeFields(encodeBytesField(3, hexToBytes('aa'))), 3)).toThrow(/wire type/)
		expect(() => bytesOf(decodeFields(encodeVarintField(2, 7n)), 2)).toThrow(/wire type/)
		// Ausente = valor por defecto de proto3
		expect(varintOf([], 3)).toBe(0n)
		expect(bytesOf([], 2)).toHaveLength(0)
		// decodeExact: forma exacta, con el repetido solo donde se declara
		const shape = { 1: { wire: 2 }, 2: { wire: 2, repeated: true }, 3: { wire: 0 } }
		expect(decodeExact(concatBytes(encodeBytesField(1, hexToBytes('aa')), encodeBytesField(2, hexToBytes('bb')), encodeBytesField(2, hexToBytes('cc')), encodeVarintField(3, 1n)), shape, 'Msg')).toHaveLength(4)
		expect(() => decodeExact(encodeVarintField(9, 1n), shape, 'Msg')).toThrow(/Msg trae el campo 9, que no se admite/)
		expect(() => decodeExact(concatBytes(encodeBytesField(1, hexToBytes('aa')), encodeBytesField(1, hexToBytes('bb'))), shape, 'Msg')).toThrow(/Msg trae el campo 1 repetido/)
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

	test('computeTronBurnBreakdown: el ancho de banda es todo o nada, y las dos bolsas no suman', () => {
		const need = { energyNeeded: 65_000n, bandwidthNeeded: 345n, activatesAccount: false }
		const res = (freeBandwidth, stakedBandwidth = 0n, energy = 0n) => ({ freeBandwidth, stakedBandwidth, energy })

		// La cuota diaria intacta cubre la tx: no se quema banda
		expect(computeTronBurnBreakdown(need, res(600n), PARAMS)).toMatchObject({ bandwidthCovered: true, bandwidthBurnSun: 0n })
		// Ya envió hoy y le quedan 255: no cubre, así que se quema ENTERA (no el trozo que falta)
		expect(computeTronBurnBreakdown(need, res(255n), PARAMS)).toMatchObject({ bandwidthCovered: false, bandwidthBurnSun: 345_000n })
		// 200 gratis + 200 congelados NO son 400: cada bolsa tiene que cubrirla sola
		expect(computeTronBurnBreakdown(need, res(200n, 200n), PARAMS).bandwidthCovered).toBe(false)
		expect(computeTronBurnBreakdown(need, res(0n, 400n), PARAMS).bandwidthCovered).toBe(true)

		// La energía sí es proporcional: solo se quema lo que falta
		expect(computeTronBurnBreakdown(need, res(600n, 0n, 40_000n), PARAMS)).toMatchObject({ energyShort: 25_000n, energyBurnSun: 2_500_000n })

		// El alta de la cuenta destino va aparte y suma al total
		const activation = computeTronBurnBreakdown({ ...need, energyNeeded: 0n, activatesAccount: true }, res(600n), PARAMS)
		expect(activation).toMatchObject({ activationSun: 1_000_000n, total: 1_000_000n })
	})

	test('computeTronBurnBreakdown: con la energía ya alquilada solo queda el ancho de banda', () => {
		const need = { energyNeeded: 65_000n, bandwidthNeeded: 345n, activatesAccount: false }
		// Es el número que la pantalla promete como "después de alquilar pagarás X"
		const after = computeTronBurnBreakdown(need, { freeBandwidth: 255n, stakedBandwidth: 0n, energy: 132_000n }, PARAMS)
		expect(after.energyBurnSun).toBe(0n)
		expect(after.total).toBe(345_000n)
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

	test('la vigencia se cuenta en el reloj del teléfono: uno adelantado no ve la tx caducada', async () => {
		// `expiration` es hora de la CADENA; este teléfono va una hora por delante de ella
		const phone = Number(decodeTronRaw(FIXTURE.raw_data_hex).expiration) + 3_600_000
		const clock = jest.spyOn(Date, 'now').mockReturnValue(phone)
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({ freeNetLimit: 600, freeNetUsed: 0 }),
			'/wallet/triggerconstantcontract': () => ({ result: { result: true }, energy_used: 64_285 }),
			'/wallet/triggersmartcontract': (body) => {
				const raw_data_hex = withFeeLimit(FIXTURE.raw_data_hex, BigInt(body.fee_limit))
				return { result: { result: true }, transaction: { txID: tronTxId(raw_data_hex), raw_data_hex } }
			},
		})
		const prepared = await prepareTronSend(RPC, INTENT)
		clock.mockRestore()
		expect(prepared.expiresAt).toBe(phone + TRON_TX_VALIDITY_MS)
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

	test('un nodo que esconde OTRO destino detrás del bueno (campo repetido) no consigue una tx preparada', async () => {
		// TRX: lo que la app leería primero es «1 TRX a Bob»; lo último, «todo al atacante»
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({ freeNetLimit: 600, freeNetUsed: 0 }),
			'/wallet/getaccount': () => ({ address: BOB }),
			'/wallet/createtransaction': () => transferTx(encodeBytesField(2, addressBytes(ATTACKER)), encodeVarintField(3, 999_000_000_000n)),
		})
		const trx = await prepareTronSend(RPC, TRX_INTENT).catch(e => e)
		expect(trx).toBeInstanceOf(TronVerifyError)
		// Un fallo de verificación no rota de nodo: no es un problema de red
		expect(isRetryableRpcError(trx)).toBe(false)

		// TRC-20: la calldata buena y, detrás, `transfer(atacante, todo)`
		mockNode({
			'/wallet/getchainparameters': chainParams,
			'/wallet/getaccountresource': () => ({}),
			'/wallet/triggerconstantcontract': () => ({ result: { result: true }, energy_used: 64_285 }),
			'/wallet/triggersmartcontract': (body) => ({ result: { result: true }, transaction: txOf(rawHexOf(contractOf(31n, 'TriggerSmartContract', triggerValue(encodeBytesField(4, EVIL_DATA))), { feeLimit: BigInt(body.fee_limit) })) }),
		})
		await expect(prepareTronSend(RPC, INTENT)).rejects.toThrow(TronVerifyError)
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
