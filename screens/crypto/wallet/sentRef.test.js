/**
 * La referencia a un envío que se guarda en disco para preguntar después a la cadena por él.
 * Lo que vuelve del disco solo se usa si tiene la forma exacta de una: con una referencia
 * rara la pregunta se queda en «no se sabe», que nunca deja firmar otro envío.
 * @jest-environment node
 */
import { parseSentRef } from './sentRef'

const HASH = `0x${'ab'.repeat(32)}`
const TXID = 'cd'.repeat(32)
const REFS = {
	tron: { kind: 'tron', chainKey: 'tron', rawHex: '0a02abcd' },
	evm: { kind: 'evm', chainKey: 'bsc', hash: HASH, from: `0x${'11'.repeat(20)}`, nonce: 7 },
	btc: { kind: 'btc', chainKey: 'bitcoin', txid: TXID, inputs: [{ txid: 'ee'.repeat(32), vout: 0 }, { txid: 'ff'.repeat(32), vout: 3 }] },
	stacks: { kind: 'stacks', chainKey: 'stacks', txid: TXID, from: 'SP3XXK8BG5X7CRH7W07RRJK3JZJXJ799WX3Y0SMCR', nonce: '12' },
	solana: { kind: 'solana', chainKey: 'solana', signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW', owner: 'So11111111111111111111111111111111111111112', lastValidBlockHeight: 300, blockhashSlot: 250 },
	'solana-sponsored': { kind: 'solana-sponsored', chainKey: 'solana', owner: 'So11111111111111111111111111111111111111112', message: 'AQID', lastValidBlockHeight: 300, blockhashSlot: null },
}

test.each(Object.keys(REFS))('%s: sobrevive a ir al disco y volver', (kind) => {
	expect(parseSentRef(JSON.parse(JSON.stringify(REFS[kind])))).toEqual(REFS[kind])
})

test('solo se queda con los campos de la referencia', () => {
	expect(parseSentRef({ ...REFS.evm, extra: 'x', rawHex: 'ff' })).toEqual(REFS.evm)
})

test.each([
	['nada', null],
	['un texto', 'evm'],
	['una lista', [REFS.evm]],
	['una familia desconocida', { ...REFS.evm, kind: 'cosmos' }],
	['sin cadena', { ...REFS.evm, chainKey: '' }],
	['EVM: hash que no es un hash', { ...REFS.evm, hash: '0x1234' }],
	['EVM: remitente que no es una dirección', { ...REFS.evm, from: 'yo' }],
	['EVM: nonce negativo', { ...REFS.evm, nonce: -1 }],
	['EVM: nonce como texto', { ...REFS.evm, nonce: '7' }],
	['EVM: nonce con decimales', { ...REFS.evm, nonce: 7.5 }],
	['TRON: raw que no es hex', { ...REFS.tron, rawHex: 'zz' }],
	['TRON: raw desmesurado', { ...REFS.tron, rawHex: 'ab'.repeat(5000) }],
	['Bitcoin: id que no es un id', { ...REFS.btc, txid: 'abc' }],
	['Bitcoin: inputs que no son una lista', { ...REFS.btc, inputs: 'todos' }],
	['Bitcoin: un input sin salida', { ...REFS.btc, inputs: [{ txid: 'ee'.repeat(32) }] }],
	['Bitcoin: más inputs de los que caben en una tx de la wallet', { ...REFS.btc, inputs: Array.from({ length: 41 }, () => ({ txid: 'ee'.repeat(32), vout: 0 })) }],
	['Stacks: nonce que no es un número', { ...REFS.stacks, nonce: '12n' }],
	['Stacks: nonce numérico (un bigint no cabe en JSON: va como texto)', { ...REFS.stacks, nonce: 12 }],
	['Solana: sin altura de caducidad', { ...REFS.solana, lastValidBlockHeight: undefined }],
	['Solana: slot que no es número ni null', { ...REFS.solana, blockhashSlot: 'ayer' }],
	['Solana patrocinada: sin mensaje', { ...REFS['solana-sponsored'], message: '' }],
])('%s → no es una referencia', (_name, raw) => {
	expect(parseSentRef(raw)).toBeNull()
})
