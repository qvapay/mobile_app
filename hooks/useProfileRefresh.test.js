/**
 * Releer el perfil lo vuelca en el AuthContext: lo que se completa fuera de la app
 * (vincular Telegram en el bot) llega a las pantallas que deciden por el perfil.
 * @jest-environment node
 */
const mockUpdateUser = jest.fn()
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ updateUser: mockUpdateUser }) }))
jest.mock('../api/userApi', () => ({ userApi: { getUserProfile: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { userApi } from '../api/userApi'
import useProfileRefresh from './useProfileRefresh'

let client
let refresh
const Probe = () => { refresh = useProfileRefresh(); return null }

beforeEach(async () => {
	jest.clearAllMocks()
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	await act(async () => { create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>) })
})
afterEach(() => { client.clear() })

test('vuelca el perfil nuevo en el contexto y en la caché del Home', async () => {
	const profile = { uuid: 'u', telegram_id: 123 }
	userApi.getUserProfile.mockResolvedValue({ success: true, data: profile })
	await expect(refresh()).resolves.toEqual(profile)
	expect(mockUpdateUser).toHaveBeenCalledWith(profile)
	expect(client.getQueryData(['home', 'profile'])).toEqual(profile)
})

test('siempre pregunta al servidor, aunque la caché sea reciente', async () => {
	client.setQueryData(['home', 'profile'], { uuid: 'u', telegram_id: null })
	userApi.getUserProfile.mockResolvedValue({ success: true, data: { uuid: 'u', telegram_id: 123 } })
	await refresh()
	expect(userApi.getUserProfile).toHaveBeenCalledTimes(1)
	expect(mockUpdateUser).toHaveBeenCalledWith({ uuid: 'u', telegram_id: 123 })
})

test('un fallo deja el contexto como estaba', async () => {
	userApi.getUserProfile.mockResolvedValue({ success: false, error: 'x' })
	await expect(refresh()).resolves.toBeNull()
	expect(mockUpdateUser).not.toHaveBeenCalled()
})
