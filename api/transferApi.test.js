/**
 * Unit tests for api/transferApi.js — node environment with ./client mocked
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import { transferApi } from './transferApi'
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

describe('transferApi.getLatestTransactions', () => {

	const page = { data: [{ uuid: 'tx-1' }], current_page: 1 }

	test('requests /transaction without a query string when no filters are given', async () => {
		apiClient.get.mockResolvedValue({ data: page, status: 200 })

		const result = await transferApi.getLatestTransactions()

		expect(apiClient.get).toHaveBeenCalledWith('/transaction')
		expect(result).toEqual({ success: true, data: page, status: 200 })
	})

	test('serializes filters into the query string, URL-encoding keys and values', async () => {
		apiClient.get.mockResolvedValue({ data: page, status: 200 })

		await transferApi.getLatestTransactions({
			status: 'paid',
			start_date: '2026-07-01 00:00',
			page: 2,
			take: 20,
		})

		expect(apiClient.get).toHaveBeenCalledWith(
			'/transaction?status=paid&start_date=2026-07-01%2000%3A00&page=2&take=20'
		)
	})

	test('skips undefined, null and empty-string filter values', async () => {
		apiClient.get.mockResolvedValue({ data: page, status: 200 })

		await transferApi.getLatestTransactions({
			status: 'paid',
			type: undefined,
			user_id: null,
			end_date: '',
		})

		expect(apiClient.get).toHaveBeenCalledWith('/transaction?status=paid')
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(401, { error: 'No autenticado' }))

		const result = await transferApi.getLatestTransactions()

		expect(result).toEqual({ success: false, error: 'No autenticado', status: 401 })
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.get.mockRejectedValue(networkError())

		const result = await transferApi.getLatestTransactions()

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('transferApi.getLatestSentTransfers', () => {

	test('requests the latest recipients with the default take of 10', async () => {
		const users = [{ uuid: 'user-1' }]
		apiClient.get.mockResolvedValue({ data: users, status: 200 })

		const result = await transferApi.getLatestSentTransfers()

		expect(apiClient.get).toHaveBeenCalledWith('/transaction/latestusers?take=10')
		expect(result).toEqual({ success: true, data: users, status: 200 })
	})

	test('passes a custom take value', async () => {
		apiClient.get.mockResolvedValue({ data: [], status: 200 })

		await transferApi.getLatestSentTransfers(5)

		expect(apiClient.get).toHaveBeenCalledWith('/transaction/latestusers?take=5')
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(429, { message: 'Demasiadas peticiones' }))

		const result = await transferApi.getLatestSentTransfers()

		expect(result).toEqual({ success: false, error: 'Demasiadas peticiones', status: 429 })
	})
})

describe('transferApi.transferMoney', () => {

	test('posts amount, description, to and pin — stringifying amount and pin', async () => {
		const transaction = { uuid: 'tx-9', status: 'paid' }
		apiClient.post.mockResolvedValue({ data: transaction, status: 200 })

		const result = await transferApi.transferMoney({
			amount: 0.2,
			description: 'July salary',
			to: 'ceo@qvapay.com',
			pin: 1111,
		})

		expect(apiClient.post).toHaveBeenCalledWith('/transaction/transfer', {
			amount: '0.2',
			description: 'July salary',
			to: 'ceo@qvapay.com',
			pin: '1111',
		})
		expect(result).toEqual({ success: true, data: transaction, status: 200 })
	})

	test('keeps string amount and pin untouched (leading zeros preserved)', async () => {
		apiClient.post.mockResolvedValue({ data: {}, status: 200 })

		await transferApi.transferMoney({
			amount: '10.50',
			description: '',
			to: 'username',
			pin: '0123',
		})

		expect(apiClient.post).toHaveBeenCalledWith('/transaction/transfer', {
			amount: '10.50',
			description: '',
			to: 'username',
			pin: '0123',
		})
	})

	test('returns the API error on failure (e.g. wrong PIN)', async () => {
		apiClient.post.mockRejectedValue(apiError(422, { error: 'PIN incorrecto' }))

		const result = await transferApi.transferMoney({
			amount: 1,
			description: 'x',
			to: 'user',
			pin: '1111',
		})

		expect(result).toEqual({ success: false, error: 'PIN incorrecto', status: 422 })
	})

	test('falls back to the message field when the error body has no error field', async () => {
		apiClient.post.mockRejectedValue(apiError(400, { message: 'Saldo insuficiente' }))

		const result = await transferApi.transferMoney({
			amount: 999999,
			description: 'x',
			to: 'user',
			pin: '1111',
		})

		expect(result).toEqual({ success: false, error: 'Saldo insuficiente', status: 400 })
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.post.mockRejectedValue(networkError())

		const result = await transferApi.transferMoney({
			amount: 1,
			description: 'x',
			to: 'user',
			pin: '1111',
		})

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})

describe('transferApi.getTransactionDetails', () => {

	test('gets the transaction by uuid', async () => {
		const transaction = { uuid: 'tx-1', amount: '5.00' }
		apiClient.get.mockResolvedValue({ data: transaction, status: 200 })

		const result = await transferApi.getTransactionDetails('tx-1')

		expect(apiClient.get).toHaveBeenCalledWith('/transaction/tx-1')
		expect(result).toEqual({ success: true, data: transaction, status: 200 })
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(404, { error: 'Transacción no encontrada' }))

		const result = await transferApi.getTransactionDetails('missing')

		expect(result).toEqual({ success: false, error: 'Transacción no encontrada', status: 404 })
	})
})

describe('transferApi.getTransactionPDF', () => {

	test('gets the PDF payload for the transaction', async () => {
		const pdf = { url: 'https://qvapay.com/receipt.pdf' }
		apiClient.get.mockResolvedValue({ data: pdf, status: 200 })

		const result = await transferApi.getTransactionPDF('tx-1')

		expect(apiClient.get).toHaveBeenCalledWith('/transaction/tx-1/pdf')
		expect(result).toEqual({ success: true, data: pdf, status: 200 })
	})

	test('returns the API error on failure', async () => {
		apiClient.get.mockRejectedValue(apiError(403, { message: 'Sin permiso' }))

		const result = await transferApi.getTransactionPDF('tx-1')

		expect(result).toEqual({ success: false, error: 'Sin permiso', status: 403 })
	})

	test('returns a network error result when there is no response', async () => {
		apiClient.get.mockRejectedValue(networkError())

		const result = await transferApi.getTransactionPDF('tx-1')

		expect(result).toEqual({ success: false, error: 'Network Error', status: undefined })
	})
})
