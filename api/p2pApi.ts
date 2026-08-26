import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiFailure, ApiResult, ApiSuccess } from '../types/api'
import type { P2PIndexEnvelope, P2PMarketAverages, P2POffer } from '../types/domain'

/** Filtros de `GET /p2p/index`. */
export type P2PIndexFilters = {
	page?: number
	order?: 'asc' | 'desc' | string
	take?: number
	type?: 'buy' | 'sell' | string
	my?: boolean
	only_kyc?: boolean
	only_vip?: boolean
	min?: number
	max?: number
	ratio_min?: number
	ratio_max?: number
	coin?: string
	orderBy?: string
}

/**
 * Resultado de `p2pApi.index`: además del contrato estándar, el éxito expone
 * el paginador aplanado (`offers` = `data.data`, más `current_page`/`per_page`/`total`).
 */
export type P2PIndexResult =
	| (ApiSuccess<P2PIndexEnvelope> & {
		current_page: number
		per_page: number
		total: number
		offers: P2POffer[]
	})
	| ApiFailure

/** El detalle llega como la oferta pelada o envuelta en `{ p2p }` — los consumidores aceptan ambas. */
export type P2PShowPayload = P2POffer | { p2p: P2POffer }

/** Payload de creación de oferta (campos extra pasan tal cual al backend). */
export type P2PCreateInput = {
	type: 'buy' | 'sell'
	coin: string
	amount: string | number
	receive: string | number
	idempotency_key?: string
} & Record<string, unknown>

// P2P API functions
export const p2pApi = {
	/**
	 * Lists P2P marketplace offers with optional filters (`GET /p2p/index`).
	 * Returns a paginated envelope; the offers themselves live in `offers`
	 * (alias of `data.data`).
	 *
	 * @param {Object} filters - Optional filters for P2P offers
	 * @param {number} [filters.page] - Page number (default: 1)
	 * @param {string} [filters.order] - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @param {number} [filters.take] - Number of items per page (default: 50)
	 * @param {string} [filters.type] - Offer type: 'buy' or 'sell'
	 * @param {boolean} [filters.my] - Only the current user's offers
	 * @param {boolean} [filters.only_kyc] - Only offers restricted to KYC users
	 * @param {boolean} [filters.only_vip] - Only offers restricted to VIP users
	 * @param {number} [filters.min] - Minimum amount filter (default: 0)
	 * @param {number} [filters.max] - Maximum amount filter (default: 1000000)
	 * @param {number} [filters.ratio_min] - Minimum ratio filter (default: 0)
	 * @param {number} [filters.ratio_max] - Maximum ratio filter (default: 0)
	 * @param {string} [filters.coin] - Coin ticker to filter by (e.g., 'ETECSA', 'BANK_CUP', 'CLASICA')
	 * @param {string} [filters.orderBy] - Column to sort by
	 * @returns {Promise<Object>} `{ success, data?, current_page?, per_page?, total?, offers?, error?, details?, status? }`
	 */
	index: async (filters: P2PIndexFilters = {}): Promise<P2PIndexResult> => {

		try {
			// Build query parameters
			const params = new URLSearchParams()

			// Add pagination parameters
			if (filters.page) params.append('page', filters.page.toString())
			if (filters.order) params.append('order', filters.order)
			if (filters.take) params.append('take', filters.take.toString())

			// Add filter parameters
			if (filters.type) params.append('type', filters.type)
			if (filters.my) params.append('my', 'true')
			if (filters.only_kyc) params.append('only_kyc', '1')
			if (filters.only_vip) params.append('only_vip', '1')
			if (filters.min !== undefined)
				params.append('min', filters.min.toString())
			if (filters.max !== undefined)
				params.append('max', filters.max.toString())
			if (filters.ratio_min !== undefined)
				params.append('ratio_min', filters.ratio_min.toString())
			if (filters.ratio_max !== undefined)
				params.append('ratio_max', filters.ratio_max.toString())
			if (filters.coin) params.append('coin', filters.coin)
			if (filters.orderBy) params.append('orderBy', filters.orderBy)

			// Make the API request
			const response = await apiClient.get(`/p2p/index?${params.toString()}`)

			return {
				success: true,
				data: response.data,
				current_page: response.data.current_page,
				per_page: response.data.per_page,
				total: response.data.total,
				offers: response.data.data
			}

		} catch (err) {
			const error = err as ApiClientError

			// Handle specific API errors
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.message || i18n.t('api.p2p.offersLoadFailed'),
					details: errorData,
					status: error.response.status
				}
			}

			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Get P2P offers by type (buy or sell)
	 * @param {string} type - Offer type: 'buy' or 'sell'
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Filtered P2P offers response
	 */
	getByType: async (type: 'buy' | 'sell', additionalFilters: P2PIndexFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, type })
	},

	/**
	 * Get P2P offers by coin
	 * @param {string} coin - Coin ticker (e.g., 'ETECSA', 'BANK_CUP', 'CLASICA')
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Filtered P2P offers response
	 */
	getByCoin: async (coin: string, additionalFilters: P2PIndexFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, coin })
	},

	/**
	 * Get P2P offers with amount range filter
	 * @param {number} min - Minimum amount
	 * @param {number} max - Maximum amount
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Filtered P2P offers response
	 */
	getByAmountRange: async (min: number, max: number, additionalFilters: P2PIndexFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, min, max })
	},

	/**
	 * Get buy offers for a specific coin
	 * @param {string} coin - Coin ticker
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Buy offers response
	 */
	getBuyOffers: async (coin: string, additionalFilters: P2PIndexFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, type: 'buy', coin })
	},

	/**
	 * Get sell offers for a specific coin
	 * @param {string} coin - Coin ticker
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Sell offers response
	 */
	getSellOffers: async (coin: string, additionalFilters: P2PIndexFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, type: 'sell', coin })
	},

	/**
	 * Get P2P offers with pagination
	 * @param {number} page - Page number
	 * @param {number} perPage - Items per page
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Paginated P2P offers response
	 */
	getPaginated: async (page: number = 1, perPage: number = 50, additionalFilters: P2PIndexFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, page, take: perPage })
	},

	/**
	 * Gets the full detail of a single P2P offer (`GET /p2p/{uuid}`).
	 * Private offers return 403 for anyone but the involved parties — the
	 * client interceptor leaves that for the screen to handle.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the offer (owner, peer, status, details, ...)
	 */
	show: async (p2p_uuid: string): Promise<ApiResult<P2PShowPayload>> => {
		try {
			const response = await apiClient.get(`/p2p/${p2p_uuid}`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Cancels a P2P offer/escrow (`POST /p2p/{uuid}/cancel`).
	 * Moves the offer to `cancelled` and releases any locked funds.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	cancel: async (p2p_uuid: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/cancel`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Marks the escrow as paid by the payer (`POST /p2p/{uuid}/paid`).
	 * Moves the offer from `processing` to `paid`; the counterpart must then
	 * confirm via `confirmReceived`.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @param {string} [tx_id] - Optional external payment reference/transaction id
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	markPaid: async (p2p_uuid: string, tx_id: string = ''): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/paid`, { tx_id })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Confirms payment received and releases the escrow (`POST /p2p/{uuid}/received`).
	 * Final, irreversible step of the trade: moves the offer to `completed`
	 * and settles balances.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	confirmReceived: async (p2p_uuid: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/received`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets the chat history for a P2P offer (`GET /p2p/{uuid}/chat`).
	 * Loads the full history; live updates arrive separately over SSE
	 * (see `useP2PChatSSE`), which only pushes new messages.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the messages array
	 */
	getChat: async (p2p_uuid: string): Promise<ApiResult<unknown[]>> => {
		try {
			const response = await apiClient.get(`/p2p/${p2p_uuid}/chat`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Sends a chat message on a P2P offer (`POST /p2p/{uuid}/chat`).
	 * Supports plain text, stickers (encoded in the text as `:sticker:name.webm`)
	 * and image uploads — with an image the request switches to
	 * multipart/form-data (`file` + optional `message` fields).
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @param {{ message?: string, image?: { uri: string, type?: string, fileName?: string } }} payload - Message payload
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the stored message
	 */
	sendChat: async (p2p_uuid: string, payload: { message?: string, image?: { uri: string, type?: string, fileName?: string } }): Promise<ApiResult<unknown>> => {
		try {
			if (payload.image) {
				const formData = new FormData()
				formData.append('file', {
					uri: payload.image.uri,
					type: payload.image.type || 'image/jpeg',
					name: payload.image.fileName || 'photo.jpg',
				})
				if (payload.message) {
					formData.append('message', payload.message)
				}
				const response = await apiClient.post(`/p2p/${p2p_uuid}/chat`, formData, {
					headers: { 'Content-Type': 'multipart/form-data' },
				})
				return { success: true, data: response.data, status: response.status }
			}
			const response = await apiClient.post(`/p2p/${p2p_uuid}/chat`, payload)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Creates a new P2P offer (`POST /p2p/create`).
	 * Success is a 201 — or a 200 with `duplicate: true`, which is the
	 * idempotent replay of an offer already created with the same
	 * `idempotency_key` (the payload carries the ORIGINAL offer).
	 * Any other 2xx is treated as a failure.
	 * How many open offers a user may hold depends on their role
	 * (regular 1, KYC 3, VIP 5, Gold 10, ...); the backend enforces it.
	 *
	 * @param {Object} data - The offer payload: type ('buy'|'sell'), coin, amount, receive, details, flags (only_kyc, only_vip, private), optional idempotency_key, ...
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the created offer
	 */
	create: async (data: P2PCreateInput): Promise<ApiResult<P2POffer & { duplicate?: boolean }>> => {
		try {
			const response = await apiClient.post('/p2p/create', data)
			if (response.data && (response.status === 201 || (response.status === 200 && response.data.duplicate))) {
				return { success: true, data: response.data, status: response.status }
			} else {
				return {
					success: false,
					error: response.data?.error || i18n.t('api.p2p.createFailed'),
					details: response.data,
					status: response.status
				}
			}
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error:
						errorData.error ||
						errorData.message ||
						i18n.t('api.p2p.createFailed'),
					details: errorData,
					status: error.response.status
				}
			}

			return {
				success: false,
				error: error.message || i18n.t('api.common.networkError'),
				status: error.response?.status
			}
		}
	},

	/**
	 * Edits an open P2P offer (`POST /p2p/{uuid}/edit`, owner only).
	 * Only works while the offer is still `open` (no peer yet).
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @param {Object} data - Editable fields: amount, receive, only_vip, message
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the updated offer
	 */
	edit: async (p2p_uuid: string, data: { amount?: string | number, receive?: string | number, only_vip?: boolean | 0 | 1, message?: string }): Promise<ApiResult<P2POffer>> => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/edit`, data)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				return {
					success: false,
					error: error.response.data.error || error.response.data.message || i18n.t('api.p2p.editFailed'),
					status: error.response.status
				}
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Rates the counterpart after a completed trade (`POST /p2p/{uuid}/rate`).
	 * Ratings feed the peer's trust score shown on their P2P profile.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @param {Object} payload - The rating payload (star rating, optional comment)
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	rateOffer: async (p2p_uuid: string, payload: Record<string, unknown>): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/rate`, payload)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets market average rates per coin (`GET /p2p/averages`, server-cached).
	 * Used to suggest fair ratios when creating offers.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` maps ticks to `{ name, average, average_buy, average_sell, count }`
	 */
	getAverages: async (): Promise<ApiResult<P2PMarketAverages>> => {
		try {
			const response = await apiClient.get('/p2p/averages')
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.p2p.averagesLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Applies to someone else's P2P offer (`POST /p2p/{uuid}/apply`).
	 * The caller becomes the peer and the offer moves from `open` to `processing`.
	 *
	 * @param {string} p2p_uuid - The P2P offer UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	apply: async (p2p_uuid: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/apply`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.response?.data?.message || error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets the P2P peer profile dashboard payload — user, stats, offers,
	 * ratings and top coins (`GET /p2p/user/{uuid}`, sent silently so it
	 * never flashes the global loading bar).
	 * The `viewer_gold` flag in the response tells the UI whether to unlock
	 * GOLD-only panels.
	 *
	 * @param {string} uuid - Target user's UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	peerProfile: async (uuid: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/p2p/user/${uuid}`, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message || i18n.t('api.p2p.profileLoadFailed'),
				status: error.response?.status,
			}
		}
	},
}

// Export default for convenience
export default p2pApi
