import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Params de modo de los catálogos (`countries`/`featured`/`favorites`/`categories`/`country`/`brand`...), anexados tal cual al query string. */
export type StoreCatalogParams = Record<string, string | number | boolean | null | undefined>

/** Body de `purchaseVoucher` (`amount` solo para ofertas de valor variable; `use_satoshis` aplica el cashback en sats como descuento). */
export type VoucherPurchaseInput = {
	offer_id: string
	country: string
	brand: string
	amount?: number
	use_satoshis?: boolean
}

/** Body de `purchaseTopup` (`use_satoshis` aplica el cashback en sats como descuento). */
export type TopupPurchaseInput = {
	offer_id: string
	phone_number: string
	country: string
	amount?: number
	use_satoshis?: boolean
}

/** Body de `purchasePhonePackage` (`use_satoshis` aplica el cashback en sats como descuento). */
export type PhonePackagePurchaseInput = {
	phone_package_id: string | number
	phone_number: string
	use_satoshis?: boolean
}

/**
 * Wraps a request into the standard `{ success, data, error?, details?, status? }`
 * envelope used by every endpoint in this module.
 *
 * @param request - Thunk that performs the axios call.
 * @param fallbackError - Localized message used when the backend provides none.
 * @returns The response envelope.
 */
const wrap = async <T = unknown>(request: () => Promise<{ data: T, status: number }>, fallbackError: string): Promise<ApiResult<T>> => {
	try {
		const response = await request()
		return { success: true, data: response.data, status: response.status }
	} catch (err) {
		const error = err as ApiClientError
		if (error.response?.data) {
			const errorData = error.response.data
			return {
				success: false,
				error: errorData.error || errorData.message || fallbackError,
				details: errorData,
				status: error.response.status,
			}
		}
		return { success: false, error: error.message || i18n.t('api.common.networkErrorShort'), status: error.response?.status }
	}
}

/**
 * Serializes catalog params to a query string. `true` becomes `?countries=true`
 * — the API in producción rechaza flags sin valor (`?countries=`) con 400;
 * false/null/undefined/'' are dropped.
 *
 * @param params - Query parameters.
 * @returns URL-encoded query string (may be empty).
 */
const buildQuery = (params: StoreCatalogParams | null | undefined): string => {
	const qs = new URLSearchParams()
	Object.entries(params || {}).forEach(([k, v]) => {
		if (v === true) qs.append(k, 'true')
		else if (v !== undefined && v !== null && v !== false && v !== '') qs.append(k, String(v))
	})
	return qs.toString()
}

export const storeApi = {

	// ---------------------- GIFT CARDS (VOUCHERS) ----------------------

	/**
	 * Fetches the voucher (Zendit gift cards) catalog
	 * (`GET /store/voucher-catalog`). Mutually exclusive modes via params:
	 *   `{ countries: true }` → country list with counts
	 *   `{ featured: true }`  → global top 12
	 *   `{ favorites: true }` → the user's top 6 (requires auth)
	 *   `{ categories: true, country? }` → categories with counts
	 *   `{ country: 'US' }`   → brands for that country
	 *   `{ country: 'US', brand: 'amazon' }` → offers for one brand
	 *
	 * @param params - Mode params as described above.
	 * @returns `{ success, data?, error?, details?, status? }` — `data` shape depends on the mode
	 */
	getVoucherCatalog: async (params: StoreCatalogParams = {}): Promise<ApiResult<unknown>> => {
		const qs = buildQuery(params)
		const url = qs ? `/store/voucher-catalog?${qs}` : '/store/voucher-catalog'
		return wrap(() => apiClient.get(url), i18n.t('api.store.voucherCatalogLoadFailed'))
	},

	/**
	 * Purchases a gift-card voucher with QvaPay balance
	 * (`POST /store/voucher/purchase`). Validates required fields client-side
	 * and short-circuits with a local `status: 400` when any is missing.
	 *
	 * @param body - Purchase payload (`amount` only for variable-value offers; `use_satoshis` applies the sats cashback as discount).
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the purchase with redemption info
	 */
	purchaseVoucher: async (body: VoucherPurchaseInput): Promise<ApiResult<unknown>> => {
		if (!body?.offer_id || !body?.country || !body?.brand) { return { success: false, error: i18n.t('api.common.purchaseMissingData'), status: 400 } }
		return wrap(() => apiClient.post('/store/voucher/purchase', body), i18n.t('api.store.voucherPurchaseFailed'))
	},

	// ---------------------- TOPUPS (LATAM + CUBA) ----------------------

	/**
	 * Fetches the unified phone top-up catalog (`GET /store/topup-catalog`).
	 * Cuba resolves to Cubacel packages (`source: 'cuba'`); every other
	 * country returns Zendit brands (`source: 'global'`). Modes:
	 *   `{ countries: true }` | `{ featured: true }`
	 *   `{ country: 'CU' }` | `{ country: 'MX', brand: 'telcel', subType? }`
	 *
	 * @param params - Mode params as described above.
	 * @returns `{ success, data?, error?, details?, status? }` — `data` shape depends on the mode
	 */
	getTopupCatalog: async (params: StoreCatalogParams = {}): Promise<ApiResult<unknown>> => {
		const qs = buildQuery(params)
		const url = qs ? `/store/topup-catalog?${qs}` : '/store/topup-catalog'
		return wrap(() => apiClient.get(url), i18n.t('api.store.topupCatalogLoadFailed'))
	},

	/**
	 * Purchases a LATAM (Zendit) phone top-up (`POST /store/topup`).
	 * Validates required fields client-side (local `status: 400` when missing).
	 * For Cuban numbers use `purchasePhonePackage` instead.
	 *
	 * @param body - Top-up payload (`use_satoshis` applies the sats cashback as discount).
	 * @returns `{ success, data?, error?, details?, status? }`
	 */
	purchaseTopup: async (body: TopupPurchaseInput): Promise<ApiResult<unknown>> => {
		if (!body?.offer_id || !body?.phone_number || !body?.country) { return { success: false, error: i18n.t('api.store.topupMissingData'), status: 400 } }
		return wrap(() => apiClient.post('/store/topup', body), i18n.t('api.store.topupPurchaseFailed'))
	},

	/**
	 * Purchases a Cubacel phone package for Cuba (`POST /store/phone_package`).
	 * Validates required fields client-side (local `status: 400` when missing).
	 *
	 * @param body - Package payload (`use_satoshis` applies the sats cashback as discount).
	 * @returns `{ success, data?, error?, details?, status? }`
	 */
	purchasePhonePackage: async (body: PhonePackagePurchaseInput): Promise<ApiResult<unknown>> => {
		if (!body?.phone_package_id || !body?.phone_number) { return { success: false, error: i18n.t('api.store.topupMissingData'), status: 400 } }
		return wrap(() => apiClient.post('/store/phone_package', body), i18n.t('api.store.topupPurchaseFailed'))
	},

	// ---------------------- PURCHASES ----------------------

	/**
	 * Lists the user's store purchases — vouchers and top-ups (`GET /store/my`).
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the purchases list
	 */
	getMyPurchases: async (): Promise<ApiResult<unknown>> => wrap(() => apiClient.get('/store/my'), i18n.t('api.common.purchasesLoadFailed')),

	/**
	 * Gets one purchase with its redemption details (`GET /store/my/{id}`).
	 *
	 * @param id - Purchase identifier from `getMyPurchases`.
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the full purchase (codes, PINs, status)
	 */
	getPurchaseDetail: async (id: string | number): Promise<ApiResult<unknown>> => wrap(() => apiClient.get(`/store/my/${id}`), i18n.t('api.store.purchaseDetailLoadFailed')),
}
