/**
 * Unit tests for marketApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { marketApi } from './marketApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status = 422) => ({ response: { data, status } })

beforeEach(() => jest.clearAllMocks())

describe('getStores', () => {

	test('fetches the bare list when no params are given', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ stores: [], total: 0 }))
		const result = await marketApi.getStores()
		expect(apiClient.get).toHaveBeenCalledWith('/market/stores')
		expect(result).toEqual({ success: true, data: { stores: [], total: 0 }, status: 200 })
	})

	test('serializes category and pagination', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ stores: [] }))
		await marketApi.getStores({ category: 'food', page: 2, take: 20 })
		expect(apiClient.get).toHaveBeenCalledWith('/market/stores?category=food&page=2&take=20')
	})

	test('returns the error envelope on backend failure', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'Parámetros inválidos' }, 400))
		const result = await marketApi.getStores({ category: 'nope' })
		expect(result.success).toBe(false)
		expect(result.error).toBe('Parámetros inválidos')
		expect(result.status).toBe(400)
	})
})

describe('getStore / getProduct', () => {

	test('fetches a store by slug (encoded)', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ store: {}, products: [] }))
		await marketApi.getStore('mi tienda')
		expect(apiClient.get).toHaveBeenCalledWith('/market/stores/mi%20tienda')
	})

	test('rejects a missing slug locally', async () => {
		const result = await marketApi.getStore()
		expect(result).toEqual({ success: false, error: 'Tienda inválida', status: 400 })
		expect(apiClient.get).not.toHaveBeenCalled()
	})

	test('fetches a product by uuid and rejects a missing one locally', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ product: {}, shop: {} }))
		await marketApi.getProduct('abc-123')
		expect(apiClient.get).toHaveBeenCalledWith('/market/products/abc-123')
		const result = await marketApi.getProduct('')
		expect(result.status).toBe(400)
	})
})

describe('getCatalog / search', () => {

	test('serializes shop filter and pagination', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ products: [] }))
		await marketApi.getCatalog({ shop: 'tienda', page: 2 })
		expect(apiClient.get).toHaveBeenCalledWith('/market/catalog?shop=tienda&page=2')
	})

	test('search is silent, trims and requires 2+ chars', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ shops: [], products: [] }))
		await marketApi.search('  cafe  ')
		expect(apiClient.get).toHaveBeenCalledWith('/shop/search?q=cafe', { silent: true })
		const short = await marketApi.search('a')
		expect(short.success).toBe(false)
		expect(apiClient.get).toHaveBeenCalledTimes(1)
	})
})

describe('getProductsBatch', () => {

	test('joins uuids as CSV, silent', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ products: [] }))
		await marketApi.getProductsBatch(['b', 'a'])
		expect(apiClient.get).toHaveBeenCalledWith('/shop/products?uuids=b%2Ca', { silent: true })
	})

	test('rejects an empty batch locally', async () => {
		const result = await marketApi.getProductsBatch([])
		expect(result.status).toBe(400)
		expect(apiClient.get).not.toHaveBeenCalled()
	})
})

describe('createOrder', () => {

	test('posts the payload silently', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ order: { uuid: 'o1' } }, 201))
		const body = { product_uuid: 'p1', quantity: 1, idempotency_key: 'k-12345678' }
		const result = await marketApi.createOrder(body)
		expect(apiClient.post).toHaveBeenCalledWith('/market/order', body, { silent: true })
		expect(result.success).toBe(true)
		expect(result.status).toBe(201)
	})

	test('validates required fields locally', async () => {
		expect((await marketApi.createOrder({ product_uuid: 'p1' })).status).toBe(400)
		expect((await marketApi.createOrder({ idempotency_key: 'k-12345678' })).status).toBe(400)
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('surfaces backend order errors (codes intact)', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({ error: 'OUT_OF_STOCK' }, 409))
		const result = await marketApi.createOrder({ product_uuid: 'p1', idempotency_key: 'k-12345678' })
		expect(result).toMatchObject({ success: false, error: 'OUT_OF_STOCK', status: 409 })
	})
})

describe('getOrders', () => {

	test('lists with optional status filter', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ orders: [], total: 0 }))
		await marketApi.getOrders({ status: 'fulfilled', page: 1 })
		expect(apiClient.get).toHaveBeenCalledWith('/market/orders?status=fulfilled&page=1')
	})
})
