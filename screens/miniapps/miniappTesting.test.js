/**
 * Mini-apps en prueba: quién la ve, y que en prueba no se cobra ni se comparte.
 * @jest-environment node
 */
import { previewRoleOf, canShareMiniApp, canPayInMiniApp, canPinMiniApp, canLeaveTesting, withoutInvite, withoutMiniApp, inviteAnswerFailure, inviterLabel } from './miniappTesting'

describe('previewRoleOf', () => {

	test('publicada = sin rol, aunque llegue un preview_role suelto', () => {
		expect(previewRoleOf({ preview: false })).toBeNull()
		expect(previewRoleOf({ preview: false, preview_role: 'tester' })).toBeNull()
		expect(previewRoleOf({})).toBeNull()
		expect(previewRoleOf(null)).toBeNull()
	})

	test('un qpweb sin testers no manda preview_role: la vista previa es del dueño', () => {
		expect(previewRoleOf({ preview: true })).toBe('owner')
		expect(previewRoleOf({ preview: true, preview_role: null })).toBe('owner')
	})

	test('dueño y tester', () => {
		expect(previewRoleOf({ preview: true, preview_role: 'owner' })).toBe('owner')
		expect(previewRoleOf({ preview: true, preview_role: 'tester' })).toBe('tester')
	})

	test('un rol desconocido no da permisos de tester', () => {
		expect(previewRoleOf({ preview: true, preview_role: 'admin' })).toBe('owner')
	})
})

describe('lo que se puede hacer en prueba', () => {

	test('en prueba ni se comparte ni se cobra', () => {
		for (const app of [{ preview: true }, { preview: true, preview_role: 'tester' }]) {
			expect(canShareMiniApp(app)).toBe(false)
			expect(canPayInMiniApp(app)).toBe(false)
		}
	})

	test('publicada sí', () => {
		expect(canShareMiniApp({ preview: false })).toBe(true)
		expect(canPayInMiniApp({})).toBe(true)
	})

	test('sin ficha cargada, nada', () => {
		expect(canShareMiniApp(undefined)).toBe(false)
		expect(canPayInMiniApp(null)).toBe(false)
	})

	test('el acceso directo a inicio: el dueño y las publicadas sí, un tester no', () => {
		expect(canPinMiniApp({ preview: false })).toBe(true)
		expect(canPinMiniApp({ preview: true })).toBe(true)
		expect(canPinMiniApp({ preview: true, preview_role: 'owner' })).toBe(true)
		expect(canPinMiniApp({ preview: true, preview_role: 'tester' })).toBe(false)
		expect(canPinMiniApp(null)).toBe(false)
	})

	test('solo un tester puede dejar de probarla', () => {
		expect(canLeaveTesting({ preview: true, preview_role: 'tester' })).toBe(true)
		expect(canLeaveTesting({ preview: true, preview_role: 'owner' })).toBe(false)
		expect(canLeaveTesting({ preview: true })).toBe(false)
		expect(canLeaveTesting({ preview: false, preview_role: 'tester' })).toBe(false)
	})
})

describe('cachés', () => {

	test('withoutInvite quita solo esa invitación', () => {
		expect(withoutInvite([{ slug: 'a' }, { slug: 'b' }], 'a')).toEqual([{ slug: 'b' }])
		expect(withoutInvite(undefined, 'a')).toBeUndefined()
	})

	test('withoutMiniApp quita solo esa mini-app', () => {
		expect(withoutMiniApp([{ slug: 'a' }, { slug: 'b' }], 'b')).toEqual([{ slug: 'a' }])
		expect(withoutMiniApp(undefined, 'a')).toBeUndefined()
	})
})

describe('inviteAnswerFailure', () => {

	test('404 = la invitación ya no existe', () => {
		expect(inviteAnswerFailure(404)).toBe('gone')
	})

	test('red, 5xx o límite: se puede reintentar', () => {
		expect(inviteAnswerFailure(undefined)).toBe('retry')
		expect(inviteAnswerFailure(500)).toBe('retry')
		expect(inviteAnswerFailure(429)).toBe('retry')
	})
})

describe('inviterLabel', () => {

	test('@usuario, sin duplicar la arroba', () => {
		expect(inviterLabel({ invited_by: { username: 'pepe', name: 'Pepe', image: null } })).toBe('@pepe')
		expect(inviterLabel({ invited_by: { username: '@pepe', name: null, image: null } })).toBe('@pepe')
	})

	test('sin quien invita, nada', () => {
		expect(inviterLabel({ invited_by: null })).toBeNull()
		expect(inviterLabel({ invited_by: { username: '  ', name: null, image: null } })).toBeNull()
	})
})
