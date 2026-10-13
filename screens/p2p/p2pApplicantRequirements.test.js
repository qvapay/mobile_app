/**
 * @jest-environment node
 */
import { REQUIREMENT_OPTIONS, EMPTY_REQUIREMENTS, requirementsPayload, activeRequirementsCount } from './p2pApplicantRequirements'

describe('requirementsPayload', () => {
	it('sin selección no manda nada', () => {
		expect(requirementsPayload(EMPTY_REQUIREMENTS)).toEqual({})
		expect(requirementsPayload()).toEqual({})
	})

	it('solo las claves activas', () => {
		expect(requirementsPayload({ ...EMPTY_REQUIREMENTS, min_completed: 25, min_rating: 4.5 })).toEqual({ min_completed: 25, min_rating: 4.5 })
	})

	it('descarta valores fuera de la lista cerrada (el backend daría 400)', () => {
		expect(requirementsPayload({ ...EMPTY_REQUIREMENTS, min_completed: 7, min_trustscore: 85 })).toEqual({ min_trustscore: 85 })
	})

	it('espejo de los valores de qpweb', () => {
		expect(REQUIREMENT_OPTIONS).toEqual({
			min_completed: [5, 10, 25, 50, 100],
			min_rating: [4, 4.5],
			min_account_days: [7, 30, 90, 180],
			min_trustscore: [50, 85],
		})
	})
})

describe('activeRequirementsCount', () => {
	it('cuenta los activos', () => {
		expect(activeRequirementsCount(EMPTY_REQUIREMENTS)).toBe(0)
		expect(activeRequirementsCount({ ...EMPTY_REQUIREMENTS, min_account_days: 30, min_rating: 4 })).toBe(2)
	})
})
