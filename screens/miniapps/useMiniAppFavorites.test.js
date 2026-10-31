/**
 * Hook de favoritas: marcar publica los accesos rápidos en el acto (el Home,
 * que también los publica, está congelado fuera de foco) y solo con el
 * directorio en caché y las guardadas ya leídas.
 * @jest-environment node
 */
jest.mock('../../api/miniappsApi', () => ({ miniappsApi: {} }))
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../helpers/miniAppShortcuts', () => ({ setMiniAppQuickActions: jest.fn() }))
jest.mock('sonner-native', () => ({ toast: { success: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useMiniAppFavorites from './useMiniAppFavorites'
import { MINIAPPS_LIST_KEY } from './miniappsQueries'
import { useAuth } from '../../auth/AuthContext'
import { setMiniAppQuickActions } from '../../helpers/miniAppShortcuts'
import { toast } from 'sonner-native'

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 20)))
const app = (slug, extra = {}) => ({ slug, name: slug, icon: `apps/${slug}.png`, featured: false, ...extra })

let queryClient
let tree
let hook
const Probe = () => {
	hook = useMiniAppFavorites()
	return null
}
const render = async (uuid = 'u1') => {
	useAuth.mockReturnValue({ user: uuid ? { uuid } : null })
	await act(async () => {
		tree = create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>)
	})
	await settle()
}

beforeEach(() => {
	jest.clearAllMocks()
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
	act(() => { tree?.unmount() })
	queryClient.clear()
})

test('marcar y desmarcar publica los accesos rápidos al momento', async () => {
	queryClient.setQueryData(MINIAPPS_LIST_KEY, [app('a'), app('b')])
	await render()
	expect(hook.ready).toBe(true)
	act(() => { hook.toggle(app('b')) })
	expect(setMiniAppQuickActions).toHaveBeenLastCalledWith([{ slug: 'b', name: 'b', icon: 'apps/b.png' }])
	expect(toast.success).toHaveBeenLastCalledWith('b está en tus favoritas')
	expect(hook.isFavorite('b')).toBe(true)
	act(() => { hook.toggle(app('b')) })
	expect(setMiniAppQuickActions).toHaveBeenLastCalledWith([])
	expect(hook.favorites).toEqual([])
})

test('sin directorio en caché no publica (lo hará el Home al cargarlo)', async () => {
	await render()
	act(() => { hook.toggle(app('a')) })
	expect(setMiniAppQuickActions).not.toHaveBeenCalled()
	act(() => { hook.toggle(app('a')) })
})

test('sin sesión no hace nada', async () => {
	queryClient.setQueryData(MINIAPPS_LIST_KEY, [app('a')])
	await render(null)
	act(() => { hook.toggle(app('a')) })
	expect(hook.favorites).toEqual([])
	expect(setMiniAppQuickActions).not.toHaveBeenCalled()
	expect(toast.success).not.toHaveBeenCalled()
})
