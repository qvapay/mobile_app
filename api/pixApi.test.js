/**
 * Contrato de pixApi: rutas, sobre `data`, `silent` para no encender el velo de carga y el `code`
 * de los errores, del que dependen el QR abierto y el tope.
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { pixApi } from './pixApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status) => ({ response: { data, status } })

beforeEach(() => jest.clearAllMocks())

test('getEligibility desenvuelve data y no enciende el velo', async () => {
	apiClient.get.mockResolvedValueOnce(ok({ data: { eligible: true } }))
	expect(await pixApi.getEligibility()).toEqual({ success: true, data: { eligible: true }, status: 200 })
	expect(apiClient.get).toHaveBeenCalledWith('/pix/eligibility', { silent: true })
})

test('createCheckout manda la compra tal cual', async () => {
	apiClient.post.mockResolvedValueOnce(ok({ data: { uuid: 'c1' } }, 201))
	const body = { source: 'esim', offer_id: 'ESIM_BR_5GB', country: 'BR' }
	expect(await pixApi.createCheckout(body)).toEqual({ success: true, data: { uuid: 'c1' }, status: 201 })
	expect(apiClient.post).toHaveBeenCalledWith('/pix/checkout', body, { silent: true })
})

test('un 409 conserva el cuerpo: ahí viene el QR abierto', async () => {
	const charge = { uuid: 'c1' }
	apiClient.post.mockRejectedValueOnce(apiError({ error: 'Ya tienes un PIX abierto', code: 'PIX_QR_OPEN', charge }, 409))
	expect(await pixApi.createCheckout({ source: 'topup' })).toEqual({
		success: false,
		error: 'Ya tienes un PIX abierto',
		details: { error: 'Ya tienes un PIX abierto', code: 'PIX_QR_OPEN', charge },
		status: 409,
	})
})

test('sin respuesta del servidor devuelve el mensaje del cliente', async () => {
	apiClient.post.mockRejectedValueOnce({ message: 'No se ha podido conectar con el servidor' })
	expect(await pixApi.createCheckout({ source: 'topup' })).toEqual({ success: false, error: 'No se ha podido conectar con el servidor', status: undefined })
})

test('getCheckout consulta sin velo y codifica el uuid', async () => {
	apiClient.get.mockResolvedValueOnce(ok({ data: { stage: 'verifying' } }))
	expect((await pixApi.getCheckout('a/b')).data).toEqual({ stage: 'verifying' })
	expect(apiClient.get).toHaveBeenCalledWith('/pix/checkout/a%2Fb', { silent: true })
})

test('cancelCheckout conserva PIX_NOT_CANCELLABLE', async () => {
	apiClient.delete.mockRejectedValueOnce(apiError({ error: 'Este PIX ya no se puede cancelar', code: 'PIX_NOT_CANCELLABLE' }, 409))
	const result = await pixApi.cancelCheckout('c1')
	expect(apiClient.delete).toHaveBeenCalledWith('/pix/checkout/c1', { silent: true })
	expect(result.details.code).toBe('PIX_NOT_CANCELLABLE')
})
