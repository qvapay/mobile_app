/**
 * peerLookup: forma de un @usuario / uuid y la coincidencia exacta en el buscador.
 * @jest-environment node
 */
import { isUserUuid, normalizeUsername, pickUuidByUsername } from './peerLookup'

const LUKE = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'
const OTHER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('normalizeUsername', () => {
	test('quita la @ y los espacios de los lados', () => {
		expect(normalizeUsername('@luke')).toBe('luke')
		expect(normalizeUsername('  Luke_99 ')).toBe('Luke_99')
		expect(normalizeUsername('ana.p-2')).toBe('ana.p-2')
	})

	test('descarta lo que no puede ser un username', () => {
		for (const raw of ['', '@', 'a b', '../user', 'luke/1', 'luke?x', 'x'.repeat(65), null, undefined, 42]) {
			expect(normalizeUsername(raw)).toBeNull()
		}
	})
})

test('isUserUuid: solo la forma de users.uuid (CHAR 36)', () => {
	expect(isUserUuid(LUKE)).toBe(true)
	expect(isUserUuid(LUKE.toUpperCase())).toBe(true)
	expect(isUserUuid('../../user/extended-xxxxxxxxxxxxxxxx')).toBe(false)
	expect(isUserUuid('abc')).toBe(false)
	expect(isUserUuid(undefined)).toBe(false)
})

describe('pickUuidByUsername', () => {
	test('se queda con la coincidencia EXACTA, sin distinguir mayúsculas', () => {
		const results = [
			// El buscador devuelve primero contactos por coincidencia parcial
			{ uuid: OTHER, username: 'lukewarm', isContact: true },
			{ uuid: LUKE, username: 'Luke' },
		]
		expect(pickUuidByUsername(results, 'luke')).toBe(LUKE)
	})

	test('sin coincidencia exacta no hay perfil', () => {
		expect(pickUuidByUsername([{ uuid: OTHER, username: 'lukewarm' }], 'luke')).toBeNull()
		expect(pickUuidByUsername([], 'luke')).toBeNull()
		expect(pickUuidByUsername(null, 'luke')).toBeNull()
	})

	test('ignora la fila de «invitar a este correo» y las filas sin uuid válido', () => {
		const results = [
			{ invite: true, uuid: 'invite:luke@x.com', username: 'luke' },
			{ uuid: 'invite:luke', username: 'luke' },
			null,
			{ uuid: LUKE, username: 'luke' },
		]
		expect(pickUuidByUsername(results, 'luke')).toBe(LUKE)
	})
})
