/**
 * Rechazos del puente de mini-apps en TIEMPO DE EJECUCIÓN, con un `message`
 * corto en el idioma del usuario (el mismo de `launchParams.language`): el
 * contrato público del SDK dice que la mini-app puede enseñarlo tal cual.
 *
 * Frases genéricas a propósito: la prosa del backend (puede llevar datos de la
 * cuenta del usuario) nunca viaja a la mini-app. Cuando el motivo concreto
 * importa —saldo insuficiente, factura caducada, PIN bloqueado…—, la propia app
 * ya se lo ha contado al usuario en su hoja o en un toast.
 *
 * Los errores de INTEGRACIÓN (mensaje malformado, `INVALID_PARAMS`,
 * `UNKNOWN_METHOD`) no salen de aquí sino de `miniapps/protocol.ts`, con texto
 * técnico en inglés para la consola del desarrollador.
 *
 * `i18n.t` en call time (patrón de hooks con identidad estable): el bridge no
 * debe recrearse al cambiar de idioma.
 */
import i18n from '../../i18n'
import { BRIDGE_ERRORS, type BridgeError, type BridgeErrorCode } from '../../miniapps/protocol'
import { payFailureCode } from '../../miniapps/miniAppPayModel'

const make = (code: BridgeErrorCode, message: string): BridgeError => ({ code, message })

export const bridgeErrors = {
	userCancelled: () => make(BRIDGE_ERRORS.USER_CANCELLED, i18n.t('miniapps.bridgeErrors.userCancelled')),
	busy: () => make(BRIDGE_ERRORS.BUSY, i18n.t('miniapps.bridgeErrors.busy')),
	network: () => make(BRIDGE_ERRORS.NETWORK, i18n.t('miniapps.bridgeErrors.network')),
	originNotAllowed: () => make(BRIDGE_ERRORS.NOT_ALLOWED, i18n.t('miniapps.bridgeErrors.originNotAllowed')),
	scopeNotAllowed: () => make(BRIDGE_ERRORS.NOT_ALLOWED, i18n.t('miniapps.bridgeErrors.scopeNotAllowed')),
	kycRequired: () => make(BRIDGE_ERRORS.NOT_ALLOWED, i18n.t('miniapps.bridgeErrors.kycRequired')),
	authorizeFailed: () => make(BRIDGE_ERRORS.FAILED, i18n.t('miniapps.bridgeErrors.authorizeFailed')),
	payFailed: () => make(BRIDGE_ERRORS.FAILED, i18n.t('miniapps.bridgeErrors.payFailed')),
	invoiceNotFound: () => make(BRIDGE_ERRORS.FAILED, i18n.t('miniapps.bridgeErrors.invoiceNotFound')),
	invoiceMismatch: () => make(BRIDGE_ERRORS.INVOICE_APP_MISMATCH, i18n.t('miniapps.bridgeErrors.invoiceMismatch')),
	shareFailed: () => make(BRIDGE_ERRORS.FAILED, i18n.t('miniapps.bridgeErrors.shareFailed')),
}

/**
 * Fallo de iniciar sesión contra el backend: sin respuesta = `NETWORK`, con
 * respuesta = `FAILED`.
 *
 * @param status - HTTP status del fallo (undefined = sin respuesta).
 */
export function authorizeFailureError(status: number | undefined): BridgeError {
	return status == null ? bridgeErrors.network() : bridgeErrors.authorizeFailed()
}

/**
 * Fallo de un pago, con el código estable de `payFailureCode`.
 *
 * @param status - HTTP status del fallo (undefined = sin respuesta).
 * @param backendCode - `details.code` del backend, si vino.
 */
export function payFailureError(status: number | undefined, backendCode: unknown): BridgeError {
	const code = payFailureCode(status, backendCode)
	if (code === BRIDGE_ERRORS.INVOICE_APP_MISMATCH) return bridgeErrors.invoiceMismatch()
	if (code === BRIDGE_ERRORS.NETWORK) return bridgeErrors.network()
	return bridgeErrors.payFailed()
}
