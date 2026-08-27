/**
 * Tests de la derivación de la pantalla de verificación de identidad
 * (deriveKycView + phaseForRequestError). Fijan el bug que originó el cambio:
 * `kyc_status: 'pending'` NO es "en revisión" — el backend lo escribe al CREAR la
 * sesión y no lo revierte nunca, así que quien abandonó una verificación hace meses
 * seguía viendo una lottie sin un solo botón que pulsar.
 * @jest-environment node
 */
import { deriveKycView, phaseForRequestError } from './kycPhase'

describe('deriveKycView — con el detalle del servidor', () => {

	test('EL BUG: pending con sesión muerta ofrece el botón, no una espera', () => {
		const view = deriveKycView({ kyc: false, kyc_status: 'pending', session_status: 'Expired', on_hold: false, can_retry: true })
		expect(view.phase).toBe('idle')
		expect(view.retryable).toBe(false)
	})

	test('verificado gana a todo lo demás', () => {
		expect(deriveKycView({ kyc: true, kyc_status: 'approved' }).phase).toBe('verified')
		// Aunque el detalle venga contradictorio, el flag autoritativo es `kyc`
		expect(deriveKycView({ kyc: true, kyc_status: 'pending', on_hold: true, can_retry: false }).phase).toBe('verified')
	})

	test('retenido por el equipo: revisión manual', () => {
		const view = deriveKycView({ kyc: false, kyc_status: 'declined', session_status: 'Declined', on_hold: true, can_retry: false })
		expect(view.phase).toBe('manual_review')
		expect(view.retryable).toBe(false)
	})

	test('documentos enviados: en revisión de verdad', () => {
		const view = deriveKycView({ kyc: false, kyc_status: 'pending', session_status: 'In Review', on_hold: false, can_retry: false })
		expect(view.phase).toBe('review')
	})

	test('rechazo ordinario: se reintenta, con copy de reintento', () => {
		const view = deriveKycView({ kyc: false, kyc_status: 'declined', session_status: 'Declined', on_hold: false, can_retry: true })
		expect(view.phase).toBe('idle')
		expect(view.retryable).toBe(true)
	})

	test('on_hold en falso con can_retry ausente sigue dando salida', () => {
		expect(deriveKycView({ kyc: false, kyc_status: 'pending', on_hold: false }).phase).toBe('idle')
	})

	test('session_status viaja como etiqueta, nunca como decisión', () => {
		// 'Declined' es el estado más concluyente del histórico, pero el servidor dice
		// que puede reintentar: manda el servidor.
		const view = deriveKycView({ kyc: false, kyc_status: 'pending', session_status: 'Declined', on_hold: false, can_retry: true })
		expect(view.phase).toBe('idle')
		expect(view.sessionStatus).toBe('Declined')
	})
})

describe('deriveKycView — fallback sin el detalle (backend anterior)', () => {

	test('mantiene el mapeo viejo por kyc_status', () => {
		expect(deriveKycView({ kyc: false, kyc_status: 'pending' }).phase).toBe('review')
		expect(deriveKycView({ kyc: false, kyc_status: 'declined' }).phase).toBe('manual_review')
		expect(deriveKycView({ kyc: false, kyc_status: 'none' }).phase).toBe('idle')
	})

	test('sin datos no se asume una espera', () => {
		expect(deriveKycView(null).phase).toBe('idle')
		expect(deriveKycView(undefined).phase).toBe('idle')
		expect(deriveKycView({}).phase).toBe('idle')
	})
})

describe('phaseForRequestError', () => {

	test('409 es la única espera que codifica el POST', () => {
		expect(phaseForRequestError(409)).toBe('review')
	})

	test('403 solo cierra la puerta cuando trae reason', () => {
		expect(phaseForRequestError(403, 'compliance')).toBe('manual_review')
		expect(phaseForRequestError(403, 'limit')).toBe('manual_review')
		// Sin reason no es un caso cerrado: la pantalla sigue ofreciendo el botón
		expect(phaseForRequestError(403)).toBe('idle')
	})

	test('los códigos transitorios no mueven la pantalla', () => {
		expect(phaseForRequestError(429)).toBeNull()
		expect(phaseForRequestError(502)).toBeNull()
		expect(phaseForRequestError(400)).toBeNull()
		expect(phaseForRequestError(undefined)).toBeNull()
	})
})
