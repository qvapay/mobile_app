/**
 * Unit tests for announcementApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { announcementApi } from './announcementApi'

const ANNOUNCEMENT = {
	id: '7',
	title: 'Mantenimiento programado',
	message: 'El P2P estará en pausa de 3:00 a 4:00 (hora de Cuba).',
	cta_label: null,
	cta_url: null,
	dismiss_days: 3,
	ends_at: '2026-08-29T04:00:00.000Z',
}

beforeEach(() => jest.clearAllMocks())

describe('getAnnouncement', () => {

	test('lo pide en silencio (nunca enciende la barra de carga) y desenvuelve el sobre', async () => {
		apiClient.get.mockResolvedValueOnce({ data: { data: ANNOUNCEMENT }, status: 200 })
		const result = await announcementApi.getAnnouncement()
		expect(apiClient.get).toHaveBeenCalledWith('/announcement', { silent: true })
		expect(result).toEqual({ success: true, data: ANNOUNCEMENT, status: 200 })
	})

	test('sin aviso vigente devuelve null, no un fallo', async () => {
		apiClient.get.mockResolvedValueOnce({ data: { data: null }, status: 200 })
		const result = await announcementApi.getAnnouncement()
		expect(result).toEqual({ success: true, data: null, status: 200 })
	})

	test('acepta también el objeto pelado, por si se sirviera sin envoltorio', async () => {
		const bare = { id: '9', title: 'Sin sobre', dismiss_days: 0 }
		apiClient.get.mockResolvedValueOnce({ data: bare, status: 200 })
		const result = await announcementApi.getAnnouncement()
		expect(result).toEqual({ success: true, data: bare, status: 200 })
	})

	test('un error del backend con cuerpo propaga su mensaje y el código', async () => {
		const err = new Error('Request failed with status code 401')
		err.response = { data: { error: 'Unauthorized' }, status: 401 }
		apiClient.get.mockRejectedValueOnce(err)
		const result = await announcementApi.getAnnouncement()
		expect(result).toEqual({ success: false, error: 'Unauthorized', details: { error: 'Unauthorized' }, status: 401 })
	})

	test('un fallo de red cae en el mensaje del error, sin status', async () => {
		apiClient.get.mockRejectedValueOnce(new Error('Network Error'))
		const result = await announcementApi.getAnnouncement()
		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})

	test('sin mensaje se usa el fallback en español', async () => {
		apiClient.get.mockRejectedValueOnce({})
		const result = await announcementApi.getAnnouncement()
		expect(result).toEqual({ success: false, error: 'Ha ocurrido un error de red', status: undefined })
	})
})
