/**
 * @jest-environment node
 *
 * Codec de Solana contra vectores generados con @solana/web3.js 1.98 + spl-token 0.1.8
 * (en TronDealer): PDA de la ATA, tx nativa byte a byte y tx patrocinada con compute
 * budget + create ATA idempotente + TransferChecked decodificada campo a campo.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import {
	accountMetaAt,
	associatedTokenAddress,
	compileMessage,
	createAssociatedTokenAccountIdempotentIx,
	deserializeMessage,
	deserializeTransaction,
	encodeBase58,
	encodeCompactU16,
	fromBase64,
	isValidSolanaAddress,
	readU64le,
	serializeMessage,
	serializeTransaction,
	setComputeUnitLimitIx,
	setComputeUnitPriceIx,
	systemTransferIx,
	toBase64,
	transactionId,
	transferCheckedIx,
	ASSOCIATED_TOKEN_PROGRAM,
	COMPUTE_BUDGET_PROGRAM,
	SYSTEM_PROGRAM,
	TOKEN_PROGRAM,
} from './codec'

const hexBytes = (hex) => Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)))
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const USER_SECRET = hexBytes('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20')
const PAYER_SECRET = hexBytes('02030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2021')
const USER = '9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj'
const PAYER = '5ZgHPb447UcXavVTorgYBr8egi3sw7dXKpX4Frec9rYS'
const DEST = '5rXezEUcPoLLDKATEsDJzUdNojasqE2ekkHntNLfEQtL'
const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k'
const NATIVE_B64 = 'Afd2GurAubJUa8DNw/Xn+UzE2gdAQP1mo/2xh98miCcnGRMq/4E4dfvinFyZThdGxcvTHSxPK7/P3BcfFVdxUgQBAAEDebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmRIHt53LaFXhcnlmghiAbjD+cMHEp4/xtfzSqTf7VgU5QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusBAgIAAQwCAAAAYOMWAAAAAAA='
const SPONSORED_PARTIAL_B64 = 'AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADuiQe/ap0pz1VHVvYi8t9xQ8iX71enIbiHtUjFUWRRYPuiISaCG+P7F8SryKBzYSV0SRqrSURNBGGdLyO4A8YJAgEGCkPNwCPSLV+eEH0aBpNFfTXR0Q630hxyEZL1b13kBmXTebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmSVmDegeBWYGBCkPiPRDE26wp61c5+rSvrJbqcklyUtaLTB5dXIaC6Yximk9qcdTQZ7ug0M0QPp7iPoC5lbRPSvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIHt53LaFXhcnlmghiAbjD+cMHEp4/xtfzSqTf7VgU5YyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADOAQ5gr+2yJxe9YxkvVBRaP5ZaM7uC0scCnrLOHiCCZAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusEBwAFAkCcAAAHAAkDiBMAAAAAAAAGBgADBQgECQEBCQQCCAMBCgygJSYAAAAAAAY='
const SPONSORED_FULL_TXID = '3Cnw9BuD29kjPYXBh6BH8KVZqgBMnAchyCWAS9Y5Wu3Vc1QBuskp11Ayp9zQPZxKgy1j2qYUBYHshpwQS7ExbJpU'

describe('claves y PDA', () => {
	test('la pública ed25519 del secreto coincide con web3.js Keypair.fromSeed', () => {
		expect(encodeBase58(ed25519.getPublicKey(USER_SECRET))).toBe(USER)
		expect(encodeBase58(ed25519.getPublicKey(PAYER_SECRET))).toBe(PAYER)
	})

	test('ATA = findProgramAddressSync([owner, TOKEN, mint], ATA_PROGRAM)', () => {
		expect(associatedTokenAddress('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', USDT)).toBe('2eE3rzUwZwHdymjQcDhNTHRgWjnFsqA4g3pZvHkcMR2a')
		expect(associatedTokenAddress(USER, USDT)).toBe('B4xNPM22xNEPrnJYSadeoTwLU6WbtNZDLGB9NeRYVpb9')
		expect(associatedTokenAddress(DEST, USDT)).toBe('DAbsSy9gLcQAbyepBFMxJyqCvS6rJfAgUv7ftaPJie3G')
	})

	test('validación de direcciones: base58 de 32 bytes', () => {
		expect(isValidSolanaAddress(USER)).toBe(true)
		expect(isValidSolanaAddress(SYSTEM_PROGRAM)).toBe(true)
		expect(isValidSolanaAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false)
		expect(isValidSolanaAddress('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH')).toBe(false) // base58 pero 25 bytes
		expect(isValidSolanaAddress(`${USER}0`)).toBe(false)
	})

	test('compact-u16', () => {
		expect(Array.from(encodeCompactU16(0))).toEqual([0])
		expect(Array.from(encodeCompactU16(127))).toEqual([127])
		expect(Array.from(encodeCompactU16(128))).toEqual([0x80, 0x01])
		expect(Array.from(encodeCompactU16(16383))).toEqual([0xff, 0x7f])
		expect(Array.from(encodeCompactU16(16384))).toEqual([0x80, 0x80, 0x01])
	})
})

describe('tx nativa', () => {
	test('compilar + firmar produce EXACTAMENTE los bytes de web3.js', () => {
		const message = compileMessage(USER, [systemTransferIx(USER, DEST, 1500000n)], BLOCKHASH)
		const messageBytes = serializeMessage(message)
		const signature = ed25519.sign(messageBytes, USER_SECRET)
		const bytes = serializeTransaction({ signatures: [signature], message, messageBytes })
		expect(toBase64(bytes)).toBe(NATIVE_B64)
	})

	test('deserializar y volver a serializar es identidad', () => {
		const tx = deserializeTransaction(fromBase64(NATIVE_B64))
		expect(tx.message.accountKeys).toEqual([USER, DEST, SYSTEM_PROGRAM])
		expect(tx.message.recentBlockhash).toBe(BLOCKHASH)
		expect(toBase64(serializeTransaction(tx))).toBe(NATIVE_B64)
		expect(ed25519.verify(tx.signatures[0], tx.messageBytes, ed25519.getPublicKey(USER_SECRET))).toBe(true)
		expect(deserializeMessage(tx.messageBytes)).toEqual(tx.message)
	})
})

describe('tx patrocinada (fee payer ≠ usuario)', () => {
	const tx = deserializeTransaction(fromBase64(SPONSORED_PARTIAL_B64))
	const keyOf = (i) => tx.message.accountKeys[i]

	test('dos firmantes: fee payer primero con hueco vacío, usuario firmado y válido', () => {
		expect(tx.message.numRequiredSignatures).toBe(2)
		expect(keyOf(0)).toBe(PAYER)
		expect(keyOf(1)).toBe(USER)
		expect(tx.signatures[0]).toBeNull()
		expect(ed25519.verify(tx.signatures[1], tx.messageBytes, ed25519.getPublicKey(USER_SECRET))).toBe(true)
		expect(accountMetaAt(tx.message, 0)).toEqual({ isSigner: true, isWritable: true })
		expect(accountMetaAt(tx.message, 1)).toEqual({ isSigner: true, isWritable: false }) // owner de TransferChecked: firma, no se escribe
	})

	test('instrucciones decodificables: 2 × compute budget, create idempotente, TransferChecked', () => {
		const programs = tx.message.instructions.map(ix => keyOf(ix.programIdIndex))
		expect(programs).toEqual([COMPUTE_BUDGET_PROGRAM, COMPUTE_BUDGET_PROGRAM, ASSOCIATED_TOKEN_PROGRAM, TOKEN_PROGRAM])
		const [limit, price, create, transfer] = tx.message.instructions
		expect(Array.from(limit.data)).toEqual(Array.from(setComputeUnitLimitIx(40000).data))
		expect(Array.from(price.data)).toEqual(Array.from(setComputeUnitPriceIx(5000n).data))
		expect(Array.from(create.data)).toEqual([1])
		expect(create.accounts.map(keyOf)).toEqual(createAssociatedTokenAccountIdempotentIx(PAYER, DEST, USDT).keys.map(k => k.pubkey))
		expect(transfer.data[0]).toBe(12)
		expect(readU64le(transfer.data, 1)).toBe(2500000n)
		expect(transfer.data[9]).toBe(6)
		expect(transfer.accounts.map(keyOf)).toEqual(transferCheckedIx({ source: associatedTokenAddress(USER, USDT), mint: USDT, destination: associatedTokenAddress(DEST, USDT), owner: USER, amount: 2500000n, decimals: 6 }).keys.map(k => k.pubkey))
	})

	test('con la firma del fee payer, el id de la tx es el de web3.js (ed25519 determinista)', () => {
		const full = { ...tx, signatures: [ed25519.sign(tx.messageBytes, PAYER_SECRET), tx.signatures[1]] }
		expect(transactionId(full)).toBe(SPONSORED_FULL_TXID)
		expect(transactionId(tx)).toBeNull()
	})

	test('nuestro compilador produce un mensaje equivalente que firma y re-decodifica', () => {
		const instructions = [
			setComputeUnitLimitIx(40000), setComputeUnitPriceIx(5000n),
			createAssociatedTokenAccountIdempotentIx(PAYER, DEST, USDT),
			transferCheckedIx({ source: associatedTokenAddress(USER, USDT), mint: USDT, destination: associatedTokenAddress(DEST, USDT), owner: USER, amount: 2500000n, decimals: 6 }),
		]
		const message = compileMessage(PAYER, instructions, BLOCKHASH)
		expect(message.accountKeys[0]).toBe(PAYER)
		expect(message.numRequiredSignatures).toBe(2)
		expect(new Set(message.accountKeys)).toEqual(new Set(tx.message.accountKeys))
		const back = deserializeMessage(serializeMessage(message))
		const semantic = (m) => m.instructions.map(ix => ({ program: m.accountKeys[ix.programIdIndex], accounts: ix.accounts.map(i => m.accountKeys[i]), data: Array.from(ix.data) }))
		expect(semantic(back)).toEqual(semantic(tx.message))
	})

	test('rechaza mensajes versionados y tx truncadas', () => {
		const versioned = Uint8Array.from([1, ...new Uint8Array(64), 0x80, 1, 0, 0])
		expect(() => deserializeTransaction(versioned)).toThrow(/versionado/)
		expect(() => deserializeTransaction(fromBase64(NATIVE_B64).slice(0, 100))).toThrow(/truncada/)
	})
})
