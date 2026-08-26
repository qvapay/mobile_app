import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiFailure, ApiResult, ApiSuccess } from '../types/api'
import type { User } from '../types/domain'

/**
 * Resultado de `userApi.requestKYCSession`: el éxito trae `sessionToken` extra
 * (para el SDK nativo) además de `data` (la URL hospedada de verificación).
 */
export type KYCSessionResult = (ApiSuccess<string> & { sessionToken: string | null }) | ApiFailure

/** Estado de KYC del usuario (`GET /user/kyc`, desenvuelto de `data.data`). */
export type KYCStatusPayload = {
	uuid: string
	kyc: boolean
	kyc_status: 'none' | 'pending' | 'approved' | 'declined'
}

/** Resultado de `userApi.getKYCStatus`: el éxito trae `raw` (body sin desenvolver) extra. */
export type KYCStatusResult = (ApiSuccess<KYCStatusPayload> & { raw: unknown }) | ApiFailure

/** Datos de verificación de teléfono (`POST /user/verify/phone`, flujo en 2 pasos). */
export type PhoneVerificationInput = {
	/** The phone number. */
	phone: string
	/** The country code. */
	country: string
	/** The verification code (verification step only). */
	code?: string
	/** Whether this is the verification step. */
	verify?: boolean
}

/** Body de `PUT /user/update/password`. */
export type PasswordChangeInput = {
	/** The current password. */
	old_password: string
	/** The new password (min 8 chars). */
	new_password: string
}

/** Parámetros de `userApi.registerCompany` (registro de empresa, multipart). */
export type CompanyRegisterInput = {
	/** Flat form fields (see enterpriseForm.buildRegisterFields). */
	fields: Record<string, string>
	/** Statutes PDF from the document picker. */
	file: { uri: string, name?: string }
}

/** Body de `POST /user/gold` (compra de Gold Check con saldo). */
export type GoldPurchaseInput = {
	/** The target user's UUID. */
	uuid: string
	/** The subscription duration. */
	duration: string
}

/** Body de `POST /user/payment-methods`. */
export type PaymentMethodInput = {
	/** Coin tick. */
	coin: string
	/** Coin-specific form fields. */
	details: Record<string, unknown>
}

/**
 * Resultado de `userApi.createPaymentMethod`: `success` se calcula como
 * boolean (`status === 200/201`), no como literal — de ahí la forma propia.
 */
export type PaymentMethodCreateResult = { success: boolean, data?: unknown, status?: number } | ApiFailure

/** Secreto TOTP recién generado (`POST /auth/create-2fa` sin body). */
export type TwoFactorSecretPayload = {
	secret: string
	/** Para pintar el QR en el authenticator. */
	otpauth_url: string
}

/** Body de `POST /user/gold/validate-receipt`. */
export type GoldReceiptInput = {
	/** The purchase receipt/token. */
	receipt: string
	/** 'ios' or 'android'. */
	platform: string
	/** The product ID. */
	productId: string
	/** The transaction ID. */
	transactionId: string
}

/** Parámetros de `userApi.uploadAvatar` (multipart `file` + `type`). */
export type AvatarUploadInput = {
	/** The local image file. */
	file: { uri: string, name?: string, type?: string }
	/** Which image slot to replace. */
	uploadType?: 'avatar' | 'cover'
}

export const userApi = {

	/**
	 * Heartbeat (`POST /user/heartbeat`): marks the current user as online and
	 * fetches the online status of tracked users (P2P peers/chats). Sent with
	 * `silent: true` so the periodic ping never flashes the global loading bar.
	 *
	 * @param trackedUserIds - Array of user UUIDs to check (max 100)
	 * @returns `{ success, data?, error? }` — `data.statuses` maps uuid → online boolean
	 */
	heartbeat: async (trackedUserIds: string[] = []): Promise<ApiResult<unknown>> => {
		try {
			const body = trackedUserIds.length > 0 ? { trackedUserIds } : {}
			const response = await apiClient.post('/user/heartbeat', body, { silent: true })
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message }
		}
	},

	/**
	 * Searches for a user by uuid, username, email or verified phone number
	 * (`POST /user/search`). Used to resolve transfer recipients.
	 *
	 * @param search - The uuid, username, email or verified phone number to look up
	 * @returns `{ success, data?, error?, status? }` — `data` is the matched public profile
	 */
	searchUser: async (search: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/search`, { query: search })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Requests a KYC verification session from the identity provider (`POST /user/kyc`).
	 * Unwraps `response.data.data`, so `data` is the hosted verification URL to open.
	 * `sessionToken` (when the backend sends it) feeds the native verification SDK;
	 * without it the caller falls back to opening the hosted URL in the browser.
	 *
	 * @returns `{ success, data?, sessionToken?, error?, status? }` — `data` is the verification URL string
	 */
	requestKYCSession: async (): Promise<KYCSessionResult> => {
		try {
			const response = await apiClient.post(`/user/kyc`)
			return { success: true, data: response.data?.data, sessionToken: response.data?.session_token || null, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.kycSessionFailed'), status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets the current user's KYC status (`GET /user/kyc`).
	 *
	 * @returns `{ success, data?, raw?, error?, status? }` — `data` is `{ uuid, kyc: boolean, kyc_status: 'none'|'pending'|'approved'|'declined' }`, `raw` the unwrapped response body
	 */
	getKYCStatus: async (): Promise<KYCStatusResult> => {
		try {
			const response = await apiClient.get(`/user/kyc`)
			return { success: true, data: response.data?.data, raw: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status, details: error.response?.data }
		}
	},

	/**
	 * Gets the current user's extended profile (`GET /user/extended`) —
	 * the full account payload used across Home and Settings.
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` is the extended profile
	 */
	getUserProfile: async (): Promise<ApiResult<User>> => {
		try {
			const response = await apiClient.get(`/user/extended`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Updates the current user's profile fields (`POST /user/update`).
	 *
	 * @param userData - Partial profile fields to update (name, bio, username, ...)
	 * @returns `{ success, data?, error?, status? }` — `data` is the updated profile
	 */
	updateUser: async (userData: Record<string, unknown>): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/update`, userData)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Starts or completes phone verification (`POST /user/verify/phone`).
	 * Two-step flow: first call sends the code (delivered via Telegram, not SMS),
	 * second call passes `code` + `verify` to confirm it.
	 *
	 * @param phoneData - The phone verification data
	 * @param phoneData.phone - The phone number
	 * @param phoneData.country - The country code
	 * @param phoneData.code - The verification code (verification step only)
	 * @param phoneData.verify - Whether this is the verification step
	 * @returns `{ success, data?, error?, status? }`
	 */
	verifyPhone: async (phoneData: PhoneVerificationInput): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/verify/phone`, phoneData)
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Removes the verified phone number from the account.
	 * Gotcha: removal is `PUT /user/verify/phone` (same path as verification,
	 * different method) — there is no DELETE route.
	 *
	 * @returns `{ success, data?, error?, status? }`
	 */
	removePhone: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.put(`/user/verify/phone`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets a one-time deep link to the QvaPay Telegram bot that binds the
	 * user's Telegram account (`GET /user/verify/telegram`).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` contains the verification link
	 */
	getTelegramVerificationLink: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/user/verify/telegram`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Unlinks the Telegram account (`PUT /user/verify/telegram` — PUT means
	 * "remove" here, mirroring `removePhone`).
	 *
	 * @returns `{ success, data?, error?, status? }`
	 */
	removeTelegram: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.put(`/user/verify/telegram`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Changes the account password (`PUT /user/update/password`).
	 * Requires the current password. Existing sessions stay valid.
	 *
	 * @param passwordData - The password data
	 * @param passwordData.old_password - The current password
	 * @param passwordData.new_password - The new password (min 8 chars)
	 * @returns `{ success, data?, error?, status? }`
	 */
	changePassword: async (passwordData: PasswordChangeInput): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.put(`/user/update/password`, passwordData)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets the user's enterprise registrations and their approval status (`GET /user/company`).
	 * Mirrors the web's Ajustes → Empresa panel.
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ companies: [{ uuid, company_name, director_name, email, activity, employee_count, country, status, statutes_sent, created_at, updated_at }] }`
	 */
	getCompanies: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/user/company`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Submits an enterprise registration from the app (`POST /user/company`,
	 * multipart). Same fields as the web /enterprise wizard; the authenticated
	 * user becomes the company owner. `file` is the statutes PDF from the
	 * document picker (`{ uri, name }`).
	 *
	 * @param params
	 * @param params.fields - Flat form fields (see enterpriseForm.buildRegisterFields).
	 * @param params.file - Statutes PDF.
	 * @returns `{ success, data?, error?, status? }` — 409 = solicitud activa/empresa aprobada duplicada
	 */
	registerCompany: async ({ fields, file }: CompanyRegisterInput): Promise<ApiResult<unknown>> => {
		try {
			const formData = new FormData()
			Object.entries(fields).forEach(([key, value]) => {
				if (value !== undefined && value !== null && value !== '') { formData.append(key, value) }
			})
			formData.append('statutes', {
				uri: file.uri,
				name: file.name || 'estatutos.pdf',
				type: 'application/pdf'
			})
			const config = { headers: { 'Content-Type': 'multipart/form-data' } }
			const response = await apiClient.post('/user/company', formData, config)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.companySubmitFailed'), status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets referral data — invited users list and earnings (`GET /user/referrals`).
	 *
	 * @returns `{ success, data?, error?, status? }`
	 */
	getReferrals: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/user/referrals`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Tracks a referral-share attempt for analytics (`POST /user/referrals/share`).
	 * Fire-and-forget: failures resolve to `{ success: false }` with no error detail.
	 *
	 * @param channel - The share channel (sms, telegram, x, facebook, link)
	 * @returns `{ success, data? }`
	 */
	trackShareAttempt: async (channel: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/referrals/share`, { channel })
			return { success: true, data: response.data }
		} catch (error) { return { success: false } }
	},

	/**
	 * Gets the Gold Check subscription status (`GET /user/gold`).
	 * Unwraps `response.data.user`, so `data` is the user object with
	 * `golden_check` / expiration fields.
	 *
	 * @returns `{ success, data?, error?, status? }`
	 */
	getGoldCheckStatus: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/user/gold`)
			return { success: true, data: response.data.user, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Purchases a Gold Check with QvaPay balance (`POST /user/gold`).
	 * Can gift it to another user via `uuid`. For App Store / Play purchases
	 * see `validateGoldReceipt` instead.
	 *
	 * @param purchaseData - The purchase data
	 * @param purchaseData.uuid - The target user's UUID
	 * @param purchaseData.duration - The subscription duration
	 * @returns `{ success, data?, error?, status? }`
	 */
	purchaseGold: async (purchaseData: GoldPurchaseInput): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/gold`, purchaseData)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets the user's saved payment methods for P2P offers (`GET /user/payment-methods`).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` is the list of payment methods
	 */
	getPaymentMethods: async (): Promise<ApiResult<unknown[]>> => {
		try {
			const response = await apiClient.get(`/user/payment-methods`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.paymentMethodsLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Creates a new payment method (`POST /user/payment-methods`).
	 * `success` is only true on a 200/201 response.
	 *
	 * @param payload - Coin tick plus the coin-specific form fields
	 * @returns `{ success, data?, error?, status? }` — `data` is the created payment method
	 */
	createPaymentMethod: async (payload: PaymentMethodInput): Promise<PaymentMethodCreateResult> => {
		try {
			const response = await apiClient.post(`/user/payment-methods`, payload)
			return { success: response.status === 201 || response.status === 200, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.paymentMethodCreateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Deletes a payment method (`DELETE /user/payment-methods` with `{ id }` in the request body).
	 *
	 * @param id - The payment method identifier
	 * @returns `{ success, data?, error?, status? }`
	 */
	deletePaymentMethod: async (id: string | number): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.delete(`/user/payment-methods`, { data: { id } })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.paymentMethodDeleteFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets the user's saved QvaPay contacts (`GET /user/contact`).
	 * Unwraps `response.data.contacts`; `data` is always an array (empty on odd payloads).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` is the contacts array
	 */
	getContacts: async (): Promise<ApiResult<unknown[]>> => {
		try {
			const response = await apiClient.get(`/user/contact`)
			return { success: true, data: response.data?.contacts ?? [], status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.contactsLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Adds another QvaPay user as a contact (`POST /user/contact`).
	 *
	 * @param contact_uuid - The UUID of the user to add as contact
	 * @param name - The display name for the contact
	 * @returns `{ success, data?, error?, status? }` — `data` is the created contact
	 */
	addContact: async (contact_uuid: string, name: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/contact`, { contact_uuid, name })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.contactAddFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Toggles the favorite flag on a contact (`PATCH /user/contact`).
	 *
	 * @param contact_id - The contact ID
	 * @returns `{ success, data?, error?, status? }` — `data.favorite` is the new boolean state
	 */
	toggleFavoriteContact: async (contact_id: number): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.patch(`/user/contact`, { contact_id })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.contactFavoriteFailed'), status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Deletes a contact (`DELETE /user/contact` with `{ contact_id }` in the request body).
	 *
	 * @param contactId - The contact ID
	 * @returns `{ success, data?, error?, status? }`
	 */
	deleteContact: async (contactId: string | number): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.delete(`/user/contact`, { data: { contact_id: contactId } })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.contactDeleteFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Matches device contacts against QvaPay users (`POST /user/contacts/sync`).
	 * Only sends phone numbers the user consented to share (see ContactsDisclosureModal).
	 *
	 * @param phoneNumbers - Array of normalized phone numbers
	 * @returns `{ success, data?, error? }` — `data.matches` is `[{ phone, user }]`
	 */
	syncContacts: async (phoneNumbers: string[]): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/user/contacts/sync', { phones: phoneNumbers })
			return { success: true, data: response.data }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				return { success: false, error: error.response.data.error || i18n.t('api.user.contactsSyncFailed') }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkErrorShort') }
		}
	},

	/**
	 * Generates a new TOTP secret for 2FA enrollment (`POST /auth/create-2fa`
	 * with an empty body, requires auth). Nothing is persisted yet — the secret
	 * only sticks after `activate2FA` verifies a code against it.
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` holds `secret` and `otpauth_url` (for the QR code)
	 */
	generate2FA: async (): Promise<ApiResult<TwoFactorSecretPayload>> => {
		try {
			const response = await apiClient.post('/auth/create-2fa', {})
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.twoFactorGenerateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Activates 2FA (`POST /auth/create-2fa` with `code` + `secret`).
	 * The backend verifies the TOTP code against the secret from `generate2FA`
	 * and saves it; from then on login requires a 6-digit TOTP instead of the email PIN.
	 *
	 * @param data - The 2FA activation data
	 * @param data.code - The 6-digit TOTP code from the authenticator app
	 * @param data.secret - The secret returned by `generate2FA`
	 * @returns `{ success, data?, error?, status? }`
	 */
	activate2FA: async ({ code, secret }: { code: string, secret: string }): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/auth/create-2fa', { code, secret })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.twoFactorActivateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Deactivates TOTP 2FA for the current user (`POST /auth/reset-2fa`, requires auth).
	 * Login falls back to the emailed 4-digit PIN afterwards.
	 *
	 * @returns `{ success, data?, error?, status? }`
	 */
	deactivate2FA: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/auth/reset-2fa', {})
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.twoFactorDeactivateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},


	/**
	 * Validates an in-app-purchase receipt for the Gold Check subscription
	 * (`POST /user/gold/validate-receipt`). The backend verifies the receipt
	 * with Apple/Google and activates Gold server-side — the source of truth
	 * is the returned `golden_expire`, never the local IAP state.
	 *
	 * @param receiptData - The receipt data
	 * @param receiptData.receipt - The purchase receipt/token
	 * @param receiptData.platform - 'ios' or 'android'
	 * @param receiptData.productId - The product ID
	 * @param receiptData.transactionId - The transaction ID
	 * @returns `{ success, data?, error?, status? }` — `data` includes `golden_expire`
	 */
	validateGoldReceipt: async (receiptData: GoldReceiptInput): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/user/gold/validate-receipt`, receiptData)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.common.purchaseValidateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Uploads the user's avatar or cover photo (`POST /user/avatar`,
	 * multipart/form-data with `file` + `type` fields).
	 *
	 * @param params
	 * @param params.file - The local image file
	 * @param params.uploadType - Which image slot to replace (default 'avatar')
	 * @returns `{ success, data?, error?, status? }` — `data` includes the new `url` and `path`
	 */
	uploadAvatar: async ({ file, uploadType = 'avatar' }: AvatarUploadInput): Promise<ApiResult<unknown>> => {
		try {
			const formData = new FormData()
			formData.append('file', {
				uri: file.uri,
				name: file.name || 'avatar.jpg',
				type: file.type || 'image/jpeg'
			})
			formData.append('type', uploadType)
			const config = { headers: { 'Content-Type': 'multipart/form-data' } }
			const response = await apiClient.post('/user/avatar', formData, config)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.user.imageUploadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets server-side notification preferences (`GET /user/notifications`).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` maps notification channels to booleans
	 */
	getNotificationSettings: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get('/user/notifications')
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Updates server-side notification preferences (`POST /user/notifications`).
	 *
	 * @param settings - The notification settings to update
	 * @returns `{ success, data?, error?, status? }` — `data` is the saved settings
	 */
	updateNotificationSettings: async (settings: Record<string, unknown>): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/user/notifications', settings)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

}
