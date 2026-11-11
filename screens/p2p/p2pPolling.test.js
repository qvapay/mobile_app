/**
 * Ritmo del poll de la ficha P2P y qué respuestas son un «no» (módulo puro).
 * @jest-environment node
 */
import { offerPollDelay, readPollAfterMs, isRefusalStatus, POLL_LIVE_MS, POLL_IDLE_MS, POLL_MIN_MS, POLL_MAX_MS } from './p2pPolling'

describe('offerPollDelay', () => {
	test('party of a live trade: 5s; anyone else on an active offer: 15s', () => {
		expect(offerPollDelay({ active: true, liveParty: true })).toBe(POLL_LIVE_MS)
		expect(offerPollDelay({ active: true, liveParty: false })).toBe(POLL_IDLE_MS)
	})

	test('an inactive offer does not poll', () => {
		expect(offerPollDelay({ active: false, liveParty: true })).toBeNull()
	})

	test('poll_after_ms wins, clamped to 3–60s; 0 or less stops the poll', () => {
		expect(offerPollDelay({ active: true, liveParty: true, serverMs: 20000 })).toBe(20000)
		expect(offerPollDelay({ active: false, liveParty: false, serverMs: 8000 })).toBe(8000)
		expect(offerPollDelay({ active: true, liveParty: true, serverMs: 1 })).toBe(POLL_MIN_MS)
		expect(offerPollDelay({ active: true, liveParty: true, serverMs: 10 * 60000 })).toBe(POLL_MAX_MS)
		expect(offerPollDelay({ active: true, liveParty: true, serverMs: 0 })).toBeNull()
		expect(offerPollDelay({ active: true, liveParty: true, serverMs: -5 })).toBeNull()
	})
})

describe('readPollAfterMs', () => {
	test('reads it next to `p2p` in the envelope, or inside a bare offer', () => {
		expect(readPollAfterMs({ message: 'P2P', p2p: {}, poll_after_ms: 5000 })).toBe(5000)
		expect(readPollAfterMs({ p2p: { poll_after_ms: 15000 } })).toBe(15000)
		expect(readPollAfterMs({ uuid: 'x', poll_after_ms: 0 })).toBe(0)
	})

	test('anything but a finite number counts as missing', () => {
		expect(readPollAfterMs({ p2p: {} })).toBeNull()
		expect(readPollAfterMs({ poll_after_ms: '5000' })).toBeNull()
		expect(readPollAfterMs({ poll_after_ms: NaN })).toBeNull()
		expect(readPollAfterMs({ poll_after_ms: null })).toBeNull()
		expect(readPollAfterMs(null)).toBeNull()
		expect(readPollAfterMs([])).toBeNull()
	})
})

describe('isRefusalStatus', () => {
	test.each([400, 401, 403, 404, 410])('%s is a "no"', (status) => {
		expect(isRefusalStatus(status)).toBe(true)
	})

	test.each([undefined, null, 0, 200, 408, 429, 500, 502, 503])('%s is not', (status) => {
		expect(isRefusalStatus(status)).toBe(false)
	})
})
