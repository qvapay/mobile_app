/**
 * A quién se pregunta si un envío ya difundido entró: a la cadena, en las cinco familias,
 * con lo que identifica esa tx en cada una. `dropped` es lo único que deja firmar otra tx,
 * y sin pruebas sería un segundo pago: lo que no se puede preguntar contesta `unknown`.
 * @jest-environment node
 */
jest.mock('../../../wallet/registry/appRpcRouter', () => ({
	getAppRpcRouter: () => ({ call: (_chainKey, fn) => fn({ url: 'https://node.example' }, undefined) }),
}))
jest.mock('../../../wallet/tron/tx', () => ({ ...jest.requireActual('../../../wallet/tron/tx'), lookupTronTransaction: jest.fn(async () => ({ status: 'dropped' })) }))
jest.mock('../../../wallet/solana/tx', () => ({
	...jest.requireActual('../../../wallet/solana/tx'),
	lookupSolanaTransaction: jest.fn(async () => ({ status: 'dropped' })),
	lookupSponsoredSolanaTransaction: jest.fn(async () => ({ status: 'landed', txid: 'PAYER_SIG' })),
}))

jest.mock('../../../wallet/evm/tx', () => ({ ...jest.requireActual('../../../wallet/evm/tx'), lookupEvmTransaction: jest.fn(async () => ({ status: 'landed', txid: '0xhash' })) }))
jest.mock('../../../wallet/btc/tx', () => ({ ...jest.requireActual('../../../wallet/btc/tx'), lookupBtcTransaction: jest.fn(async () => ({ status: 'dropped' })) }))
jest.mock('../../../wallet/stacks/tx', () => ({ ...jest.requireActual('../../../wallet/stacks/tx'), lookupStacksTransaction: jest.fn(async () => ({ status: 'dropped' })) }))

const { lookupTronTransaction } = require('../../../wallet/tron/tx')
const { lookupSolanaTransaction, lookupSponsoredSolanaTransaction } = require('../../../wallet/solana/tx')
const { lookupEvmTransaction } = require('../../../wallet/evm/tx')
const { lookupBtcTransaction } = require('../../../wallet/btc/tx')
const { lookupStacksTransaction } = require('../../../wallet/stacks/tx')
const { lookupSend, lookupSentRef, sentRefOf } = require('./walletSendActions')
const { parseSentRef } = require('./sentRef')

beforeEach(() => { jest.clearAllMocks() })

test('TRON: pregunta por la tx difundida (su raw)', async () => {
	const prepared = { kind: 'tron', intent: { chainKey: 'tron' }, inner: { tx: { raw_data_hex: 'abcd' } } }
	await expect(lookupSend(prepared, { kind: 'tron', signature: '00' })).resolves.toEqual({ status: 'dropped' })
	expect(lookupTronTransaction).toHaveBeenCalledWith(expect.anything(), 'abcd', { signal: undefined })
})

test('Solana: pregunta por la firma y el historial del remitente, contra lastValidBlockHeight (no el reloj local) y el slot del blockhash', async () => {
	const prepared = { kind: 'solana', intent: { chainKey: 'solana', from: 'OWNER' }, inner: { sponsored: false, lastValidBlockHeight: 123, blockhashSlot: 456 } }
	await lookupSend(prepared, { kind: 'solana', signed: { txid: 'SIG', base64: '' } })
	expect(lookupSolanaTransaction).toHaveBeenCalledWith(expect.anything(), { signature: 'SIG', owner: 'OWNER', lastValidBlockHeight: 123, blockhashSlot: 456 }, undefined)
})

// Antes contestaba `unknown` sin preguntar: tras una difusión sin respuesta la app no podía
// saber si el envío gratis había salido, y el backend decía «no se gastó nada» sin comprobarlo
test('Solana patrocinada: su id es la firma del pagador (que la app no tiene), así que se la busca por su mensaje en el historial del remitente', async () => {
	const messageBytes = Uint8Array.from([1, 2, 3])
	const prepared = { kind: 'solana', intent: { chainKey: 'solana', from: 'OWNER' }, inner: { sponsored: true, messageBytes, lastValidBlockHeight: 123, blockhashSlot: 456 } }
	await expect(lookupSend(prepared, { kind: 'solana', signed: { txid: null, base64: '' } })).resolves.toEqual({ status: 'landed', txid: 'PAYER_SIG' })
	expect(lookupSponsoredSolanaTransaction).toHaveBeenCalledWith(expect.anything(), { owner: 'OWNER', messageBytes, lastValidBlockHeight: 123, blockhashSlot: 456 }, undefined)
	expect(lookupSolanaTransaction).not.toHaveBeenCalled()
})

// Antes EVM, Bitcoin y Stacks contestaban `unknown` sin preguntar: tras una difusión sin
// respuesta la pantalla se quedaba en «no pudimos confirmar» y quien repetía a mano pagaba dos veces
test('EVM: pregunta por el hash, el remitente y el nonce de la tx firmada', async () => {
	const prepared = { kind: 'evm', intent: { chainKey: 'bsc', from: '0xFROM' }, inner: { sponsored: false, tx: { nonce: 7 } } }
	await expect(lookupSend(prepared, { kind: 'evm', signed: { raw: '0x', hash: '0xhash' } })).resolves.toEqual({ status: 'landed', txid: '0xhash' })
	expect(lookupEvmTransaction).toHaveBeenCalledWith(expect.anything(), { hash: '0xhash', from: '0xFROM', nonce: 7 }, { signal: undefined })
})

test('EVM patrocinada (BSC): es la misma tx, con el mismo hash y nonce, y se pregunta igual', async () => {
	const prepared = { kind: 'evm', intent: { chainKey: 'bsc', from: '0xFROM' }, inner: { sponsored: true, tx: { nonce: 0 } } }
	await lookupSend(prepared, { kind: 'evm', signed: { raw: '0x', hash: '0xhash' } })
	expect(lookupEvmTransaction).toHaveBeenCalledWith(expect.anything(), { hash: '0xhash', from: '0xFROM', nonce: 0 }, { signal: undefined })
})

test('EVM sin nonce en la tx construida: no hay con qué preguntar → unknown', async () => {
	const prepared = { kind: 'evm', intent: { chainKey: 'bsc', from: '0xFROM' }, inner: { sponsored: false, tx: {} } }
	await expect(lookupSend(prepared, { kind: 'evm', signed: { raw: '0x', hash: '0xhash' } })).resolves.toEqual({ status: 'unknown' })
	expect(lookupEvmTransaction).not.toHaveBeenCalled()
})

test('Bitcoin: pregunta por el id y por los UTXOs que gasta', async () => {
	const inputs = [{ txid: 'aa', vout: 1, value: 5000n, confirmed: true }, { txid: 'bb', vout: 0, value: 700n, confirmed: false }]
	const prepared = { kind: 'btc', intent: { chainKey: 'bitcoin' }, inner: { selection: { inputs } } }
	await expect(lookupSend(prepared, { kind: 'btc', signed: { hex: '00', txid: 'TXID' } })).resolves.toEqual({ status: 'dropped' })
	expect(lookupBtcTransaction).toHaveBeenCalledWith(expect.anything(), { txid: 'TXID', inputs: [{ txid: 'aa', vout: 1 }, { txid: 'bb', vout: 0 }] }, { signal: undefined })
})

test('Stacks: pregunta por el id, el remitente y el nonce', async () => {
	const prepared = { kind: 'stacks', intent: { chainKey: 'stacks', from: 'SP1' }, inner: { sponsored: false, nonce: 12n } }
	await expect(lookupSend(prepared, { kind: 'stacks', signed: { hex: '00', txid: 'TXID' } })).resolves.toEqual({ status: 'dropped' })
	expect(lookupStacksTransaction).toHaveBeenCalledWith(expect.anything(), { txid: 'TXID', from: 'SP1', nonce: 12n }, { signal: undefined })
})

// Al co-firmarla el patrocinador su id cambia: el que tiene la app no existirá nunca en la cadena
test('Stacks patrocinada: no se pregunta por un id que va a cambiar → unknown', async () => {
	const prepared = { kind: 'stacks', intent: { chainKey: 'stacks', from: 'SP1' }, inner: { sponsored: true, nonce: 12n } }
	await expect(lookupSend(prepared, { kind: 'stacks', signed: { hex: '00', txid: 'TXID' } })).resolves.toEqual({ status: 'unknown' })
	expect(lookupStacksTransaction).not.toHaveBeenCalled()
})

test('firma y tx de familias distintas → unknown', async () => {
	const prepared = { kind: 'btc', intent: { chainKey: 'bitcoin' }, inner: { selection: { inputs: [] } } }
	await expect(lookupSend(prepared, { kind: 'evm', signed: { raw: '0x', hash: '0xhash' } })).resolves.toEqual({ status: 'unknown' })
})

// La referencia es lo que queda en disco para preguntar cuando la tx y su firma ya no existen
describe('referencia a un envío (`sentRefOf` / `lookupSentRef`)', () => {
	const HASH = `0x${'ab'.repeat(32)}`
	const FROM = `0x${'11'.repeat(20)}`
	const cases = {
		tron: [{ kind: 'tron', intent: { chainKey: 'tron' }, inner: { tx: { raw_data_hex: '0a02abcd' } } }, { kind: 'tron', signature: '00' }],
		evm: [{ kind: 'evm', intent: { chainKey: 'bsc', from: FROM }, inner: { sponsored: false, tx: { nonce: 7 } } }, { kind: 'evm', signed: { raw: '0x', hash: HASH } }],
		btc: [{ kind: 'btc', intent: { chainKey: 'bitcoin' }, inner: { selection: { inputs: [{ txid: 'ee'.repeat(32), vout: 1, value: 5n, confirmed: true }] } } }, { kind: 'btc', signed: { hex: '00', txid: 'cd'.repeat(32) } }],
		stacks: [{ kind: 'stacks', intent: { chainKey: 'stacks', from: 'SP1' }, inner: { sponsored: false, nonce: 12n } }, { kind: 'stacks', signed: { hex: '00', txid: 'cd'.repeat(32) } }],
		solana: [{ kind: 'solana', intent: { chainKey: 'solana', from: 'OWNER' }, inner: { sponsored: false, lastValidBlockHeight: 123, blockhashSlot: 456 } }, { kind: 'solana', signed: { txid: 'SIG', base64: '' } }],
		'solana-sponsored': [{ kind: 'solana', intent: { chainKey: 'solana', from: 'OWNER' }, inner: { sponsored: true, messageBytes: Uint8Array.from([1, 2, 3]), lastValidBlockHeight: 123, blockhashSlot: null } }, { kind: 'solana', signed: { txid: null, base64: '' } }],
	}

	test.each(Object.keys(cases))('%s: la referencia cabe en JSON y vuelve del disco igual', (kind) => {
		const [prepared, signed] = cases[kind]
		const ref = sentRefOf(prepared, signed)
		expect(ref.kind).toBe(kind)
		expect(parseSentRef(JSON.parse(JSON.stringify(ref)))).toEqual(ref)
	})

	test('preguntar con la referencia es preguntar lo mismo que con la tx y su firma', async () => {
		const [prepared, signed] = cases.evm
		await lookupSentRef(JSON.parse(JSON.stringify(sentRefOf(prepared, signed))))
		expect(lookupEvmTransaction).toHaveBeenCalledWith(expect.anything(), { hash: HASH, from: FROM, nonce: 7 }, { signal: undefined })

		const [stacks, stacksSigned] = cases.stacks
		await lookupSentRef(JSON.parse(JSON.stringify(sentRefOf(stacks, stacksSigned))))
		// El nonce viaja como texto (un bigint no cabe en JSON) y vuelve a ser bigint
		expect(lookupStacksTransaction).toHaveBeenCalledWith(expect.anything(), { txid: 'cd'.repeat(32), from: 'SP1', nonce: 12n }, { signal: undefined })

		const [sponsored, sponsoredSigned] = cases['solana-sponsored']
		await lookupSentRef(JSON.parse(JSON.stringify(sentRefOf(sponsored, sponsoredSigned))))
		const sent = lookupSponsoredSolanaTransaction.mock.calls[0][1]
		expect(Array.from(sent.messageBytes)).toEqual([1, 2, 3])
		expect(sent).toMatchObject({ owner: 'OWNER', lastValidBlockHeight: 123, blockhashSlot: null })
	})

	test('sin con qué preguntar no hay referencia: Stacks patrocinada, Solana sin firma, EVM sin nonce', () => {
		expect(sentRefOf({ kind: 'stacks', intent: { chainKey: 'stacks', from: 'SP1' }, inner: { sponsored: true, nonce: 12n } }, { kind: 'stacks', signed: { hex: '00', txid: 'TXID' } })).toBeNull()
		expect(sentRefOf({ kind: 'solana', intent: { chainKey: 'solana', from: 'OWNER' }, inner: { sponsored: false, lastValidBlockHeight: 1, blockhashSlot: 1 } }, { kind: 'solana', signed: { txid: null, base64: '' } })).toBeNull()
		expect(sentRefOf({ kind: 'evm', intent: { chainKey: 'bsc', from: FROM }, inner: { sponsored: false, tx: {} } }, { kind: 'evm', signed: { raw: '0x', hash: HASH } })).toBeNull()
	})
})
