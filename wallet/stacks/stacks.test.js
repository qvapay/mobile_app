/**
 * @jest-environment node
 *
 * Enviar en Stacks: STX y QUSD (SIP-010) con nonce/fee de Hiro simulados,
 * firma verificada re-parseando (payload y post-condición) y broadcast.
 */
import { deserializeTransaction } from '@stacks/transactions'

import {
	broadcastStacksTransaction,
	feeTiersFromEstimations,
	isValidStacksAddress,
	MAX_FEE_USTX,
	parseAssetIdentifier,
	prepareStacksSend,
	signStacksTransaction,
	StacksVerifyError,
	stacksPublicKey,
	verifySignedStacksTransaction,
} from './tx'
import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import { isRetryableRpcError } from '../registry/rpcRouter'

const SEED = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
const ADDR = deriveAddresses(SEED)
const PRIV = derivePrivateKey(SEED, 'stacks')
const FROM = ADDR.stx
const TO = 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2'
const QUSD = 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD'
const RPC = { url: 'https://api.hiro.so', priority: 10, owner: 'hiro', api: 'hiro' }

let calls
const mockHiro = ({ nonce = 20, estimations = [{ fee: 180 }, { fee: 241 }, { fee: 24281 }], feeStatus = 200 } = {}) => {
	calls = []
	global.fetch = jest.fn(async (url, init = {}) => {
		calls.push({ url, method: init.method })
		if (url.endsWith('/nonces')) return { ok: true, status: 200, json: async () => ({ possible_next_nonce: nonce }) }
		if (url.endsWith('/v2/fees/transaction')) return { ok: feeStatus === 200, status: feeStatus, json: async () => ({ estimations }) }
		return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }
	})
}
afterEach(() => { delete global.fetch })

describe('direcciones e identificadores', () => {
	test('SP/SM de mainnet válidas; testnet, EVM y checksum roto no', () => {
		expect(isValidStacksAddress(FROM)).toBe(true)
		expect(isValidStacksAddress(TO)).toBe(true)
		expect(isValidStacksAddress('ST14CTSJZNKZ7YTR6C84368J2QXRW8RC20K8V67HB')).toBe(false)
		expect(isValidStacksAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false)
		expect(isValidStacksAddress(TO.slice(0, -1) + (TO.endsWith('2') ? '3' : '2'))).toBe(false)
	})

	test('identificador SIP-010', () => {
		expect(parseAssetIdentifier(QUSD)).toEqual({ address: TO, name: 'QUSD', asset: 'QUSD' })
		expect(() => parseAssetIdentifier('SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD')).toThrow(/identificador/)
	})

	test('la clave pública derivada casa con la dirección (metadata pública)', () => {
		expect(stacksPublicKey(PRIV)).toBe(ADDR.stxPublicKey)
	})
})

describe('fee por nivel', () => {
	test('tres estimaciones de Hiro → slow/normal/fast, con suelo, tope y monotonía', () => {
		expect(feeTiersFromEstimations([{ fee: 180 }, { fee: 241 }, { fee: 24281 }])).toEqual({ slow: 1000n, normal: 1000n, fast: 24281n })
		expect(feeTiersFromEstimations([{ fee: 2000 }, { fee: 3000 }, { fee: 99_000_000 }])).toEqual({ slow: 2000n, normal: 3000n, fast: MAX_FEE_USTX })
		expect(feeTiersFromEstimations(undefined)).toEqual({ slow: 3000n, normal: 3000n, fast: 6000n })
	})
})

describe('prepare + firma verificada', () => {
	test('STX: nonce y fee de Hiro; la tx firmada parsea a la intención', async () => {
		mockHiro()
		const prepared = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 1_500_000n, contract: null }, ADDR.stxPublicKey)
		expect(prepared.nonce).toBe(20n)
		expect(prepared.fee).toBe(1000n) // normal = 241 → suelo 0.001 STX
		expect(calls.some(c => c.url.endsWith('/nonces'))).toBe(true)
		const signed = signStacksTransaction(prepared, PRIV)
		expect(signed.txid).toMatch(/^[0-9a-f]{64}$/)
		const tx = deserializeTransaction(signed.hex)
		expect(tx.auth.spendingCondition.nonce).toBe(20n)
		expect(() => verifySignedStacksTransaction(signed, prepared)).not.toThrow()
	})

	test('QUSD: contract-call transfer con post-condición exacta en modo deny; tier fast', async () => {
		mockHiro()
		const prepared = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 500_000_000n, contract: QUSD }, ADDR.stxPublicKey, { tier: 'fast' })
		expect(prepared.fee).toBe(24281n)
		const signed = signStacksTransaction(prepared, PRIV)
		const tx = deserializeTransaction(signed.hex)
		expect(tx.postConditionMode).toBe(2)
		expect(tx.postConditions.values).toHaveLength(1)
		expect(() => verifySignedStacksTransaction(signed, prepared)).not.toThrow()
	})

	test('Hiro sin estimación (400) → fee por defecto, no bloquea', async () => {
		mockHiro({ feeStatus: 400 })
		const prepared = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 1n, contract: null }, ADDR.stxPublicKey)
		expect(prepared.fee).toBe(3000n)
	})

	test('la verificación rechaza destino/cantidad/nonce distintos y otra clave', async () => {
		mockHiro()
		const prepared = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 1_500_000n, contract: null }, ADDR.stxPublicKey)
		const signed = signStacksTransaction(prepared, PRIV)
		expect(() => verifySignedStacksTransaction(signed, { ...prepared, intent: { ...prepared.intent, to: FROM } })).toThrow(/destino/)
		expect(() => verifySignedStacksTransaction(signed, { ...prepared, intent: { ...prepared.intent, amount: 1n } })).toThrow(/cantidad/)
		expect(() => verifySignedStacksTransaction(signed, { ...prepared, nonce: 21n })).toThrow(/nonce/)
		const other = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 1n, contract: QUSD }, ADDR.stxPublicKey)
		expect(() => signStacksTransaction(other, new Uint8Array(32).fill(7))).toThrow(StacksVerifyError)
		// Intención de token contra una tx de STX
		expect(() => verifySignedStacksTransaction(signed, { ...prepared, intent: { ...prepared.intent, contract: QUSD } })).toThrow(/llamada a contrato/)
	})

	test('destino inválido y cantidad 0', async () => {
		mockHiro()
		await expect(prepareStacksSend(RPC, { from: FROM, to: 'nope', amount: 1n, contract: null }, ADDR.stxPublicKey)).rejects.toThrow(/destino/)
		await expect(prepareStacksSend(RPC, { from: FROM, to: TO, amount: 0n, contract: null }, ADDR.stxPublicKey)).rejects.toThrow(/cantidad/)
	})
})

describe('patrocinada (swap a saldo QvaPay)', () => {
	test('fee 0 sin pedir estimación, authType sponsored, misma post-condición; la verificación acepta', async () => {
		mockHiro()
		const prepared = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 500_000_000n, contract: QUSD }, ADDR.stxPublicKey, { sponsored: true })
		expect(prepared.sponsored).toBe(true)
		expect(prepared.fee).toBe(0n)
		expect(prepared.feeByTier).toEqual({ slow: 0n, normal: 0n, fast: 0n })
		expect(calls.some(c => c.url.endsWith('/v2/fees/transaction'))).toBe(false)
		const signed = signStacksTransaction(prepared, PRIV)
		const tx = deserializeTransaction(signed.hex)
		expect(tx.auth.authType).toBe(5)
		expect(tx.auth.spendingCondition.fee).toBe(0n)
		expect(tx.postConditionMode).toBe(2)
		expect(tx.postConditions.values).toHaveLength(1)
		expect(() => verifySignedStacksTransaction(signed, prepared)).not.toThrow()
	})

	test('una firma estándar no pasa como patrocinada ni al revés; fee ≠ 0 patrocinada se rechaza', async () => {
		mockHiro()
		const sponsored = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 1n, contract: QUSD }, ADDR.stxPublicKey, { sponsored: true })
		const standard = await prepareStacksSend(RPC, { from: FROM, to: TO, amount: 1n, contract: QUSD }, ADDR.stxPublicKey)
		const signedSponsored = signStacksTransaction(sponsored, PRIV)
		const signedStandard = signStacksTransaction(standard, PRIV)
		expect(() => verifySignedStacksTransaction(signedStandard, { ...sponsored, fee: standard.fee })).toThrow(/no está patrocinada/)
		expect(() => verifySignedStacksTransaction(signedSponsored, { ...standard, fee: 0n })).toThrow(/patrocinada inesperada/)
		expect(() => verifySignedStacksTransaction(signedSponsored, { ...sponsored, fee: 10n })).toThrow(/fee/)
		// El destino sigue siendo lo verificado: la tesorería la pone el backend en la intención
		expect(() => verifySignedStacksTransaction(signedSponsored, { ...sponsored, intent: { ...sponsored.intent, to: FROM } })).toThrow(/destino/)
	})
})

describe('broadcast', () => {
	const signed = { hex: '00', txid: 'ab'.repeat(32) }
	test('txid como JSON string, en mempool = duplicado, rechazo de negocio no rota, 5xx rota', async () => {
		global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => `"${signed.txid}"` }))
		await expect(broadcastStacksTransaction(RPC, signed)).resolves.toEqual({ txid: signed.txid, duplicate: false })
		global.fetch = jest.fn(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'transaction rejected', reason: 'AlreadyInMempool' }) }))
		await expect(broadcastStacksTransaction(RPC, signed)).resolves.toEqual({ txid: signed.txid, duplicate: true })
		global.fetch = jest.fn(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'transaction rejected', reason: 'BadNonce', reason_data: {} }) }))
		const rejected = await broadcastStacksTransaction(RPC, signed).catch(e => e)
		expect(rejected.message).toMatch(/BadNonce/)
		expect(isRetryableRpcError(rejected)).toBe(false)
		global.fetch = jest.fn(async () => ({ ok: false, status: 502, text: async () => 'bad gateway' }))
		expect(isRetryableRpcError(await broadcastStacksTransaction(RPC, signed).catch(e => e))).toBe(true)
	})
})
