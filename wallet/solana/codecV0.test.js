/**
 * @jest-environment node
 *
 * Mensajes v0 (lookup tables) contra un vector generado con @solana/web3.js 1.98.4 fuera de
 * la app: un swap con la forma de los de Jupiter (wrap de SOL, ATAs, instrucción opaca con
 * cuentas en una tabla y cierre del wSOL). Se exige igualdad BYTE A BYTE en la compilación,
 * y que la decodificación devuelva exactamente las instrucciones de partida.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import {
	compileV0Message,
	decodeAddressLookupTable,
	decompileV0Instructions,
	deserializeMessage,
	deserializeTransactionV0,
	deserializeV0Message,
	fromBase64,
	resolveV0Accounts,
	serializeTransactionV0,
	serializeV0Message,
	toBase64,
} from './codec'

// Generado con scripts fuera del repo (web3.js 1.98.4), congelado aquí
const VECTOR = {
	"generatedWith": "@solana/web3.js 1.98.4",
	"user": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
	"userSecretSeedHex": "01080f161d242b323940474e555c636a71787f868d949ba2a9b0b7bec5ccd3da",
	"blockhash": "BXZGWdnfYeCb884496Wxw6tko62wd1BZrFGS9B8Fc8jn",
	"table": {
		"key": "EPVnmU33CC16WmHeTkz45g2fzH6bY9WAyqBfA9FJgB8p",
		"addresses": [
			"4yrnqv6u9a7MZLnfQLDGDxCJXSKKssHRQzkwgunpqmXx",
			"2YespGFoiTYa22LdvvpJWm3jXWrdaP7z2nrw6BpcuuBE",
			"CpVbDqzfjWoBSWmoAgb7MuWaQLdGrFSdpxFoZV2oZGmC",
			"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
			"HWDjdpsa4zQ31ftrZCxT5kwQqF4tsi4U8dXxrqQjQMax",
			"So11111111111111111111111111111111111111112",
			"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
			"Cxv367kKKZ7i7XsQnwao7uJQq9Em5pJkuQBzebJXoi7j"
		],
		"dataBase64": "AQAAAP//////////ewAAAAAAAAAAAdFGd3NMW2PaYpVy8+q5uSe6v4M8J/89oTvw1yMoHr5CAAA7I+Jf3soXN358OvJ3Jb2eSVXwiMUyMXIwaEG5H/yyQxb3hMeoTUBqNV+BRYp7Q6WqDMVo6gO3o/P9uRlEN25Rr5suWgKGt44BKIf+ehWiyEIcMTVvWYFkmd0C92sn758G3fbh12Whk9nL4UbO63msHLSF7V9bN5E6jPWFfv8AqfU3O+BKMvP0winpK7ECEm9HTRu1Js9BMkP9nPCBIWeZBpuIV/6rgYT7aH9jRhjANdrEOdwa6ztVmKDwAAAAAAHG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYbHDd/wJbnwc3F3a4nlts+mS/ES9jfj5eBuv54MW5yj6"
	},
	"instructions": [
		{
			"programId": "ComputeBudget111111111111111111111111111111",
			"keys": [],
			"dataBase64": "AxAnAAAAAAAA"
		},
		{
			"programId": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
			"keys": [
				{
					"pubkey": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
					"isSigner": true,
					"isWritable": true
				},
				{
					"pubkey": "7aEqxUtm6znF93mDRFNNph2pSUP9KT3yDk5x38YoR23c",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "So11111111111111111111111111111111111111112",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "11111111111111111111111111111111",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
					"isSigner": false,
					"isWritable": false
				}
			],
			"dataBase64": "AQ=="
		},
		{
			"programId": "11111111111111111111111111111111",
			"keys": [
				{
					"pubkey": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
					"isSigner": true,
					"isWritable": true
				},
				{
					"pubkey": "7aEqxUtm6znF93mDRFNNph2pSUP9KT3yDk5x38YoR23c",
					"isSigner": false,
					"isWritable": true
				}
			],
			"dataBase64": "AgAAAADh9QUAAAAA"
		},
		{
			"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
			"keys": [
				{
					"pubkey": "7aEqxUtm6znF93mDRFNNph2pSUP9KT3yDk5x38YoR23c",
					"isSigner": false,
					"isWritable": true
				}
			],
			"dataBase64": "EQ=="
		},
		{
			"programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
			"keys": [
				{
					"pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
					"isSigner": true,
					"isWritable": false
				},
				{
					"pubkey": "7aEqxUtm6znF93mDRFNNph2pSUP9KT3yDk5x38YoR23c",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "AcYi2pjFRGvpQu64ykNqiJt5sMGcPkUddbB6tNvoiCKE",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "4yrnqv6u9a7MZLnfQLDGDxCJXSKKssHRQzkwgunpqmXx",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "2YespGFoiTYa22LdvvpJWm3jXWrdaP7z2nrw6BpcuuBE",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "CpVbDqzfjWoBSWmoAgb7MuWaQLdGrFSdpxFoZV2oZGmC",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "HWDjdpsa4zQ31ftrZCxT5kwQqF4tsi4U8dXxrqQjQMax",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
					"isSigner": false,
					"isWritable": false
				},
				{
					"pubkey": "fymxPTxGYoqPYxBGhqZ8cYtzJ3iozWv6SBxEeBduywK",
					"isSigner": false,
					"isWritable": true
				}
			],
			"dataBase64": "5RfLlwECAw=="
		},
		{
			"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
			"keys": [
				{
					"pubkey": "7aEqxUtm6znF93mDRFNNph2pSUP9KT3yDk5x38YoR23c",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
					"isSigner": false,
					"isWritable": true
				},
				{
					"pubkey": "GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
					"isSigner": true,
					"isWritable": false
				}
			],
			"dataBase64": "CQ=="
		}
	],
	"messageBase64": "gAEABQnkAwmYz9WtFyPBaflWqgueuGGbWZK9YSwq9Cjrx5+N8GGp8RpJEdFYf3XxaOnpWeGL/M8oj+qjQU8qtxT4haR7jtRcxENWW5jq3DZ/8JP1e9HkBva7OAO8gJc+oOstI9UJ/EQ732rmSxl+yligzzJi4IrWAu5QFRC687p8AsQxjgMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpBHnVW/IxwG7udMVuzmgVB/2xst6j9I5RArHNola8E4+caMdHhelEc9Ej1D9sz4pi9sSZatzy+CfByL+nm2IY5QYEAAkDECcAAAAAAAAFBgABAAsGBwEBBgIAAQwCAAAAAOH1BQAAAAAHAQEBEQgKBwABAgkMCg0OAwflF8uXAQIDBwMBAAABCQHG60J/kpB53EU8Se7jukhXnVvDWQikL3YCf8f4w66YlQIAAgQFAQQG",
	"txBase64": "AeG0lrAwpp71PNOt75b2CMdnmrGZYNzN5UBV977ZDjIcGbPugLqLXonZuChjF672LIYEqOXzSrugjDzz8sIz2geAAQAFCeQDCZjP1a0XI8Fp+VaqC564YZtZkr1hLCr0KOvHn43wYanxGkkR0Vh/dfFo6elZ4Yv8zyiP6qNBTyq3FPiFpHuO1FzEQ1ZbmOrcNn/wk/V70eQG9rs4A7yAlz6g6y0j1Qn8RDvfauZLGX7KWKDPMmLgitYC7lAVELrzunwCxDGOAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAACMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4WQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKkEedVb8jHAbu50xW7OaBUH/bGy3qP0jlECsc2iVrwTj5xox0eF6URz0SPUP2zPimL2xJlq3PL4J8HIv6ebYhjlBgQACQMQJwAAAAAAAAUGAAEACwYHAQEGAgABDAIAAAAA4fUFAAAAAAcBAQERCAoHAAECCQwKDQ4DB+UXy5cBAgMHAwEAAAEJAcbrQn+SkHncRTxJ7uO6SFedW8NZCKQvdgJ/x/jDrpiVAgACBAUBBAY=",
	"staticKeys": [
		"GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9",
		"7aEqxUtm6znF93mDRFNNph2pSUP9KT3yDk5x38YoR23c",
		"AcYi2pjFRGvpQu64ykNqiJt5sMGcPkUddbB6tNvoiCKE",
		"fymxPTxGYoqPYxBGhqZ8cYtzJ3iozWv6SBxEeBduywK",
		"ComputeBudget111111111111111111111111111111",
		"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
		"11111111111111111111111111111111",
		"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
		"JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
	],
	"lookups": [
		{
			"accountKey": "EPVnmU33CC16WmHeTkz45g2fzH6bY9WAyqBfA9FJgB8p",
			"writableIndexes": [
				0,
				2
			],
			"readonlyIndexes": [
				5,
				1,
				4,
				6
			]
		}
	],
	"header": {
		"numRequiredSignatures": 1,
		"numReadonlySignedAccounts": 0,
		"numReadonlyUnsignedAccounts": 5
	}
}

const instructions = VECTOR.instructions.map(ix => ({ programId: ix.programId, keys: ix.keys, data: fromBase64(ix.dataBase64) }))
const table = { key: VECTOR.table.key, addresses: VECTOR.table.addresses }
/**
 * Lo que una instrucción HACE: programa, cuentas y datos. Los permisos que salen de un
 * mensaje son los de la cuenta en TODO el mensaje (la unión), como en web3.js: el usuario
 * firma y escribe en la tx aunque una instrucción concreta lo declare de solo lectura.
 */
const shape = (list) => list.map(ix => ({ programId: ix.programId, keys: ix.keys.map(k => k.pubkey), data: Array.from(ix.data) }))
const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

describe('lookup table on-chain', () => {

	test('el layout de la cuenta se lee como lo lee web3.js', () => {
		expect(decodeAddressLookupTable(fromBase64(VECTOR.table.dataBase64))).toEqual(VECTOR.table.addresses)
	})

	test('una cuenta que no es una tabla se rechaza', () => {
		const data = fromBase64(VECTOR.table.dataBase64)
		data[0] = 2
		expect(() => decodeAddressLookupTable(data)).toThrow(/no es una lookup table/)
		expect(() => decodeAddressLookupTable(new Uint8Array(57))).toThrow(/tamaño/)
	})
})

describe('compilar v0', () => {

	test('byte a byte igual que web3.js', () => {
		const message = compileV0Message(VECTOR.user, instructions, VECTOR.blockhash, [table])
		expect(toBase64(serializeV0Message(message))).toBe(VECTOR.messageBase64)
		expect(message.staticAccountKeys).toEqual(VECTOR.staticKeys)
		expect(message.addressTableLookups).toEqual(VECTOR.lookups)
	})

	test('firmantes y programas invocados nunca salen a la tabla', () => {
		const message = compileV0Message(VECTOR.user, instructions, VECTOR.blockhash, [table])
		// TOKEN está en la tabla, pero es un programa invocado
		expect(message.staticAccountKeys).toContain('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
		expect(message.staticAccountKeys[0]).toBe(VECTOR.user)
		expect(message.numRequiredSignatures).toBe(1)
	})

	test('sin tablas compila igual, todo estático', () => {
		const message = compileV0Message(VECTOR.user, instructions, VECTOR.blockhash)
		expect(message.addressTableLookups).toEqual([])
		expect(shape(decompileV0Instructions(message, []))).toEqual(shape(instructions))
	})
})

describe('decodificar v0', () => {

	test('el mensaje de web3.js se resuelve a las instrucciones de partida', () => {
		const message = deserializeV0Message(fromBase64(VECTOR.messageBase64))
		expect(shape(decompileV0Instructions(message, [table]))).toEqual(shape(instructions))
	})

	test('los permisos resueltos son la unión de todo el mensaje', () => {
		const message = deserializeV0Message(fromBase64(VECTOR.messageBase64))
		const accounts = resolveV0Accounts(message, [table])
		const meta = (pubkey) => accounts.find(a => a.pubkey === pubkey)
		for (const ix of instructions) {
			for (const key of ix.keys) {
				if (key.isSigner) expect(meta(key.pubkey).isSigner).toBe(true)
				if (key.isWritable) expect(meta(key.pubkey).isWritable).toBe(true)
			}
		}
		// Solo el usuario firma
		expect(accounts.filter(a => a.isSigner).map(a => a.pubkey)).toEqual([VECTOR.user])
	})

	test('ida y vuelta', () => {
		const bytes = fromBase64(VECTOR.messageBase64)
		expect(hex(serializeV0Message(deserializeV0Message(bytes)))).toBe(hex(bytes))
	})

	test('la firma de web3.js valida sobre los bytes del mensaje', () => {
		const tx = deserializeTransactionV0(fromBase64(VECTOR.txBase64))
		expect(tx.signatures).toHaveLength(1)
		const seed = Uint8Array.from(VECTOR.userSecretSeedHex.match(/../g).map(h => parseInt(h, 16)))
		expect(ed25519.verify(tx.signatures[0], tx.messageBytes, ed25519.getPublicKey(seed))).toBe(true)
		expect(toBase64(serializeTransactionV0(tx))).toBe(VECTOR.txBase64)
	})

	test('una tabla con OTRO contenido cambia las cuentas: por eso se lee de la cadena', () => {
		const message = deserializeV0Message(fromBase64(VECTOR.messageBase64))
		const forged = { key: table.key, addresses: [...table.addresses].reverse() }
		expect(shape(decompileV0Instructions(message, [forged]))).not.toEqual(shape(instructions))
	})

	test('sin la tabla, o con un índice que no existe, no se adivina', () => {
		const message = deserializeV0Message(fromBase64(VECTOR.messageBase64))
		expect(() => resolveV0Accounts(message, [])).toThrow(/falta la lookup table/)
		expect(() => resolveV0Accounts(message, [{ key: table.key, addresses: table.addresses.slice(0, 2) }])).toThrow(/fuera de la lookup table/)
	})

	test('el decodificador legacy sigue rechazando v0 (envíos y staking no cambian)', () => {
		expect(() => deserializeMessage(fromBase64(VECTOR.messageBase64))).toThrow(/versionado/)
	})
})
