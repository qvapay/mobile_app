/**
 * A quién se pregunta si un paso de swap ya difundido entró: a la cadena, en todas las
 * familias, igual que en Enviar. Antes EVM y Bitcoin contestaban `unknown` sin preguntar.
 * @jest-environment node
 */
jest.mock('../../../wallet/registry/appRpcRouter', () => ({
	getAppRpcRouter: () => ({ call: (_chainKey, fn) => fn({ url: 'https://node.example' }, undefined) }),
}))
jest.mock('../../../wallet/evm/tx', () => ({ ...jest.requireActual('../../../wallet/evm/tx'), lookupEvmTransaction: jest.fn(async () => ({ status: 'landed', txid: '0xhash' })) }))
jest.mock('../../../wallet/btc/tx', () => ({ ...jest.requireActual('../../../wallet/btc/tx'), lookupBtcTransaction: jest.fn(async () => ({ status: 'dropped' })) }))
jest.mock('../../../wallet/tron/tx', () => ({ ...jest.requireActual('../../../wallet/tron/tx'), lookupTronTransaction: jest.fn(async () => ({ status: 'dropped' })) }))
jest.mock('../../../wallet/solana/tx', () => ({ ...jest.requireActual('../../../wallet/solana/tx'), lookupSolanaTransaction: jest.fn(async () => ({ status: 'unknown' })) }))

const { lookupEvmTransaction } = require('../../../wallet/evm/tx')
const { lookupBtcTransaction } = require('../../../wallet/btc/tx')
const { lookupTronTransaction } = require('../../../wallet/tron/tx')
const { lookupSolanaTransaction } = require('../../../wallet/solana/tx')
const { lookupOnchainSwap } = require('./walletSwapActions')

beforeEach(() => { jest.clearAllMocks() })

test('EVM (permiso o swap): pregunta por el hash, quien firma y el nonce de ese paso', async () => {
	const prepared = { family: 'evm', chainKey: 'base', inner: { step: 'swap', intent: { owner: '0xOWNER' }, tx: { nonce: 4 } } }
	await expect(lookupOnchainSwap(prepared, { family: 'evm', signed: { raw: '0x', hash: '0xhash' } })).resolves.toEqual({ status: 'landed', txid: '0xhash' })
	expect(lookupEvmTransaction).toHaveBeenCalledWith(expect.anything(), { hash: '0xhash', from: '0xOWNER', nonce: 4 }, { signal: undefined })
})

test('EVM sin nonce en la tx construida → unknown, sin preguntar', async () => {
	const prepared = { family: 'evm', chainKey: 'base', inner: { step: 'swap', intent: { owner: '0xOWNER' }, tx: {} } }
	await expect(lookupOnchainSwap(prepared, { family: 'evm', signed: { raw: '0x', hash: '0xhash' } })).resolves.toEqual({ status: 'unknown' })
	expect(lookupEvmTransaction).not.toHaveBeenCalled()
})

test('Bitcoin (THORChain): pregunta por el id y los UTXOs que gasta', async () => {
	const prepared = { family: 'btc', chainKey: 'bitcoin', inner: { selection: { inputs: [{ txid: 'aa', vout: 2, value: 9000n, confirmed: true }] } } }
	await expect(lookupOnchainSwap(prepared, { family: 'btc', signed: { hex: '00', txid: 'TXID' } })).resolves.toEqual({ status: 'dropped' })
	expect(lookupBtcTransaction).toHaveBeenCalledWith(expect.anything(), { txid: 'TXID', inputs: [{ txid: 'aa', vout: 2 }] }, { signal: undefined })
})

test('TRON y Solana siguen preguntando como antes', async () => {
	await expect(lookupOnchainSwap({ family: 'tron', chainKey: 'tron', inner: { tx: { raw_data_hex: 'abcd' } } }, { family: 'tron', signature: '00' })).resolves.toEqual({ status: 'dropped' })
	expect(lookupTronTransaction).toHaveBeenCalledWith(expect.anything(), 'abcd', { signal: undefined })
	const solana = { family: 'solana', chainKey: 'solana', inner: { intent: { owner: 'OWNER' }, lastValidBlockHeight: 9, blockhashSlot: 8 } }
	await expect(lookupOnchainSwap(solana, { family: 'solana', signed: { txid: 'SIG', base64: '' } })).resolves.toEqual({ status: 'unknown' })
	expect(lookupSolanaTransaction).toHaveBeenCalledWith(expect.anything(), { signature: 'SIG', owner: 'OWNER', lastValidBlockHeight: 9, blockhashSlot: 8 }, undefined)
})

test('firma y tx de familias distintas → unknown', async () => {
	const prepared = { family: 'btc', chainKey: 'bitcoin', inner: { selection: { inputs: [] } } }
	await expect(lookupOnchainSwap(prepared, { family: 'evm', signed: { raw: '0x', hash: '0xhash' } })).resolves.toEqual({ status: 'unknown' })
})
