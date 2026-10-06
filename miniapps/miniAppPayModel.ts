/**
 * Reglas PURAS del cobro desde una mini-app (sin react-native).
 *
 * La hoja nativa de pago reutiliza `payInvoiceState` (quién puede pagar y con
 * qué saldo) y le añade lo propio de las mini-apps: la factura TIENE que ser
 * del comercio dueño de la mini-app. El backend lo vuelve a comprobar; aquí se
 * corta antes de pedir el PIN para que una mini-app no pueda poner delante del
 * usuario la factura de otro comercio.
 */
import { BRIDGE_ERRORS, type BridgeErrorCode } from './protocol'
import type { Transaction } from '../types/domain'

/**
 * ¿La factura pertenece al comercio (`App.uuid`) de la mini-app?
 * Una factura sin app (emitida a mano desde /invoices) nunca es de una mini-app.
 */
export function invoiceBelongsToApp(transaction: Transaction | null | undefined, appUuid: string): boolean {
	const app = transaction?.app ?? transaction?.App ?? null
	return !!app?.uuid && !!appUuid && app.uuid === appUuid
}

/** Resultado final del pago, tal como lo recibe la mini-app. */
export type PayOutcome =
	| { ok: true, result: { status: 'paid', transaction_uuid: string } }
	| { ok: false, code: BridgeErrorCode, message: string }

/**
 * Traduce el fallo del backend al código estable del SDK. El mensaje en
 * prosa NO viaja a la mini-app (puede ser español del backend o datos de la
 * cuenta): solo el código y una frase genérica.
 *
 * @param status - HTTP status del fallo (undefined = sin respuesta).
 * @param backendCode - `details.code` del backend, si vino.
 */
export function payFailureCode(status: number | undefined, backendCode: unknown): BridgeErrorCode {
	if (backendCode === 'INVOICE_APP_MISMATCH') return BRIDGE_ERRORS.INVOICE_APP_MISMATCH
	if (status == null) return BRIDGE_ERRORS.NETWORK
	return BRIDGE_ERRORS.FAILED
}

/**
 * ¿El fallo es del segundo factor (PIN/OTP mal, bloqueado)? En ese caso la
 * hoja se queda abierta para reintentar en vez de devolver el error.
 */
export function isSecondFactorFailure(backendCode: unknown): boolean {
	return typeof backendCode === 'string' && SECOND_FACTOR_CODES.has(backendCode)
}

/** Códigos de `scripts/security/second-factor.js` de qpweb (los mismos del transfer). */
const SECOND_FACTOR_CODES: ReadonlySet<string> = new Set(['CODE_REQUIRED', 'CODE_INVALID', 'CODE_FORMAT', 'OTP_REQUIRED', 'CODE_LOCKED'])

/** Con OTP_REQUIRED el usuario tiene TOTP: la hoja debe pasar a 6 cajas. */
export function requiresOtp(backendCode: unknown): boolean { return backendCode === 'OTP_REQUIRED' }
