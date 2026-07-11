/**
 * Module-level registry of the active NearbyPay session so screens outside
 * the radar (SendConfirm) can emit the payment ack without coupling to the
 * useNearbyPeers hook. Every accessor is a safe no-op when no session is
 * active, so the QR/Keypad send flow is untouched.
 */

let activeSession = null

/**
 * Registers the running nearby session API. Called by useNearbyPeers on
 * start; cleared on stop/unmount.
 * @param {{ notifyPaymentSent: (params: { toUuid: string, amount: string, txUuid?: string }) => void }} api
 */
export const setActiveSession = (api) => { activeSession = api }

/**
 * @returns {object|null} The active session API, or null outside NearbyPay.
 */
export const getActiveSession = () => activeSession

export const clearActiveSession = () => { activeSession = null }
