/**
 * Rechazos del puente con mensaje en el idioma del usuario.
 * @jest-environment node
 */
import i18n from '../../i18n'
import { bridgeErrors, authorizeFailureError, payFailureError } from './bridgeErrors'

describe('bridgeErrors', () => {

	afterEach(async () => { await i18n.changeLanguage('es') })

	test('cada rechazo lleva su código estable y una frase no vacía (sin claves crudas)', () => {
		for (const [name, build] of Object.entries(bridgeErrors)) {
			const error = build()
			expect(typeof error.code).toBe('string')
			expect(error.message.length).toBeGreaterThan(0)
			expect(error.message).not.toContain('miniapps.bridgeErrors')
			expect(name.length).toBeGreaterThan(0)
		}
	})

	test('el idioma se resuelve en el momento de rechazar', async () => {
		expect(bridgeErrors.payFailed().message).toBe('No se pudo completar el pago.')
		await i18n.changeLanguage('en')
		expect(bridgeErrors.payFailed().message).toBe("The payment couldn't be completed.")
		await i18n.changeLanguage('pt-BR')
		expect(bridgeErrors.payFailed().message).toBe('Não foi possível concluir o pagamento.')
	})

	test('authorizeFailureError: sin respuesta = NETWORK, con respuesta = FAILED', () => {
		expect(authorizeFailureError(undefined).code).toBe('NETWORK')
		expect(authorizeFailureError(500)).toEqual({ code: 'FAILED', message: 'No se pudo iniciar sesión con QvaPay.' })
	})

	test('payFailureError: nunca reenvía el motivo del backend', () => {
		expect(payFailureError(403, 'INVOICE_APP_MISMATCH')).toEqual({ code: 'INVOICE_APP_MISMATCH', message: 'Esta factura no pertenece a esta mini-app.' })
		expect(payFailureError(undefined, undefined).code).toBe('NETWORK')
		expect(payFailureError(400, 'INSUFFICIENT_BALANCE')).toEqual({ code: 'FAILED', message: 'No se pudo completar el pago.' })
	})
})
