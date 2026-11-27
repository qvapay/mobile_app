/**
 * @jest-environment node
 */
import { activeCipRequirement, cipEnforceDay, cipMissingKind, cipNoticeCopy, isCipRequiredError } from './cipRequirement'

const t = (key, params) => (params ? `${key}(${JSON.stringify(params)})` : key)

describe('cipRequirement', () => {
	it('reconoce el rechazo por su código, nunca por el status', () => {
		expect(isCipRequiredError({ code: 'CIP_REQUIRED', missing: ['address'] })).toBe(true)
		expect(isCipRequiredError({ code: 'SECURITY_HOLD' })).toBe(false)
		expect(isCipRequiredError(undefined)).toBe(false)
		expect(isCipRequiredError(null)).toBe(false)
	})

	it('sin el campo, o con la regla apagada, no hay nada que enseñar', () => {
		expect(activeCipRequirement(undefined)).toBeNull()
		expect(activeCipRequirement({})).toBeNull()
		expect(activeCipRequirement({ withdraw_requirement: null })).toBeNull()
		expect(activeCipRequirement({ withdraw_requirement: { required: false, blocking: false, missing: [] } })).toBeNull()
		const requirement = { required: true, blocking: true, missing: ['address'] }
		expect(activeCipRequirement({ withdraw_requirement: requirement })).toBe(requirement)
	})

	it('reduce `missing` a dirección, SSN o las dos', () => {
		expect(cipMissingKind(['address'])).toBe('address')
		expect(cipMissingKind(['ssn'])).toBe('ssn')
		expect(cipMissingKind(['address', 'ssn'])).toBe('both')
		expect(cipMissingKind([])).toBe('address')
		expect(cipMissingKind(undefined)).toBe('address')
		expect(cipMissingKind(['otro'])).toBe('address')
	})

	it('enseña el día del servidor (UTC), no el anterior del huso local', () => {
		expect(cipEnforceDay('2026-11-18T00:00:00.000Z', 'en-US')).toBe('November 18')
		expect(cipEnforceDay(null, 'en-US')).toBeNull()
		expect(cipEnforceDay('nada', 'en-US')).toBeNull()
	})

	it('bloqueado: el título nombra la acción y el cuerpo lo que falta', () => {
		const copy = cipNoticeCopy({ action: 'p2p_sell', blocking: true, missing: ['address'], enforceFrom: '2026-11-18T00:00:00.000Z' }, t, 'en-US')
		expect(copy.title).toBe('ui.cipNotice.blocked.p2p_sell')
		expect(copy.body).toBe('ui.cipNotice.missing.address ui.cipNotice.where')
	})

	it('en los días de aviso dice desde cuándo', () => {
		const copy = cipNoticeCopy({ action: 'withdraw', blocking: false, missing: ['address', 'ssn'], enforceFrom: '2026-11-18T00:00:00.000Z' }, t, 'en-US')
		expect(copy.title).toBe('ui.cipNotice.title')
		expect(copy.body).toBe('ui.cipNotice.soon.withdraw({"date":"November 18"}) ui.cipNotice.missing.both ui.cipNotice.where')
	})

	it('un aviso sin fecha no inventa una', () => {
		const copy = cipNoticeCopy({ action: 'swap_out', blocking: false, missing: [] }, t, 'en-US')
		expect(copy.body).toBe('ui.cipNotice.missing.address ui.cipNotice.where')
	})
})
