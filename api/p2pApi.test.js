/**
 * Unit tests for api/p2pApi.js — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { p2pApi } from './p2pApi'
import { apiClient } from './client'

jest.mock('./client', () => ({
	apiClient: {
		get: jest.fn(),
		post: jest.fn(),
	},
}))

// Builds an axios-like error carrying a server response
const apiError = (status, data) => {
	const error = new Error(`Request failed with status code ${status}`)
	error.response = { status, data }
	return error
}

const networkError = () => new Error('Network Error')

beforeEach(() => {
	jest.clearAllMocks()
})

describe('p2pApi.index', () => {

	const indexResponse = {
		status: 200,
		data: {
			current_page: 2,
			per_page: 25,
			total: 51,
			data: [{ uuid: 'offer-1' }, { uuid: 'offer-2' }],
		},
	}

	test('requests /p2p/index with an empty query when no filters are given', async () => {
		apiClient.get.mockResolvedValue(indexResponse)

		const result = await p2pApi.index()

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?')
		expect(result).toEqual({
			success: true,
			data: indexResponse.data,
			current_page: 2,
			per_page: 25,
			total: 51,
			offers: indexResponse.data.data,
		})
	})

	test('serializes every supported filter into the query string', async () => {
		apiClient.get.mockResolvedValue(indexResponse)

		await p2pApi.index({
			page: 2,
			order: 'desc',
			take: 25,
			type: 'sell',
			my: true,
			only_kyc: true,
			only_vip: true,
			min: 100,
			max: 5000,
			ratio_min: 0.9,
			ratio_max: 1.2,
			coin: 'BANK_CUP',
			orderBy: 'amount',
		})

		expect(apiClient.get).toHaveBeenCalledWith(
			'/p2p/index?page=2&order=desc&take=25&type=sell&my=true&only_kyc=1&only_vip=1&min=100&max=5000&ratio_min=0.9&ratio_max=1.2&coin=BANK_CUP&orderBy=amount'
		)
	})

	test('keeps zero values for min/max/ratio filters (defined check, not truthiness)', async () => {
		apiClient.get.mockResolvedValue(indexResponse)

		await p2pApi.index({ min: 0, max: 0, ratio_min: 0, ratio_max: 0 })

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?min=0&max=0&ratio_min=0&ratio_max=0')
	})

	test('skips falsy pagination/boolean filters (page 0, my false, empty coin)', async () => {
		apiClient.get.mockResolvedValue(indexResponse)

		await p2pApi.index({ page: 0, my: false, only_kyc: false, only_vip: false, coin: '', type: '' })

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?')
	})

	test('returns the API message and details on server error', async () => {
		apiClient.get.mockRejectedValue(apiError(422, { message: 'Filtros inválidos', code: 'bad_filters' }))

		const result = await p2pApi.index({ type: 'buy' })

		expect(result).toEqual({
			success: false,
			error: 'Filtros inválidos',
			details: { message: 'Filtros inválidos', code: 'bad_filters' },
			status: 422,
		})
	})

	test('falls back to the default Spanish message when the error body has no message', async () => {
		apiClient.get.mockRejectedValue(apiError(500, { foo: 'bar' }))

		const result = await p2pApi.index()

		expect(result.success).toBe(false)
		expect(result.error).toBe('No se pudieron obtener las ofertas P2P')
		expect(result.status).toBe(500)
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.get.mockRejectedValue(networkError())

		const result = await p2pApi.index()

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('p2pApi index convenience wrappers', () => {

	const okResponse = { status: 200, data: { current_page: 1, per_page: 50, total: 0, data: [] } }

	beforeEach(() => {
		apiClient.get.mockResolvedValue(okResponse)
	})

	test('getByType forwards the type plus additional filters to index', async () => {
		const result = await p2pApi.getByType('buy', { coin: 'ETECSA' })

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?type=buy&coin=ETECSA')
		expect(result.success).toBe(true)
	})

	test('getByCoin forwards the coin plus additional filters to index', async () => {
		await p2pApi.getByCoin('CLASICA', { page: 3 })

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?page=3&coin=CLASICA')
	})

	test('getByAmountRange forwards min and max to index', async () => {
		await p2pApi.getByAmountRange(50, 200)

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?min=50&max=200')
	})

	test('getBuyOffers forces type buy for the given coin', async () => {
		await p2pApi.getBuyOffers('BANK_CUP')

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?type=buy&coin=BANK_CUP')
	})

	test('getSellOffers forces type sell for the given coin', async () => {
		await p2pApi.getSellOffers('BANK_CUP')

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?type=sell&coin=BANK_CUP')
	})

	test('getPaginated maps page/perPage to page/take with defaults', async () => {
		await p2pApi.getPaginated()
		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?page=1&take=50')

		await p2pApi.getPaginated(4, 10, { type: 'sell' })
		expect(apiClient.get).toHaveBeenCalledWith('/p2p/index?page=4&take=10&type=sell')
	})
})

describe('p2pApi.show', () => {

	test('gets the offer detail by uuid', async () => {
		const offer = { uuid: 'abc-123', status: 'open' }
		apiClient.get.mockResolvedValue({ data: offer, status: 200 })

		const result = await p2pApi.show('abc-123')

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/abc-123')
		expect(result).toEqual({ success: true, data: offer, status: 200 })
	})

	test('returns the API error field on failure (e.g. 403 on private offers)', async () => {
		apiClient.get.mockRejectedValue(apiError(403, { error: 'Oferta privada' }))

		const result = await p2pApi.show('abc-123')

		expect(result).toEqual({ success: false, error: 'Oferta privada', status: 403 })
	})

	test('falls back to the message field, then to error.message', async () => {
		apiClient.get.mockRejectedValue(apiError(404, { message: 'No encontrada' }))
		expect(await p2pApi.show('missing')).toEqual({ success: false, error: 'No encontrada', status: 404 })

		apiClient.get.mockRejectedValue(networkError())
		expect(await p2pApi.show('missing')).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('p2pApi.cancel', () => {

	test('posts to the cancel endpoint', async () => {
		apiClient.post.mockResolvedValue({ data: { status: 'cancelled' }, status: 200 })

		const result = await p2pApi.cancel('abc-123')

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/cancel')
		expect(result).toEqual({ success: true, data: { status: 'cancelled' }, status: 200 })
	})

	test('surfaces the API error on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'No se puede cancelar' }))

		const result = await p2pApi.cancel('abc-123')

		expect(result).toEqual({ success: false, error: 'No se puede cancelar', status: 422 })
	})
})

describe('p2pApi.markPaid', () => {

	test('posts the optional tx_id, defaulting to an empty string', async () => {
		apiClient.post.mockResolvedValue({ data: { status: 'paid' }, status: 200 })

		await p2pApi.markPaid('abc-123')
		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/paid', { tx_id: '' })

		await p2pApi.markPaid('abc-123', 'ext-tx-9')
		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/paid', { tx_id: 'ext-tx-9' })
	})

	test('surfaces the API error on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(409, { message: 'Estado inválido' }))

		const result = await p2pApi.markPaid('abc-123')

		expect(result).toEqual({ success: false, error: 'Estado inválido', status: 409 })
	})
})

describe('p2pApi.confirmReceived', () => {

	test('posts to the received endpoint', async () => {
		apiClient.post.mockResolvedValue({ data: { status: 'completed' }, status: 200 })

		const result = await p2pApi.confirmReceived('abc-123')

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/received')
		expect(result).toEqual({ success: true, data: { status: 'completed' }, status: 200 })
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await p2pApi.confirmReceived('abc-123')

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('p2pApi.getChat', () => {

	test('gets the chat history for the offer', async () => {
		const messages = [{ id: 1, message: 'hola' }]
		apiClient.get.mockResolvedValue({ data: messages, status: 200 })

		const result = await p2pApi.getChat('abc-123')

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/abc-123/chat')
		expect(result).toEqual({ success: true, data: messages, status: 200 })
	})

	test('surfaces the API error on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(403, { error: 'Sin acceso al chat' }))

		const result = await p2pApi.getChat('abc-123')

		expect(result).toEqual({ success: false, error: 'Sin acceso al chat', status: 403 })
	})
})

describe('p2pApi.sendChat', () => {

	test('posts a plain text payload as JSON', async () => {
		const stored = { id: 2, message: 'listo' }
		apiClient.post.mockResolvedValue({ data: stored, status: 200 })

		const result = await p2pApi.sendChat('abc-123', { message: 'listo' })

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/chat', { message: 'listo' })
		expect(result).toEqual({ success: true, data: stored, status: 200 })
	})

	test('switches to multipart/form-data when an image is attached', async () => {
		apiClient.post.mockResolvedValue({ data: { id: 3 }, status: 200 })

		const result = await p2pApi.sendChat('abc-123', {
			message: 'mira esto',
			image: { uri: 'file:///photo.jpg', type: 'image/png', fileName: 'shot.png' },
		})

		expect(apiClient.post).toHaveBeenCalledTimes(1)
		const [url, body, config] = apiClient.post.mock.calls[0]
		expect(url).toBe('/p2p/abc-123/chat')
		expect(body).toBeInstanceOf(FormData)
		expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
		expect(result.success).toBe(true)
	})

	test('omits the message field from the form data when only an image is sent', async () => {
		apiClient.post.mockResolvedValue({ data: { id: 4 }, status: 200 })

		await p2pApi.sendChat('abc-123', { image: { uri: 'file:///photo.jpg' } })

		const [, body] = apiClient.post.mock.calls[0]
		expect(body.has('file')).toBe(true)
		expect(body.has('message')).toBe(false)
	})

	test('surfaces the API error on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Mensaje muy largo' }))

		const result = await p2pApi.sendChat('abc-123', { message: 'x'.repeat(601) })

		expect(result).toEqual({ success: false, error: 'Mensaje muy largo', status: 422 })
	})
})

describe('p2pApi.create', () => {

	const offerPayload = { type: 'sell', coin: 'BANK_CUP', amount: 100, receive: 32000 }

	test('succeeds only on a 201 with data', async () => {
		const created = { uuid: 'new-offer', ...offerPayload }
		apiClient.post.mockResolvedValue({ data: created, status: 201 })

		const result = await p2pApi.create(offerPayload)

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/create', offerPayload)
		expect(result).toEqual({ success: true, data: created, status: 201 })
	})

	test('treats a non-201 2xx as a failure', async () => {
		apiClient.post.mockResolvedValue({ data: { info: 'accepted' }, status: 200 })

		const result = await p2pApi.create(offerPayload)

		expect(result).toEqual({
			success: false,
			error: 'No se pudo crear la oferta P2P',
			details: { info: 'accepted' },
			status: 200,
		})
	})

	test('returns the API error with details on server error', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Límite de ofertas alcanzado' }))

		const result = await p2pApi.create(offerPayload)

		expect(result).toEqual({
			success: false,
			error: 'Límite de ofertas alcanzado',
			details: { error: 'Límite de ofertas alcanzado' },
			status: 422,
		})
	})

	test('falls back to the default Spanish message when the error body is empty of hints', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { fields: ['amount'] }))

		const result = await p2pApi.create(offerPayload)

		expect(result.error).toBe('No se pudo crear la oferta P2P')
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await p2pApi.create(offerPayload)

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('p2pApi.edit', () => {

	test('posts the editable fields to the edit endpoint', async () => {
		const updated = { uuid: 'abc-123', amount: 120 }
		apiClient.post.mockResolvedValue({ data: updated, status: 200 })

		const result = await p2pApi.edit('abc-123', { amount: 120, message: 'nuevo precio' })

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/edit', { amount: 120, message: 'nuevo precio' })
		expect(result).toEqual({ success: true, data: updated, status: 200 })
	})

	test('returns the API error (without details) on server error', async () => {
		apiClient.post.mockRejectedValue(apiError(403, { message: 'Solo el dueño puede editar' }))

		const result = await p2pApi.edit('abc-123', { amount: 120 })

		expect(result).toEqual({ success: false, error: 'Solo el dueño puede editar', status: 403 })
	})

	test('falls back to the default Spanish message when the error body has no hints', async () => {
		apiClient.post.mockRejectedValue(apiError(400, {}))

		const result = await p2pApi.edit('abc-123', { amount: 120 })

		expect(result.error).toBe('No se pudo editar la oferta')
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await p2pApi.edit('abc-123', { amount: 120 })

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('p2pApi.rateOffer', () => {

	test('posts the rating payload', async () => {
		apiClient.post.mockResolvedValue({ data: { ok: true }, status: 200 })

		const result = await p2pApi.rateOffer('abc-123', { rating: 5, comment: 'excelente' })

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/rate', { rating: 5, comment: 'excelente' })
		expect(result).toEqual({ success: true, data: { ok: true }, status: 200 })
	})

	test('surfaces the API error on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(409, { error: 'Ya calificaste esta oferta' }))

		const result = await p2pApi.rateOffer('abc-123', { rating: 5 })

		expect(result).toEqual({ success: false, error: 'Ya calificaste esta oferta', status: 409 })
	})
})

describe('p2pApi.getAverages', () => {

	test('gets the market averages', async () => {
		const averages = { BANK_CUP: { average: 320, count: 12 } }
		apiClient.get.mockResolvedValue({ data: averages, status: 200 })

		const result = await p2pApi.getAverages()

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/averages')
		expect(result).toEqual({ success: true, data: averages, status: 200 })
	})

	test('returns the API error with details on server error', async () => {
		apiClient.get.mockRejectedValue(apiError(500, { message: 'Cache caído' }))

		const result = await p2pApi.getAverages()

		expect(result).toEqual({
			success: false,
			error: 'Cache caído',
			details: { message: 'Cache caído' },
			status: 500,
		})
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.get.mockRejectedValue(networkError())

		const result = await p2pApi.getAverages()

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('p2pApi.apply', () => {

	test('posts to the apply endpoint', async () => {
		apiClient.post.mockResolvedValue({ data: { status: 'processing' }, status: 200 })

		const result = await p2pApi.apply('abc-123')

		expect(apiClient.post).toHaveBeenCalledWith('/p2p/abc-123/apply')
		expect(result).toEqual({ success: true, data: { status: 'processing' }, status: 200 })
	})

	test('surfaces the API error on failure', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'Requiere KYC' }))

		const result = await p2pApi.apply('abc-123')

		expect(result).toEqual({ success: false, error: 'Requiere KYC', status: 422 })
	})
})

describe('p2pApi.peerProfile', () => {

	test('gets the peer profile silently (no global loading bar)', async () => {
		const profile = { user: { uuid: 'user-9' }, viewer_gold: false }
		apiClient.get.mockResolvedValue({ data: profile, status: 200 })

		const result = await p2pApi.peerProfile('user-9')

		expect(apiClient.get).toHaveBeenCalledWith('/p2p/user/user-9', { silent: true })
		expect(result).toEqual({ success: true, data: profile, status: 200 })
	})

	test('surfaces the API error on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(404, { error: 'Usuario no encontrado' }))

		const result = await p2pApi.peerProfile('ghost')

		expect(result).toEqual({ success: false, error: 'Usuario no encontrado', status: 404 })
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.get.mockRejectedValue(networkError())

		const result = await p2pApi.peerProfile('user-9')

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})
