/**
 * La parte LENTA de los saldos: el SOL en stake accounts creadas con otra wallet. Buscarlas
 * tardaba 6,5 s en nuestro nodo y, dentro de la pasada, retrasaba todos los saldos; ahora se
 * pide aparte. Lo que aquí importa: que no cuente dos veces las de semilla (esas las lee la
 * pasada) y que una lista incompleta nunca se dé por buena.
 * @jest-environment node
 */
jest.mock('../solana/stake', () => ({
	MAX_STAKE_SEEDS: 16,
	stakeAccountFor: (owner, index) => `${owner}-semilla-${index}`,
	readSolanaAllStakeAccounts: jest.fn(),
	readSolanaSeedStakeAccounts: jest.fn(),
}))

import { fetchSlowBalances, stakedForeignId } from './index'
import { readSolanaAllStakeAccounts, readSolanaSeedStakeAccounts } from '../solana/stake'

const OWNER = 'DUEÑO'
const ADDRESSES = { evm: '0xabc', tron: 'T1', btc: 'bc1', stx: 'SP1', stxPublicKey: '', sol: OWNER }
const NODE_A = { url: 'https://sol-a', priority: 0, owner: 'qvapay' }
const NODE_B = { url: 'https://sol-b', priority: 10, owner: 'x' }

const registryWith = (chains) => ({ version: 1, updated_at: '', chains })
const SOLANA = { kind: 'solana', native: { symbol: 'SOL', decimals: 9 }, explorer: '', rpcs: [NODE_A, NODE_B] }
const BSC = { kind: 'evm', native: { symbol: 'BNB', decimals: 18 }, explorer: '', rpcs: [{ url: 'https://bsc', priority: 10, owner: 'x' }] }

// Como el router de la app: prueba cada nodo en orden y rota si el anterior falla
const routerFor = (registry) => ({
	call: async (chainKey, fn) => {
		let last
		for (const rpc of registry.chains[chainKey].rpcs) {
			try { return await fn(rpc, new AbortController().signal) } catch (err) { last = err }
		}
		throw last
	},
})

beforeEach(() => { jest.clearAllMocks() })

test('cuenta solo lo que NO es de semilla: lo de semilla ya lo trae la pasada', async () => {
	const registry = registryWith({ bsc: BSC, solana: SOLANA })
	readSolanaAllStakeAccounts.mockResolvedValue([
		{ address: `${OWNER}-semilla-0`, lamports: 5n },
		{ address: 'cuenta-de-otra-wallet', lamports: 7n },
		{ address: `${OWNER}-semilla-15`, lamports: 11n },
		{ address: 'otra-mas', lamports: 3n },
	])
	await expect(fetchSlowBalances(routerFor(registry), registry, ADDRESSES)).resolves.toEqual({ [stakedForeignId('solana:native')]: '10' })
	expect(readSolanaAllStakeAccounts).toHaveBeenCalledWith(NODE_A, OWNER, expect.objectContaining({ signal: expect.anything() }))
	// La lectura rápida es cosa de la pasada, no de esta
	expect(readSolanaSeedStakeAccounts).not.toHaveBeenCalled()
})

test('sin cuentas de otras wallets la parte vale 0 (y así borra una que ya se retiró)', async () => {
	const registry = registryWith({ solana: SOLANA })
	readSolanaAllStakeAccounts.mockResolvedValue([{ address: `${OWNER}-semilla-3`, lamports: 5n }])
	await expect(fetchSlowBalances(routerFor(registry), registry, ADDRESSES)).resolves.toEqual({ [stakedForeignId('solana:native')]: '0' })
})

test('si un nodo no deja buscar, se prueba otro', async () => {
	const registry = registryWith({ solana: SOLANA })
	readSolanaAllStakeAccounts
		.mockRejectedValueOnce(new Error('excluded from account secondary indexes'))
		.mockResolvedValueOnce([{ address: 'cuenta-de-otra-wallet', lamports: 7n }])
	await expect(fetchSlowBalances(routerFor(registry), registry, ADDRESSES)).resolves.toEqual({ [stakedForeignId('solana:native')]: '7' })
	expect(readSolanaAllStakeAccounts.mock.calls.map(([rpc]) => rpc.url)).toEqual(['https://sol-a', 'https://sol-b'])
})

test('si ningún nodo deja buscar, lanza: un 0 borraría lo que ya se sabía', async () => {
	const registry = registryWith({ solana: SOLANA })
	readSolanaAllStakeAccounts.mockRejectedValue(new Error('excluded from account secondary indexes'))
	await expect(fetchSlowBalances(routerFor(registry), registry, ADDRESSES)).rejects.toThrow('excluded')
})

test('sin Solana en el registro no pide nada', async () => {
	const registry = registryWith({ bsc: BSC })
	await expect(fetchSlowBalances(routerFor(registry), registry, ADDRESSES)).resolves.toEqual({})
	expect(readSolanaAllStakeAccounts).not.toHaveBeenCalled()
})
