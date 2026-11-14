/**
 * A quién se pregunta si un envío ya difundido entró. Solo TRON y Solana (las que caducan)
 * consultan la cadena; el resto contesta `unknown`, nunca `dropped`: `dropped` es lo único
 * que deja firmar otra tx, y sin pruebas sería un segundo pago.
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

const { lookupTronTransaction } = require('../../../wallet/tron/tx')
const { lookupSolanaTransaction, lookupSponsoredSolanaTransaction } = require('../../../wallet/solana/tx')
const { lookupSend } = require('./walletSendActions')

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

test.each(['evm', 'btc', 'stacks'])('%s no caduca: unknown, se re-difunde la misma tx', async (kind) => {
	await expect(lookupSend({ kind, intent: { chainKey: kind }, inner: {} }, { kind })).resolves.toEqual({ status: 'unknown' })
})
