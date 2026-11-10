/**
 * Reglas de la pausa de una oferta P2P: espejo de `pause-rules.js` de qpweb.
 * @jest-environment node
 */
import { activePause, pauseResumesAt } from './p2pPause'

const NOW = Date.parse('2026-11-09T20:00:00.000Z')
const OWNER = { reason: 'owner', until: null }
const AUTO = { reason: 'taker_left', until: '2026-11-09T20:10:00.000Z' }

describe('activePause', () => {

	test('sin pausa, null', () => {
		expect(activePause({ status: 'open', pause: null }, NOW)).toBeNull()
		expect(activePause({ status: 'open' }, NOW)).toBeNull()
		expect(activePause(null, NOW)).toBeNull()
	})

	test('la del dueño no vence', () => {
		expect(activePause({ status: 'open', pause: OWNER }, NOW)).toBe(OWNER)
	})

	test('la automática vale hasta `until`: una copia vieja de la caché ya no cuenta', () => {
		expect(activePause({ status: 'open', pause: AUTO }, NOW)).toBe(AUTO)
		expect(activePause({ status: 'open', pause: AUTO }, Date.parse(AUTO.until))).toBeNull()
		expect(activePause({ status: 'open', pause: AUTO }, Date.parse(AUTO.until) + 1)).toBeNull()
	})

	test('solo una oferta abierta está en pausa (una orden proyectada conserva el campo de la madre)', () => {
		for (const status of ['processing', 'paid', 'revision', 'completed', 'cancelled']) {
			expect(activePause({ status, pause: OWNER }, NOW)).toBeNull()
		}
	})
})

describe('pauseResumesAt', () => {

	test('la automática dice cuándo vuelve', () => {
		expect(pauseResumesAt(AUTO)).toBe(AUTO.until)
	})

	test('la del dueño no vuelve sola', () => {
		expect(pauseResumesAt(OWNER)).toBeNull()
		expect(pauseResumesAt(null)).toBeNull()
	})
})
