/**
 * usePeerUuid: el uuid del perfil que abre P2PUser, venga la ruta con uuid o con @usuario.
 * @jest-environment node
 */
jest.mock('../../api/userApi', () => ({ userApi: { searchUser: jest.fn() } }))
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { userApi } from '../../api/userApi'
import { useAuth } from '../../auth/AuthContext'
import usePeerUuid from './usePeerUuid'

const LUKE = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'
const ME = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

let clients = []
let trees = []
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)) })

const renderHook = async (params) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	const result = { current: null }
	const Harness = () => { result.current = usePeerUuid(params); return null }
	await act(async () => { trees.push(create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)) })
	await settle()
	return result
}

beforeEach(() => {
	jest.clearAllMocks()
	useAuth.mockReturnValue({ user: { uuid: ME, username: 'erich' } })
})

afterEach(async () => {
	await act(async () => { for (const tree of trees) tree.unmount() })
	for (const client of clients) { client.clear(); client.unmount() }
	trees = []
	clients = []
})

test('con uuid en la ruta no busca nada', async () => {
	const result = await renderHook({ uuid: LUKE })
	expect(result.current).toMatchObject({ uuid: LUKE, notFound: false, error: null })
	expect(userApi.searchUser).not.toHaveBeenCalled()
})

test('un uuid sin forma no llega a la API: no hay perfil', async () => {
	const result = await renderHook({ uuid: '../../user/extended' })
	expect(result.current).toMatchObject({ uuid: '', notFound: true })
	expect(userApi.searchUser).not.toHaveBeenCalled()
})

test('por @usuario: busca en silencio y se queda con la coincidencia exacta', async () => {
	userApi.searchUser.mockResolvedValue({ success: true, data: [{ uuid: ME, username: 'lukewarm' }, { uuid: LUKE, username: 'Luke' }] })
	const result = await renderHook({ username: '@luke' })
	expect(userApi.searchUser).toHaveBeenCalledWith('luke', { silent: true })
	expect(result.current).toMatchObject({ uuid: LUKE, username: 'luke', notFound: false, error: null })
})

test('un @usuario que no existe es «no encontrado», no un error', async () => {
	userApi.searchUser.mockResolvedValue({ success: true, data: [{ uuid: ME, username: 'lukewarm' }] })
	const result = await renderHook({ username: 'luke' })
	expect(result.current).toMatchObject({ uuid: '', username: 'luke', notFound: true, error: null })
})

test('si la búsqueda falla se puede reintentar', async () => {
	userApi.searchUser.mockResolvedValue({ success: false, error: 'No se ha podido conectar con el servidor' })
	const result = await renderHook({ username: 'luke' })
	expect(result.current).toMatchObject({ uuid: '', notFound: false, error: 'No se ha podido conectar con el servidor' })
	userApi.searchUser.mockResolvedValue({ success: true, data: [{ uuid: LUKE, username: 'luke' }] })
	await act(async () => { result.current.retry() })
	await settle()
	expect(result.current).toMatchObject({ uuid: LUKE, error: null })
})

test('el perfil propio sale de la sesión, sin buscar', async () => {
	const result = await renderHook({ username: 'Erich' })
	expect(result.current).toMatchObject({ uuid: ME, notFound: false })
	expect(userApi.searchUser).not.toHaveBeenCalled()
})

test('un username sin forma no se busca', async () => {
	const result = await renderHook({ username: 'a b/c' })
	expect(result.current).toMatchObject({ uuid: '', notFound: true })
	expect(userApi.searchUser).not.toHaveBeenCalled()
})
