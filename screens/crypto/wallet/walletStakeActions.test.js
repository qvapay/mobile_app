/**
 * A quién se pregunta si una tx de staking ya difundida entró: al adaptador de su cadena,
 * por el router. Lo que no se puede preguntar contesta `unknown`, que nunca deja firmar otra.
 * Y cómo se difunde: una llamada del router por paso (S-01).
 * @jest-environment node
 */
const mockCall = jest.fn((_chainKey, fn) => fn({ url: 'https://node.example' }, undefined))
jest.mock('../../../wallet/registry/appRpcRouter', () => ({ getAppRpcRouter: () => ({ call: mockCall }) }))
jest.mock('./walletSendActions', () => ({ withWalletKey: jest.fn() }))
jest.mock('../../../wallet/solana/stake', () => ({
	solanaStakeAdapter: {
		lookup: jest.fn(async () => ({ status: 'landed', txid: 'SIG' })),
		broadcast: jest.fn(async () => ({ txid: 'SIG', duplicate: false })),
	},
}))
jest.mock('../../../wallet/tron/stake', () => ({
	tronStakeAdapter: {
		accept: jest.fn(() => true),
		lookup: jest.fn(async () => ({ status: 'landed', txid: 'FREEZE', note: 'votePending' })),
		broadcast: jest.fn(async () => ({ txid: 'FREEZE', duplicate: false })),
		// Como el de verdad: una lectura (que puede rotar de nodo) y el voto
		followUp: jest.fn(async (run, _inner, _signed, result) => {
			await run(async () => 'cuenta', { idempotent: true })
			await run(async () => 'voto')
			return result
		}),
	},
}))

const { solanaStakeAdapter } = require('../../../wallet/solana/stake')
const { tronStakeAdapter } = require('../../../wallet/tron/stake')
const { broadcastStake, lookupStake } = require('./walletStakeActions')

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

describe('difundir', () => {
	test('Solana: una sola llamada del router, que no es una lectura', async () => {
		const prepared = { kind: 'solana', intent: { chainKey: 'solana', action: 'stake' }, inner: { id: 'inner' } }
		await expect(broadcastStake(prepared, { kind: 'solana', signed: { txid: 'SIG' } })).resolves.toEqual({ txid: 'SIG', duplicate: false })
		expect(solanaStakeAdapter.broadcast).toHaveBeenCalledWith({ url: 'https://node.example' }, { id: 'inner' }, { txid: 'SIG' }, { signal: undefined })
		expect(mockCall).toHaveBeenCalledTimes(1)
		expect(mockCall.mock.calls[0][2]).toEqual({})
	})

	// S-01: en una sola llamada, la espera al TRON Power agotaba el tiempo y el voto no salía
	test('TRON stake: el congelado, la espera y el voto van en llamadas DISTINTAS del router', async () => {
		const prepared = { kind: 'tron', intent: { chainKey: 'tron', action: 'stake' }, inner: { txs: [] } }
		const signed = { kind: 'tron', signed: { signatures: [] } }
		await expect(broadcastStake(prepared, signed)).resolves.toEqual({ txid: 'FREEZE', duplicate: false })
		expect(tronStakeAdapter.followUp).toHaveBeenCalledWith(expect.any(Function), prepared.inner, signed.signed, { txid: 'FREEZE', duplicate: false })
		expect(mockCall).toHaveBeenCalledTimes(3)
		expect(mockCall.mock.calls.every(call => call[0] === 'tron')).toBe(true)
		const options = mockCall.mock.calls.map(call => call[2])
		// Solo la lectura puede repetirse en otro nodo ante cualquier error
		expect(options.map(option => option.idempotent === true)).toEqual([false, true, false])
		// Y las tres van solo por los nodos que el adaptador acepta
		options.forEach(option => expect(option.accept({ url: 'https://node.example' })).toBe(true))
	})

	test('si el congelado no sale, no hay segunda parte', async () => {
		tronStakeAdapter.broadcast.mockRejectedValueOnce(new Error('sin nodos'))
		const prepared = { kind: 'tron', intent: { chainKey: 'tron', action: 'stake' }, inner: { txs: [] } }
		await expect(broadcastStake(prepared, { kind: 'tron', signed: { signatures: [] } })).rejects.toThrow('sin nodos')
		expect(tronStakeAdapter.followUp).not.toHaveBeenCalled()
	})

	test('firma y tx de cadenas distintas: no se difunde nada', async () => {
		const prepared = { kind: 'solana', intent: { chainKey: 'solana', action: 'stake' }, inner: {} }
		await expect(broadcastStake(prepared, { kind: 'tron', signed: {} })).rejects.toThrow('cadenas distintas')
		expect(mockCall).not.toHaveBeenCalled()
	})
})
