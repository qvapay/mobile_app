/**
 * Foto en disco de saldos/staking de la wallet: ida y vuelta, siembra sin
 * pisar memoria, fuera del persister y borrado al eliminar la wallet.
 * @jest-environment node
 */
const mockStore = new Map()
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(async key => mockStore.get(key) ?? null),
	setItem: jest.fn(async (key, value) => { mockStore.set(key, value) }),
	removeItem: jest.fn(async key => { mockStore.delete(key) }),
	getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}))

import { QueryClient } from '@tanstack/react-query'
import { shouldPersistQuery } from '../../../api/queryClient'

const BALANCES_KEY = ['wallet', 'balances', '0xabc', 'T1', 'bc1']
const STAKING_KEY = ['wallet', 'staking', 'solana', 'So1']

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

// Estado de módulo (espejos y cola): un módulo fresco por test, el "disco" compartido
const freshModule = () => {
	let mod
	jest.isolateModules(() => { mod = require('./walletDiskCache') })
	return mod
}

afterEach(() => mockStore.clear())

test('lo guardado vuelve a React Query tras un arranque en frío, bigint incluido', async () => {
	const first = freshModule()
	first.saveWalletQuery('0xabc', BALANCES_KEY, { balances: { 'tron:native': '1500000' }, failedChains: [], updatedAt: 1 })
	first.saveWalletQuery('0xabc', STAKING_KEY, { positions: [{ amount: 123456789012345678901n }], updatedAt: 1 })
	await flush()

	const coldStart = freshModule()
	const client = new QueryClient()
	await coldStart.primeWalletQueries(client, '0xabc')

	expect(client.getQueryData(BALANCES_KEY).balances['tron:native']).toBe('1500000')
	expect(client.getQueryData(STAKING_KEY).positions[0].amount).toBe(123456789012345678901n)
	// Nace vieja: se pinta y se revalida al montar
	expect(client.getQueryState(BALANCES_KEY).isInvalidated || client.getQueryState(BALANCES_KEY).dataUpdatedAt < Date.now()).toBe(true)
	client.clear()
})

test('lo sembrado no entra al persister de React Query', async () => {
	const first = freshModule()
	first.saveWalletQuery('0xabc', BALANCES_KEY, { balances: {}, failedChains: [], updatedAt: 1 })
	await flush()

	const client = new QueryClient()
	await freshModule().primeWalletQueries(client, '0xabc')
	const query = client.getQueryCache().find({ queryKey: BALANCES_KEY })
	expect(shouldPersistQuery(query)).toBe(false)
	client.clear()
})

test('no pisa datos que ya están en memoria', async () => {
	const first = freshModule()
	first.saveWalletQuery('0xabc', BALANCES_KEY, { balances: { a: '1' }, failedChains: [], updatedAt: 1 })
	await flush()

	const client = new QueryClient()
	client.setQueryData(BALANCES_KEY, { balances: { a: '2' }, failedChains: [], updatedAt: 2 })
	await freshModule().primeWalletQueries(client, '0xabc')
	expect(client.getQueryData(BALANCES_KEY).balances.a).toBe('2')
	client.clear()
})

test('eliminar la wallet borra la foto y un guardado en vuelo no la resucita', async () => {
	const mod = freshModule()
	mod.saveWalletQuery('0xabc', BALANCES_KEY, { balances: { a: '1' }, failedChains: [], updatedAt: 1 })
	await mod.clearWalletSnapshots()
	await flush()
	expect([...mockStore.keys()].filter(k => k.startsWith('@qpwallet:snapshot:'))).toEqual([])

	const client = new QueryClient()
	await freshModule().primeWalletQueries(client, '0xabc')
	expect(client.getQueryData(BALANCES_KEY)).toBeUndefined()
	client.clear()
})
