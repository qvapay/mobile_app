/**
 * Bloquear/desbloquear y reportar (useUserModeration): estado de bloqueo por RQ, hoja,
 * escritura de la clave tras cada acción, respuestas idempotentes del servidor y toasts.
 * @jest-environment node
 */
jest.mock('../../api/userApi', () => ({ userApi: { getBlockStatus: jest.fn(), blockUser: jest.fn(), unblockUser: jest.fn(), reportUser: jest.fn() } }))
jest.mock('sonner-native', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { userApi } from '../../api/userApi'
import { toast } from 'sonner-native'
import useUserModeration from './useUserModeration'

const PEER = { uuid: 'peer-1', username: 'peer' }

let clients = []
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)) })

const renderHook = async (target = PEER, options = {}) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	clients.push(client)
	const result = { current: null }
	const Harness = () => { result.current = useUserModeration(target, options); return null }
	await act(async () => { create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
	await settle()
	return { result, client }
}

beforeEach(() => {
	jest.clearAllMocks()
	userApi.getBlockStatus.mockResolvedValue({ success: true, data: { blocked: false, blocked_by: false } })
})

afterEach(() => {
	for (const client of clients) { client.clear(); client.unmount() }
	clients = []
})

test('pide el estado de bloqueo del peer y lo expone en camelCase', async () => {
	userApi.getBlockStatus.mockResolvedValue({ success: true, data: { blocked: false, blocked_by: true } })
	const { result } = await renderHook()
	expect(userApi.getBlockStatus).toHaveBeenCalledWith('peer-1')
	expect(result.current.blocked).toBe(false)
	expect(result.current.blockedBy).toBe(true)
})

test('deshabilitado (perfil propio / sin sesión): ni pide el estado ni abre la hoja', async () => {
	const { result } = await renderHook(PEER, { enabled: false })
	expect(userApi.getBlockStatus).not.toHaveBeenCalled()
	await act(async () => { result.current.open('menu') })
	expect(result.current.sheet).toBeNull()
})

test('abrir y cerrar la hoja con el usuario y la vista pedida', async () => {
	const { result } = await renderHook()
	await act(async () => { result.current.open('report') })
	expect(result.current.sheet).toEqual({ user: PEER, view: 'report' })
	await act(async () => { result.current.close() })
	expect(result.current.sheet).toBeNull()
})

test('bloquear: escribe la clave, avisa y cierra la hoja', async () => {
	userApi.blockUser.mockResolvedValue({ success: true, status: 200, data: { success: true } })
	const { result, client } = await renderHook()
	await act(async () => { result.current.open('block') })
	await act(async () => { await result.current.block() })
	expect(userApi.blockUser).toHaveBeenCalledWith('peer-1')
	expect(result.current.blocked).toBe(true)
	expect(client.getQueryData(['user', 'block', 'peer-1'])).toEqual({ blocked: true, blockedBy: false })
	expect(toast.success).toHaveBeenCalledWith('Usuario bloqueado')
	expect(result.current.sheet).toBeNull()
})

test('bloquear a quien ya estaba bloqueado (400 del servidor) cuenta como hecho', async () => {
	userApi.blockUser.mockResolvedValue({ success: false, status: 400, error: 'Este usuario ya está bloqueado' })
	const { result } = await renderHook()
	await act(async () => { await result.current.block() })
	expect(result.current.blocked).toBe(true)
	expect(toast.error).not.toHaveBeenCalled()
})

test('bloquear falla: toast con la prosa del servidor, la hoja sigue abierta y el estado no cambia', async () => {
	userApi.blockUser.mockResolvedValue({ success: false, status: 500, error: 'Error interno del servidor' })
	const { result } = await renderHook()
	await act(async () => { result.current.open('block') })
	await act(async () => { await result.current.block() })
	expect(toast.error).toHaveBeenCalledWith('Error interno del servidor')
	expect(result.current.blocked).toBe(false)
	expect(result.current.sheet).toEqual({ user: PEER, view: 'block' })
})

test('desbloquear conserva blockedBy y escribe blocked=false', async () => {
	userApi.getBlockStatus.mockResolvedValue({ success: true, data: { blocked: true, blocked_by: true } })
	userApi.unblockUser.mockResolvedValue({ success: true, status: 200 })
	const { result } = await renderHook()
	expect(result.current.blocked).toBe(true)
	await act(async () => { await result.current.unblock() })
	expect(userApi.unblockUser).toHaveBeenCalledWith('peer-1')
	expect(result.current.blocked).toBe(false)
	expect(result.current.blockedBy).toBe(true)
	expect(toast.success).toHaveBeenCalledWith('Usuario desbloqueado')
})

test('reportar manda el literal del motivo y la descripción recortada; sin motivo no llama', async () => {
	userApi.reportUser.mockResolvedValue({ success: true, status: 200 })
	const { result } = await renderHook()
	await act(async () => { await result.current.report({ reason: null, description: 'x' }) })
	expect(userApi.reportUser).not.toHaveBeenCalled()
	await act(async () => { result.current.open('report') })
	await act(async () => { await result.current.report({ reason: 'scam', description: '  me pidió pagar fuera ' }) })
	expect(userApi.reportUser).toHaveBeenCalledWith({ reported_user_uuid: 'peer-1', reason: 'Estafa o fraude', description: 'me pidió pagar fuera' })
	expect(toast.success).toHaveBeenCalledWith('Reporte enviado. Gracias por avisar.')
	expect(result.current.sheet).toBeNull()
})

test('un doble toque no manda dos veces', async () => {
	let resolve
	userApi.blockUser.mockReturnValue(new Promise(r => { resolve = r }))
	const { result } = await renderHook()
	let first
	act(() => { first = result.current.block(); result.current.block() })
	expect(result.current.busy).toBe(true)
	expect(userApi.blockUser).toHaveBeenCalledTimes(1)
	await act(async () => { resolve({ success: true, status: 200 }); await first })
	expect(result.current.busy).toBe(false)
})
