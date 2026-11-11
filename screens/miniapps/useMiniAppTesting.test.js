/**
 * useMiniAppTesting — responder invitaciones (una a la vez, 404 = ya no
 * existe) y dejar de probar (404 también cuenta como hecho), con la caché al día.
 * @jest-environment node
 */
jest.mock('../../api/miniappsApi', () => ({ miniappsApi: { answerInvite: jest.fn(), leaveTesting: jest.fn() } }))
jest.mock('sonner-native', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import { miniappsApi } from '../../api/miniappsApi'
import useMiniAppTesting from './useMiniAppTesting'
import { MINIAPPS_INVITES_KEY, MINIAPPS_LIST_KEY } from './miniappsQueries'

const invite = (slug, name = slug) => ({ slug, name, invited_by: { username: 'pepe' } })

let queryClient
let hook
let tree

const Harness = () => {
	hook = useMiniAppTesting()
	return null
}

const mount = () => {
	act(() => { tree = create(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>) })
}

beforeEach(() => {
	jest.clearAllMocks()
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
	queryClient.setQueryData(MINIAPPS_INVITES_KEY, [invite('shop', 'Mi Tienda'), invite('other')])
	queryClient.setQueryData(MINIAPPS_LIST_KEY, [{ slug: 'shop' }, { slug: 'live' }])
	mount()
})

afterEach(() => {
	act(() => { tree.unmount() })
	queryClient.clear()
})

describe('answer', () => {

	test('aceptar: fuera de la lista, el directorio se revalida y sin toast (se abre la mini-app)', async () => {
		miniappsApi.answerInvite.mockResolvedValueOnce({ success: true, data: { status: 'accepted' }, status: 200 })
		let result
		await act(async () => { result = await hook.answer(invite('shop', 'Mi Tienda'), true) })
		expect(result).toBe(true)
		expect(miniappsApi.answerInvite).toHaveBeenCalledWith('shop', true)
		expect(queryClient.getQueryData(MINIAPPS_INVITES_KEY)).toEqual([invite('other')])
		expect(queryClient.getQueryState(MINIAPPS_LIST_KEY).isInvalidated).toBe(true)
		expect(toast).not.toHaveBeenCalled()
		expect(toast.error).not.toHaveBeenCalled()
	})

	test('rechazar avisa con el nombre', async () => {
		miniappsApi.answerInvite.mockResolvedValueOnce({ success: true, data: { status: 'declined' }, status: 200 })
		await act(async () => { await hook.answer(invite('shop', 'Mi Tienda'), false) })
		expect(miniappsApi.answerInvite).toHaveBeenCalledWith('shop', false)
		expect(toast).toHaveBeenCalledWith('Rechazaste la invitación a Mi Tienda')
		expect(queryClient.getQueryData(MINIAPPS_INVITES_KEY)).toEqual([invite('other')])
	})

	test('404: la invitación ya no existe, se quita y se avisa', async () => {
		miniappsApi.answerInvite.mockResolvedValueOnce({ success: false, error: 'Invitación no encontrada', status: 404, details: { code: 'INVITE_NOT_FOUND' } })
		let result
		await act(async () => { result = await hook.answer(invite('shop'), true) })
		expect(result).toBe(false)
		expect(toast.error).toHaveBeenCalledWith('Esta invitación ya no está disponible')
		expect(queryClient.getQueryData(MINIAPPS_INVITES_KEY)).toEqual([invite('other')])
	})

	test('otro fallo: la tarjeta se queda para reintentar', async () => {
		miniappsApi.answerInvite.mockResolvedValueOnce({ success: false, error: 'Ha ocurrido un error, contacte a soporte', status: undefined })
		let result
		await act(async () => { result = await hook.answer(invite('shop'), true) })
		expect(result).toBe(false)
		expect(toast.error).toHaveBeenCalledWith(expect.any(String), { description: 'Ha ocurrido un error, contacte a soporte' })
		expect(queryClient.getQueryData(MINIAPPS_INVITES_KEY)).toHaveLength(2)
	})

	test('una respuesta a la vez: el segundo toque no manda nada y `pending` pinta la que va en vuelo', async () => {
		let resolve
		miniappsApi.answerInvite.mockReturnValueOnce(new Promise(r => { resolve = r }))
		let first
		act(() => { first = hook.answer(invite('shop'), true) })
		expect(hook.pending).toEqual({ slug: 'shop', accept: true })

		let second
		await act(async () => { second = await hook.answer(invite('other'), false) })
		expect(second).toBe(false)
		expect(miniappsApi.answerInvite).toHaveBeenCalledTimes(1)

		await act(async () => {
			resolve({ success: true, data: { status: 'accepted' }, status: 200 })
			await first
		})
		expect(hook.pending).toBeNull()

		// Ya libre: la siguiente sí sale
		miniappsApi.answerInvite.mockResolvedValueOnce({ success: true, data: { status: 'declined' }, status: 200 })
		await act(async () => { await hook.answer(invite('other'), false) })
		expect(miniappsApi.answerInvite).toHaveBeenCalledTimes(2)
	})
})

describe('leave', () => {

	test('fuera del directorio y aviso', async () => {
		miniappsApi.leaveTesting.mockResolvedValueOnce({ success: true, data: { left: true }, status: 200 })
		let result
		await act(async () => { result = await hook.leave({ slug: 'shop', name: 'Mi Tienda' }) })
		expect(result).toBe(true)
		expect(miniappsApi.leaveTesting).toHaveBeenCalledWith('shop')
		expect(queryClient.getQueryData(MINIAPPS_LIST_KEY)).toEqual([{ slug: 'live' }])
		expect(toast.success).toHaveBeenCalledWith('Ya no pruebas Mi Tienda')
	})

	test('404 (la mini-app ya no existe) también cuenta como hecho', async () => {
		miniappsApi.leaveTesting.mockResolvedValueOnce({ success: false, error: 'No encontrada', status: 404 })
		let result
		await act(async () => { result = await hook.leave({ slug: 'shop', name: 'Mi Tienda' }) })
		expect(result).toBe(true)
		expect(queryClient.getQueryData(MINIAPPS_LIST_KEY)).toEqual([{ slug: 'live' }])
	})

	test('cualquier otro fallo: se queda y se avisa', async () => {
		miniappsApi.leaveTesting.mockResolvedValueOnce({ success: false, error: 'No se ha podido conectar con el servidor', status: undefined })
		let result
		await act(async () => { result = await hook.leave({ slug: 'shop', name: 'Mi Tienda' }) })
		expect(result).toBe(false)
		expect(toast.error).toHaveBeenCalledWith(expect.any(String), { description: 'No se ha podido conectar con el servidor' })
		expect(queryClient.getQueryData(MINIAPPS_LIST_KEY)).toHaveLength(2)
	})
})
