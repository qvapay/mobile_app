import i18n from '../../i18n'
import { US_STATES } from '../../screens/store/assisted/assistedConstants'

/** Saved US shipping address as returned by `shopApi.getShippingAddresses` (only the fields the UI reads). */
export type ShippingAddress = {
	uuid: string
	label?: string | null
	is_default?: boolean | number | null
	recipient_name: string
	line1: string
	line2?: string | null
	city: string
	state: string
	postal_code: string
}

/**
 * One-line summary of a saved US shipping address, for cards and confirm modals.
 *
 * @param a - Address `{ recipient_name, line1, line2?, city, state, postal_code }`.
 * @returns Human-readable summary.
 */
export const formatAddress = (a: Omit<ShippingAddress, 'uuid'> & { uuid?: string }) => `${a.recipient_name} — ${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}, ${a.state} ${a.postal_code}`

/** Controlled form values for a new US shipping address (EMPTY_US_ADDRESS shape). */
export type UsAddressForm = {
	recipient_name: string
	phone: string
	line1: string
	line2: string
	city: string
	state: string
	postal_code: string
}

export const EMPTY_US_ADDRESS: UsAddressForm = { recipient_name: '', phone: '', line1: '', line2: '', city: '', state: '', postal_code: '' }

const ZIP_REGEX = /^\d{5}(-\d{4})?$/

/**
 * Validates a new US shipping-address form. Los mensajes se resuelven con
 * `i18n.t()` en call time (idioma activo al validar, no al importar).
 *
 * @param form - Form values (EMPTY_US_ADDRESS shape).
 * @returns Localized error message, or null when valid.
 */
export function validateUsAddress(form: UsAddressForm): string | null {
	if (form.recipient_name.trim().length < 2) return i18n.t('ui.newAddressForm.errors.recipientName')
	if (form.line1.trim().length < 3) return i18n.t('ui.newAddressForm.errors.line1')
	if (form.city.trim().length < 2) return i18n.t('ui.newAddressForm.errors.city')
	if (!US_STATES.some(s => s.code === form.state)) return i18n.t('ui.newAddressForm.errors.state')
	if (!ZIP_REGEX.test(form.postal_code.trim())) return i18n.t('ui.newAddressForm.errors.postalCode')
	return null
}

/**
 * Backend payload for `shopApi.createShippingAddress` from a validated form.
 *
 * @param form - Validated form values.
 * @returns Address body (US-only for now).
 */
export function buildAddressBody(form: UsAddressForm) {
	return {
		recipient_name: form.recipient_name.trim(),
		phone: form.phone.trim() || null,
		line1: form.line1.trim(),
		line2: form.line2.trim() || null,
		city: form.city.trim(),
		state: form.state,
		postal_code: form.postal_code.trim(),
		country: 'US',
	}
}
