/**
 * A quién se pregunta si una tx de staking ya difundida entró: al adaptador de su cadena,
 * por el router. Lo que no se puede preguntar contesta `unknown`, que nunca deja firmar otra.
 * @jest-environment node
 */
const mockCall = jest.fn((_chainKey, fn) => fn({ url: 'https://node.example' }, undefined))
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ getAppRpcRouter: () => ({ call: mockCall }) }))
jest.mock('./walletSendActions', () => ({ withWalletKey: jest.fn() }))
jest.mock('../../../wallet/solana/stake', () => ({ solanaStakeAdapter: { lookup: jest.fn(async () => ({ status: 'landed', txid: 'SIG' })) } }))
jest.mock('../../../wallet/tron/stake', () => ({ tronStakeAdapter: { accept: jest.fn(() => true), lookup: jest.fn(async () => ({ status: 'landed', txid: 'FREEZE', note: 'votePending' })) } }))

const { solanaStakeAdapter } = require('../../../wallet/solana/stake')
const { tronStakeAdapter } = require('../../../wallet/tron/stake')
const { lookupStake } = require('./walletStakeActions')

beforeEach(() => { jest.clearAllMocks() })

test('Solana: pregunta al adaptador con la tx preparada y su firma, como lectura (puede rotar de nodo)', async () => {
	const prepared = { kind: 'solana', intent: { chainKey: 'solana', action: 'stake' }, inner: { id: 'inner' } }
	const signed = { kind: 'solana', signed: { txid: 'SIG' } }
	await expect(lookupStake(prepared, signed)).resolves.toEqual({ status: 'landed', txid: 'SIG' })
	expect(solanaStakeAdapter.lookup).toHaveBeenCalledWith({ url: 'https://node.example' }, { id: 'inner' }, { txid: 'SIG' }, { signal: undefined })
	expect(mockCall.mock.calls[0][0]).toBe('solana')
	expect(mockCall.mock.calls[0][2]).toEqual({ idempotent: true })
})

test('TRON: solo por los nodos que el adaptador acepta, y la nota del voto llega tal cual', async () => {
	const prepared = { kind: 'tron', intent: { chainKey: 'tron', action: 'stake' }, inner: { txs: [] } }
	await expect(lookupStake(prepared, { kind: 'tron', signed: { signatures: [] } })).resolves.toEqual({ status: 'landed', txid: 'FREEZE', note: 'votePending' })
	const options = mockCall.mock.calls[0][2]
	expect(options.idempotent).toBe(true)
	expect(options.accept({ url: 'https://node.example' })).toBe(true)
	expect(tronStakeAdapter.accept).toHaveBeenCalled()
})

test('firma y tx de cadenas distintas → unknown, sin preguntar', async () => {
	const prepared = { kind: 'solana', intent: { chainKey: 'solana', action: 'stake' }, inner: {} }
	await expect(lookupStake(prepared, { kind: 'tron', signed: {} })).resolves.toEqual({ status: 'unknown' })
	expect(mockCall).not.toHaveBeenCalled()
})

test('una cadena sin adaptador (Stacks, aparcada) → unknown', async () => {
	const prepared = { kind: 'stacks', intent: { chainKey: 'stacks', action: 'stake' }, inner: {} }
	await expect(lookupStake(prepared, { kind: 'stacks', signed: {} })).resolves.toEqual({ status: 'unknown' })
	expect(mockCall).not.toHaveBeenCalled()
})
