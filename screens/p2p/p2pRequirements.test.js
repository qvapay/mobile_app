/**
 * Requisitos de acceso al P2P: qué falta según el perfil local y cómo se
 * traduce el 400 del backend a un requisito concreto.
 * @jest-environment node
 */
import { missingP2PRequirements, requirementFromApiError } from './p2pRequirements'

const VERIFIED = { p2p_enabled: 1, kyc: 1, phone_verified: 1, telegram_id: '123' }

describe('missingP2PRequirements', () => {

	test('un usuario completo no tiene requisitos pendientes', () => {
		expect(missingP2PRequirements(VERIFIED)).toEqual([])
	})

	test('señala el KYC cuando falta', () => {
		expect(missingP2PRequirements({ ...VERIFIED, kyc: 0 })).toEqual(['kyc'])
	})

	test('acumula todos los que falten', () => {
		expect(missingP2PRequirements({ p2p_enabled: 1 })).toEqual(['kyc', 'phone', 'telegram'])
	})

	test('sin usuario, todo pendiente', () => {
		expect(missingP2PRequirements(null)).toEqual(['p2p_enabled', 'kyc', 'phone', 'telegram'])
	})
})

describe('requirementFromApiError', () => {

	// Las frases exactas de /p2p/index y /p2p/create en qpweb
	test.each([
		['Debes completar el KYC para acceder al P2P', 'kyc'],
		['No tienes KYC para crear una oferta P2P', 'kyc'],
		['Debes vincular tu cuenta de Telegram para acceder al P2P', 'telegram'],
		['Debes verificar tu número de teléfono para acceder al P2P', 'phone'],
		['No tienes habilitado el acceso a P2P', 'p2p_enabled'],
		['P2P is not enabled for this user', 'p2p_enabled'],
	])('%s → %s', (message, expected) => {
		expect(requirementFromApiError(message, 400)).toBe(expected)
	})

	test('un 400 de validación de filtros NO es un requisito', () => {
		expect(requirementFromApiError("Parámetro 'page' inválido: debe ser un entero mayor o igual a 1", 400)).toBeNull()
	})

	test('solo mira los 400 (un 429 o un 500 son fallos de carga)', () => {
		expect(requirementFromApiError('Debes completar el KYC para acceder al P2P', 429)).toBeNull()
		expect(requirementFromApiError('Debes completar el KYC para acceder al P2P', undefined)).toBeNull()
	})

	test('sin mensaje no inventa requisito', () => {
		expect(requirementFromApiError(null, 400)).toBeNull()
	})
})
