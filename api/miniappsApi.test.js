/**
 * miniappsApi — testers de mini-apps sin publicar: invitaciones (tolerantes con
 * un qpweb que aún no tiene la ruta), responderlas y dejar de probar.
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { miniappsApi } from './miniappsApi'

const INVITE = {
	slug: 'mi-tienda', name: 'Mi Tienda', tagline: null, icon: null, category: 'shopping',
	merchant: { name: 'Tienda SA', logo: null },
	invited_by: { username: 'pepe', name: 'Pepe', image: null },
	created_at: '2026-11-11T12:00:00.000Z',
}

const httpError = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

beforeEach(() => jest.clearAllMocks())

describe('invites', () => {

	test('las pide en silencio y desenvuelve el sobre', async () => {
		apiClient.get.mockResolvedValueOnce({ data: { data: [INVITE] }, status: 200 })
		const result = await miniappsApi.invites()
		expect(apiClient.get).toHaveBeenCalledWith('/miniapps/invites', { silent: true })
		expect(result).toEqual({ success: true, data: [INVITE], status: 200 })
	})

	test('un qpweb sin testers (404 de Next, cuerpo HTML) = sin invitaciones, no un fallo', async () => {
		apiClient.get.mockRejectedValueOnce(httpError(404, '<!DOCTYPE html><html>…</html>'))
		expect(await miniappsApi.invites()).toEqual({ success: true, data: [], status: 404 })
	})

	test('cualquier otro fallo sí lo es', async () => {
		apiClient.get.mockRejectedValueOnce(httpError(500, { error: 'boom' }))
		expect(await miniappsApi.invites()).toMatchObject({ success: false, status: 500 })
	})
})

describe('answerInvite', () => {

	test('aceptar y rechazar mandan `accept` en el body', async () => {
		apiClient.post.mockResolvedValue({ data: { data: { status: 'accepted' } }, status: 200 })
		await miniappsApi.answerInvite('mi-tienda', true)
		expect(apiClient.post).toHaveBeenLastCalledWith('/miniapps/invites/mi-tienda', { accept: true })
		await miniappsApi.answerInvite('mi-tienda', false)
		expect(apiClient.post).toHaveBeenLastCalledWith('/miniapps/invites/mi-tienda', { accept: false })
	})

	test('el slug viaja codificado', async () => {
		apiClient.post.mockResolvedValueOnce({ data: { data: { status: 'accepted' } }, status: 200 })
		await miniappsApi.answerInvite('a/b', true)
		expect(apiClient.post).toHaveBeenCalledWith('/miniapps/invites/a%2Fb', { accept: true })
	})

	test('INVITE_NOT_FOUND llega con su status y su código', async () => {
		apiClient.post.mockRejectedValueOnce(httpError(404, { error: 'Invitación no encontrada', code: 'INVITE_NOT_FOUND' }))
		expect(await miniappsApi.answerInvite('mi-tienda', true)).toMatchObject({ success: false, status: 404, details: { code: 'INVITE_NOT_FOUND' } })
	})
})

describe('leaveTesting', () => {

	test('DELETE a /miniapps/testing/{slug}', async () => {
		apiClient.delete.mockResolvedValueOnce({ data: { data: { left: true } }, status: 200 })
		expect(await miniappsApi.leaveTesting('mi-tienda')).toEqual({ success: true, data: { left: true }, status: 200 })
		expect(apiClient.delete).toHaveBeenCalledWith('/miniapps/testing/mi-tienda')
	})
})
