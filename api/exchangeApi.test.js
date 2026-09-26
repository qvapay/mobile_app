/**
 * Contrato de sobre de exchangeApi: qué parte del cuerpo devuelve cada método.
 *
 * Existe por un fallo real: `catalog` leía el SOBRE (`{ data: … }`) en vez de su contenido,
 * así que `supported` salía undefined, caía a lista vacía y TODOS los activos aparecían
 * como no intercambiables. TypeScript no podía cazarlo —el genérico de `apiClient.get` es
 * una afirmación nuestra, no una comprobación—, así que hace falta esto.
 *
 * Las respuestas de abajo son las que devuelven las rutas de qpweb, literales.
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { exchangeApi } from './exchangeApi'

const ORDER = { uuid: 'x-1', provider: 'changenow', from_asset: 'tron:TR7', to_asset: 'solana:native', status: 'awaiting_deposit' }

beforeEach(() => { jest.clearAllMocks() })

test('catalog devuelve el CONTENIDO del sobre, no el sobre', async () => {
	// GET /wallet/exchange/quote → { data: { supported, unsupported } }
	apiClient.get.mockResolvedValue({ data: { data: { supported: ['tron:native'], unsupported: {} } }, status: 200 })
	const r = await exchangeApi.catalog()
	expect(r.success).toBe(true)
	expect(r.data.supported).toEqual(['tron:native'])
	expect(r.data.data).toBeUndefined()
})

test('quote también', async () => {
	// POST /wallet/exchange/quote → { data: { quote, advice, … } }
	apiClient.post.mockResolvedValue({ data: { data: { quote: { provider: 'changenow', amountOut: 1 }, min_amount: 12.6 } }, status: 200 })
	const r = await exchangeApi.quote({ fromAssetId: 'a', toAssetId: 'b', amount: 50 })
	expect(r.data.quote.provider).toBe('changenow')
	expect(r.data.min_amount).toBe(12.6)
})

test('get de una operación también', async () => {
	apiClient.get.mockResolvedValue({ data: { data: ORDER }, status: 200 })
	const r = await exchangeApi.get('x-1')
	expect(r.data.uuid).toBe('x-1')
})

test('create SÍ devuelve el sobre: `duplicate` viaja fuera de la operación', async () => {
	// POST /wallet/exchange/create → { data: order, duplicate?: true }
	apiClient.post.mockResolvedValue({ data: { data: ORDER, duplicate: true }, status: 200 })
	const r = await exchangeApi.create({ quoteId: 'q', fromAssetId: 'a', toAssetId: 'b', amount: 50, payoutAddress: 'p', refundAddress: 'r', idempotencyKey: 'k12345678' })
	expect(r.data.data.uuid).toBe('x-1')
	expect(r.data.duplicate).toBe(true)
})

test('list también: `meta` viaja junto a las filas', async () => {
	apiClient.get.mockResolvedValue({ data: { data: [ORDER], meta: { page: 1, total: 1, last_page: 1 } }, status: 200 })
	const r = await exchangeApi.list()
	expect(r.data.data).toHaveLength(1)
	expect(r.data.meta.total).toBe(1)
})

test('un error del backend conserva su `code` en details, que es lo que decide el copy', async () => {
	apiClient.post.mockRejectedValue({ response: { status: 400, data: { error: 'El mínimo para este par es 12.6', code: 'BELOW_MINIMUM', min_amount: 12.6 } } })
	const r = await exchangeApi.quote({ fromAssetId: 'a', toAssetId: 'b', amount: 1 })
	expect(r.success).toBe(false)
	expect(r.status).toBe(400)
	expect(r.details.code).toBe('BELOW_MINIMUM')
	expect(r.details.min_amount).toBe(12.6)
})
