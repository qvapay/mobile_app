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
jest.mock('../../../wallet/solana/tx', () => ({ ...jest.requireActual('../../../wallet/solana/tx'), lookupSolanaTransaction: jest.fn(async () => ({ status: 'dropped' })) }))

const { lookupTronTransaction } = require('../../../wallet/tron/tx')
const { lookupSolanaTransaction } = require('../../../wallet/solana/tx')
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

test('Solana patrocinada: su id es la firma del pagador de QvaPay, que la app no tiene → unknown', async () => {
	const prepared = { kind: 'solana', intent: { chainKey: 'solana' }, inner: { sponsored: true, lastValidBlockHeight: 123 } }
	await expect(lookupSend(prepared, { kind: 'solana', signed: { txid: null, base64: '' } })).resolves.toEqual({ status: 'unknown' })
	expect(lookupSolanaTransaction).not.toHaveBeenCalled()
})

test.each(['evm', 'btc', 'stacks'])('%s no caduca: unknown, se re-difunde la misma tx', async (kind) => {
	await expect(lookupSend({ kind, intent: { chainKey: kind }, inner: {} }, { kind })).resolves.toEqual({ status: 'unknown' })
})
