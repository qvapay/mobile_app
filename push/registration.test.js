/**
 * Registro del token: payload (contrato snake_case de qpweb) y política de
 * "¿hace falta volver a mandarlo?".
 * @jest-environment node
 */
import { buildRegistration, needsRegistration, parseRegistrationRecord, registrationFingerprint, REREGISTER_AFTER_MS } from './registration'

const ctx = {
	token: { token: 'abc', provider: 'apns', apnsEnv: 'sandbox' },
	platform: 'ios',
	deviceId: 'dev-1',
	appVersion: '3.6.1',
	osVersion: '26.0',
	model: 'iPhone 16',
	locale: 'es',
	timezone: 'America/Havana',
}

test('buildRegistration produces the qpweb body (snake_case, apns_environment only on iOS)', () => {
	expect(buildRegistration(ctx)).toEqual({
		platform: 'ios', token: 'abc', device_id: 'dev-1', app_version: '3.6.1', os_version: '26.0',
		model: 'iPhone 16', locale: 'es', timezone: 'America/Havana', apns_environment: 'sandbox',
	})
	const android = buildRegistration({ ...ctx, platform: 'android', token: { token: 'fcm-1', provider: 'fcm' }, model: 'SM-A546B' })
	expect(android).toEqual({
		platform: 'android', token: 'fcm-1', device_id: 'dev-1', app_version: '3.6.1', os_version: '26.0',
		model: 'SM-A546B', locale: 'es', timezone: 'America/Havana',
	})
	expect(android).not.toHaveProperty('provider')
})

test('the fingerprint changes with the account, the token and the context', () => {
	const base = registrationFingerprint(buildRegistration(ctx), 'user-1')
	expect(registrationFingerprint(buildRegistration(ctx), 'user-1')).toBe(base)
	expect(registrationFingerprint(buildRegistration(ctx), 'user-2')).not.toBe(base)
	expect(registrationFingerprint(buildRegistration({ ...ctx, token: { ...ctx.token, token: 'xyz' } }), 'user-1')).not.toBe(base)
	expect(registrationFingerprint(buildRegistration({ ...ctx, token: { ...ctx.token, apnsEnv: 'production' } }), 'user-1')).not.toBe(base)
	expect(registrationFingerprint(buildRegistration({ ...ctx, appVersion: '3.7.0' }), 'user-1')).not.toBe(base)
	expect(registrationFingerprint(buildRegistration({ ...ctx, locale: 'en' }), 'user-1')).not.toBe(base)
	expect(registrationFingerprint(buildRegistration({ ...ctx, timezone: 'Europe/Madrid' }), 'user-1')).not.toBe(base)
})

test('needsRegistration: first time, changed fingerprint, or stale record', () => {
	const now = 1_000_000
	expect(needsRegistration(null, 'fp', now)).toBe(true)
	expect(needsRegistration({ fingerprint: 'other', at: now }, 'fp', now)).toBe(true)
	expect(needsRegistration({ fingerprint: 'fp', at: now - 1000 }, 'fp', now)).toBe(false)
	expect(needsRegistration({ fingerprint: 'fp', at: now - REREGISTER_AFTER_MS }, 'fp', now)).toBe(true)
})

test('parseRegistrationRecord tolerates garbage', () => {
	expect(parseRegistrationRecord(null)).toBeNull()
	expect(parseRegistrationRecord('{')).toBeNull()
	expect(parseRegistrationRecord('{"fingerprint":1}')).toBeNull()
	expect(parseRegistrationRecord('{"fingerprint":"fp","at":5}')).toEqual({ fingerprint: 'fp', at: 5 })
})
