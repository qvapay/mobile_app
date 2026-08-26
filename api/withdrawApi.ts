import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Parámetros de `withdrawApi.withdraw` (paso 2 del flujo de retiro). */
export type WithdrawInput = {
	/** Amount in USD (ignored with source 'satoshis'). */
	amount?: number | string
	/** Coin ticker (e.g., "BANK", "BTCLN", etc.). */
	coin: string
	/** Withdrawal details object (form fields). */
	details: Record<string, unknown>
	/** User's 4-digit PIN or 6-digit OTP. */
	pin: number | string
	/** Payment method (defaults to coin ticker). */
	payMethod?: string
	/** Optional personal note for the withdrawal. */
	note?: string
	/** Funds origin (default balance). */
	source?: 'balance' | 'satoshis'
	/** Sats to redeem when source is 'satoshis'. */
	amountSats?: number
	/** Per-attempt key (`[A-Za-z0-9._-]{8,64}`) — see `helpers/idempotency.js`. */
	idempotencyKey?: string
}

/** Payload decodificado de `POST /lightning/decode` (BOLT11 o Lightning Address). */
export type LightningDecodePayload = {
	kind: string
	amount_sat?: number
	description?: string
	expires_at?: string
	min_sat?: number
	max_sat?: number
}

export const withdrawApi = {

	/**
	 * Emails the user a fresh 4-digit PIN to authorize a withdrawal
	 * (`POST /user/reset-pin`, requires auth). Step 1 of the two-step
	 * withdraw flow — the PIN is then passed to `withdraw`.
	 * Side effect: this ROTATES the account PIN (a new one is generated,
	 * persisted and emailed). Users with TOTP 2FA can skip this and use
	 * their 6-digit code instead.
	 *
	 * @returns `{ success, data?, error?, details?, status? }`
	 */
	requestPin: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/user/reset-pin')
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || i18n.t('api.withdraw.pinSendFailed'),
					details: errorData,
					status: error.response.status
				}
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Executes a withdrawal (`POST /withdraw`). Step 2 of the flow: sends
	 * amount, pay_method, the coin-specific `details` form fields and the
	 * verification code. The backend accepts either the 4-digit account PIN
	 * (see `requestPin`) or a 6-digit TOTP code, and enforces coin min/max
	 * limits plus KYC above certain amounts.
	 * With `source: 'satoshis'` (BTCLN only) the withdrawal redeems the user's
	 * cashback sats: `amountSats` replaces `amount` and the backend debits
	 * `User.satoshis` instead of the USD balance (fee 0).
	 * `pin` travels as a string so TOTP codes with leading zeros stay intact
	 * (the backend does `String(pin)` anyway).
	 *
	 * @param params
	 * @param params.amount - Amount in USD (ignored with source 'satoshis')
	 * @param params.coin - Coin ticker (e.g., "BANK", "BTCLN", etc.)
	 * @param params.details - Withdrawal details object (form fields)
	 * @param params.pin - User's 4-digit PIN or 6-digit OTP
	 * @param params.payMethod - Payment method (defaults to coin ticker)
	 * @param params.note - Optional personal note for the withdrawal
	 * @param params.source - Funds origin (default balance)
	 * @param params.amountSats - Sats to redeem when source is 'satoshis'
	 * @param params.idempotencyKey - Per-attempt key (`[A-Za-z0-9._-]{8,64}`);
	 *   a retried request that already completed returns the ORIGINAL withdrawal with
	 *   `duplicate: true`, and a retry while the original is in flight gets
	 *   `409 { code: 'DUPLICATE_REQUEST' }` (see `helpers/idempotency.js`)
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the created withdrawal + transaction
	 */
	withdraw: async ({ amount, coin, details, pin, payMethod, note, source, amountSats, idempotencyKey }: WithdrawInput): Promise<ApiResult<unknown>> => {

		try {

			const payload: {
				pay_method: string
				details: Record<string, unknown>
				pin: string
				source?: 'satoshis'
				amount_sats?: number
				amount?: number
				idempotency_key?: string
				note?: string
			} = {
				pay_method: payMethod || coin,
				details: details || {},
				pin: String(pin),
				...(source === 'satoshis'
					? { source: 'satoshis', amount_sats: Number(amountSats) }
					: { amount: Number(amount) }),
				...(idempotencyKey && { idempotency_key: idempotencyKey }),
			}

			// Add note if provided
			if (note) { payload.note = note }
			const response = await apiClient.post('/withdraw', payload)
			return { success: true, data: response.data, status: response.status }

		} catch (err) {

			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || i18n.t('api.withdraw.withdrawFailed'),
					details: errorData,
					status: error.response.status
				}
			}

			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Decodes a Lightning destination (`POST /lightning/decode`, silent) so the
	 * UI can show the authoritative amount, description and expiry of a BOLT11
	 * invoice — or the min/max range of a Lightning Address — before submitting.
	 * Purely informational: failures should never block the flow.
	 *
	 * @param invoice - BOLT11 / Lightning Address / LNURL-pay target
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ kind, amount_sat?, description?, expires_at?, min_sat?, max_sat? }`
	 */
	decodeLightning: async (invoice: string): Promise<ApiResult<LightningDecodePayload>> => {
		try {
			const response = await apiClient.post('/lightning/decode', { invoice }, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				return { success: false, error: error.response.data.error || i18n.t('api.withdraw.lightningInvalid'), status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},
}
