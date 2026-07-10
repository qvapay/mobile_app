/**
 * Unit tests for storeApi — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
jest.mock('./client', () => ({
	apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from './client'
import { storeApi } from './storeApi'

const ok = (data, status = 200) => ({ data, status })
const apiError = (data, status = 422) => ({ response: { data, status } })
const networkError = (message = 'Network Error') => {
	const err = new Error(message)
	err.response = undefined
	return err
}

beforeEach(() => jest.clearAllMocks())

describe('getVoucherCatalog', () => {

	test('fetches the bare catalog when no params are given', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ countries: [] }))
		const result = await storeApi.getVoucherCatalog()
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog')
		expect(result).toEqual({ success: true, data: { countries: [] }, status: 200 })
	})

	test('serializes the countries mode as a bare flag', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ countries: true })
		// true flags serialize as key=true — the Vercel proxy rewrite drops bare/empty flags in prod
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog?countries=true')
	})

	test('serializes the featured mode', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ featured: true })
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog?featured=true')
	})

	test('serializes the favorites mode', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ favorites: true })
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog?favorites=true')
	})

	test('serializes the categories mode with an optional country', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ categories: true, country: 'US' })
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog?categories=true&country=US')
	})

	test('serializes the country mode (brands for one country)', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ country: 'US' })
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog?country=US')
	})

	test('serializes the country + brand mode (offers for one brand)', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ country: 'US', brand: 'amazon' })
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog?country=US&brand=amazon')
	})

	test('drops false, null, undefined and empty-string params', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getVoucherCatalog({ countries: false, country: '', brand: null, featured: undefined })
		expect(apiClient.get).toHaveBeenCalledWith('/store/voucher-catalog')
	})

	test('returns the API error message on failure', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'Catálogo no disponible' }, 503))
		const result = await storeApi.getVoucherCatalog({ featured: true })
		expect(result).toEqual({
			success: false,
			error: 'Catálogo no disponible',
			details: { error: 'Catálogo no disponible' },
			status: 503,
		})
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ ok: false }, 500))
		const result = await storeApi.getVoucherCatalog()
		expect(result.error).toBe('No se pudo obtener el catálogo de tarjetas')
	})

	test('returns the network error message when there is no response', async () => {
		apiClient.get.mockRejectedValueOnce(networkError('timeout of 20000ms exceeded'))
		const result = await storeApi.getVoucherCatalog()
		expect(result).toEqual({ success: false, error: 'timeout of 20000ms exceeded', status: undefined })
	})

	test('falls back to "Error de red" when the network error has no message', async () => {
		// Documents current behavior: wrap() uses 'Error de red', not the
		// 'Ha ocurrido un error de red' fallback used by the other modules.
		apiClient.get.mockRejectedValueOnce({})
		const result = await storeApi.getVoucherCatalog()
		expect(result).toEqual({ success: false, error: 'Error de red', status: undefined })
	})
})

describe('purchaseVoucher', () => {

	const body = { offer_id: 'off-1', country: 'US', brand: 'amazon', amount: 25 }

	test('posts the purchase payload and returns the purchase data', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ id: 9, code: 'ABC' }, 201))
		const result = await storeApi.purchaseVoucher(body)
		expect(apiClient.post).toHaveBeenCalledWith('/store/voucher/purchase', body)
		expect(result).toEqual({ success: true, data: { id: 9, code: 'ABC' }, status: 201 })
	})

	test.each([
		['offer_id', { country: 'US', brand: 'amazon' }],
		['country', { offer_id: 'off-1', brand: 'amazon' }],
		['brand', { offer_id: 'off-1', country: 'US' }],
	])('short-circuits with a local 400 when %s is missing', async (_field, incomplete) => {
		const result = await storeApi.purchaseVoucher(incomplete)
		expect(result).toEqual({ success: false, error: 'Faltan datos para la compra', status: 400 })
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('short-circuits with a local 400 on a missing body', async () => {
		const result = await storeApi.purchaseVoucher()
		expect(result).toEqual({ success: false, error: 'Faltan datos para la compra', status: 400 })
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('prefers errorData.message when errorData.error is absent', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({ message: 'Saldo insuficiente' }, 422))
		const result = await storeApi.purchaseVoucher(body)
		expect(result.success).toBe(false)
		expect(result.error).toBe('Saldo insuficiente')
		expect(result.status).toBe(422)
	})
})

describe('getTopupCatalog', () => {

	test('fetches the bare catalog when no params are given', async () => {
		apiClient.get.mockResolvedValueOnce(ok({}))
		await storeApi.getTopupCatalog()
		expect(apiClient.get).toHaveBeenCalledWith('/store/topup-catalog')
	})

	test('serializes the countries mode as a bare flag', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getTopupCatalog({ countries: true })
		expect(apiClient.get).toHaveBeenCalledWith('/store/topup-catalog?countries=true')
	})

	test('serializes the featured mode', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getTopupCatalog({ featured: true })
		expect(apiClient.get).toHaveBeenCalledWith('/store/topup-catalog?featured=true')
	})

	test('serializes the country mode (Cuba resolves to Cubacel server-side)', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ source: 'cuba' }))
		const result = await storeApi.getTopupCatalog({ country: 'CU' })
		expect(apiClient.get).toHaveBeenCalledWith('/store/topup-catalog?country=CU')
		expect(result.data).toEqual({ source: 'cuba' })
	})

	test('serializes the country + brand + subType mode', async () => {
		apiClient.get.mockResolvedValueOnce(ok([]))
		await storeApi.getTopupCatalog({ country: 'MX', brand: 'telcel', subType: 'data' })
		expect(apiClient.get).toHaveBeenCalledWith('/store/topup-catalog?country=MX&brand=telcel&subType=data')
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await storeApi.getTopupCatalog({ country: 'MX' })
		expect(result.error).toBe('No se pudo obtener el catálogo de recargas')
	})
})

describe('purchaseTopup', () => {

	const body = { offer_id: 'off-2', phone_number: '+5215512345678', country: 'MX', amount: 10 }

	test('posts the top-up payload', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ id: 1 }))
		const result = await storeApi.purchaseTopup(body)
		expect(apiClient.post).toHaveBeenCalledWith('/store/topup', body)
		expect(result).toEqual({ success: true, data: { id: 1 }, status: 200 })
	})

	test.each([
		['offer_id', { phone_number: '+52155', country: 'MX' }],
		['phone_number', { offer_id: 'off-2', country: 'MX' }],
		['country', { offer_id: 'off-2', phone_number: '+52155' }],
	])('short-circuits with a local 400 when %s is missing', async (_field, incomplete) => {
		const result = await storeApi.purchaseTopup(incomplete)
		expect(result).toEqual({ success: false, error: 'Faltan datos para la recarga', status: 400 })
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('returns the API error on failure', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({ error: 'Operador no disponible' }, 502))
		const result = await storeApi.purchaseTopup(body)
		expect(result).toEqual({
			success: false,
			error: 'Operador no disponible',
			details: { error: 'Operador no disponible' },
			status: 502,
		})
	})
})

describe('purchasePhonePackage', () => {

	const body = { phone_package_id: 7, phone_number: '+5355555555' }

	test('posts the Cubacel package payload', async () => {
		apiClient.post.mockResolvedValueOnce(ok({ id: 2 }))
		const result = await storeApi.purchasePhonePackage(body)
		expect(apiClient.post).toHaveBeenCalledWith('/store/phone_package', body)
		expect(result).toEqual({ success: true, data: { id: 2 }, status: 200 })
	})

	test.each([
		['phone_package_id', { phone_number: '+5355555555' }],
		['phone_number', { phone_package_id: 7 }],
	])('short-circuits with a local 400 when %s is missing', async (_field, incomplete) => {
		const result = await storeApi.purchasePhonePackage(incomplete)
		expect(result).toEqual({ success: false, error: 'Faltan datos para la recarga', status: 400 })
		expect(apiClient.post).not.toHaveBeenCalled()
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.post.mockRejectedValueOnce(apiError({}, 500))
		const result = await storeApi.purchasePhonePackage(body)
		expect(result.error).toBe('No se pudo realizar la recarga')
	})
})

describe('getMyPurchases', () => {

	test('fetches the purchases list', async () => {
		apiClient.get.mockResolvedValueOnce(ok([{ id: 1 }, { id: 2 }]))
		const result = await storeApi.getMyPurchases()
		expect(apiClient.get).toHaveBeenCalledWith('/store/my')
		expect(result).toEqual({ success: true, data: [{ id: 1 }, { id: 2 }], status: 200 })
	})

	test('falls back to the Spanish message on API error without error/message fields', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({}, 500))
		const result = await storeApi.getMyPurchases()
		expect(result.error).toBe('No se pudieron obtener tus compras')
	})
})

describe('getPurchaseDetail', () => {

	test('fetches one purchase by id', async () => {
		apiClient.get.mockResolvedValueOnce(ok({ id: 42, code: 'XYZ' }))
		const result = await storeApi.getPurchaseDetail(42)
		expect(apiClient.get).toHaveBeenCalledWith('/store/my/42')
		expect(result).toEqual({ success: true, data: { id: 42, code: 'XYZ' }, status: 200 })
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValueOnce(apiError({ error: 'No encontrada' }, 404))
		const result = await storeApi.getPurchaseDetail(999)
		expect(result).toEqual({
			success: false,
			error: 'No encontrada',
			details: { error: 'No encontrada' },
			status: 404,
		})
	})
})
