/**
 * Module-level registry of the active NearbyPay session so screens outside
 * the radar (SendConfirm) can emit the payment ack without coupling to the
 * useNearbyPeers hook. Every accessor is a safe no-op when no session is
 * active, so the QR/Keypad send flow is untouched.
 */

/** The API the running nearby session exposes to outside screens. */
export type NearbySessionApi = {
	notifyPaymentSent: (params: { toUuid: string, amount: string, txUuid?: string }) => void
}

let activeSession: NearbySessionApi | null = null

/**
 * Registers the running nearby session API. Called by useNearbyPeers on
 * start; cleared on stop/unmount.
 */
export const setActiveSession = (api: NearbySessionApi): void => { activeSession = api }

/**
 * @returns The active session API, or null outside NearbyPay.
 */
export const getActiveSession = (): NearbySessionApi | null => activeSession

export const clearActiveSession = (): void => { activeSession = null }
