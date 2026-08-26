/**
 * Idempotencia para operaciones de dinero (P2P create, transfer, withdraw).
 * Contrato backend 2026-08-13: clave opcional `idempotency_key` de 8-64 chars
 * `[A-Za-z0-9._-]`, generada al INICIAR el intento, estable en todo reintento
 * y rotada solo tras éxito confirmado (2xx parseado). El servidor la
 * namespacea por usuario y endpoint.
 */
import i18n from '../i18n'
import type { ApiResult } from '../types/api'

/**
 * Genera una clave de idempotencia. No asumimos `crypto.randomUUID` en
 * Hermes: timestamp + dos segmentos aleatorios cumplen el shape del backend
 * y la clave va namespaceada por usuario/endpoint en el servidor.
 *
 * @returns Clave que cumple `[A-Za-z0-9._-]{8,64}`.
 */
export function makeIdempotencyKey(): string {
	const rand = () => Math.random().toString(36).slice(2, 12)
	return `${Date.now()}-${rand()}-${rand()}`
}

/**
 * ¿La respuesta es el 409 DUPLICATE_REQUEST del contrato? (la operación
 * original sigue en vuelo). Los módulos api devuelven `{ status, details }`;
 * si `details` no viene, el status solo alcanza — un 409 ajeno solo cuesta
 * un reintento inofensivo con la misma clave.
 *
 * @param result - Resultado `{ success, status?, details? }` de un módulo api.
 * @returns Si conviene esperar y reintentar con la misma clave.
 */
export function isDuplicateInFlight(result: ApiResult | null | undefined): boolean {
	if (!result || result.success || result.status !== 409) { return false }
	const code = (result.details as { code?: string } | null | undefined)?.code
	return code == null || code === 'DUPLICATE_REQUEST'
}

/**
 * Ejecuta una operación de dinero y, si recibe el 409 "en proceso",
 * espera y reintenta UNA vez con la misma clave (el `fn` ya la lleva
 * capturada). Para entonces la original terminó (llega `duplicate: true`
 * con sus datos) o la clave se liberó y el reintento procede normal.
 * El delay respeta el rate limit de 1 req/5s que corre antes del check.
 *
 * @param fn - Llamada al módulo api con la clave ya incluida.
 * @param opts - `delayMs`: espera antes del único reintento (default 5200).
 * @returns El resultado del intento final.
 */
export async function callWithDuplicateRetry<T extends ApiResult>(fn: () => Promise<T>, { delayMs = 5200 }: { delayMs?: number } = {}): Promise<T> {
	const first = await fn()
	if (!isDuplicateInFlight(first)) { return first }
	await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
	return fn()
}

/**
 * ¿El resultado fue un fallo de red (sin respuesta del servidor)? Con clave
 * de idempotencia estable, este es el caso donde el copy puede prometer con
 * honestidad que reintentar no duplica la operación.
 *
 * @param result - Resultado `{ success, status? }` de un módulo api.
 * @returns true si no hubo respuesta HTTP.
 */
export function isNetworkFailure(result: ApiResult | null | undefined): boolean { return !!result && !result.success && result.status == null }

/**
 * Copy sugerido para fallos de red en operaciones con clave estable.
 * Función (no const de módulo) para que el texto se resuelva en el idioma
 * activo en call time y no quede congelado en el del arranque.
 *
 * @returns Mensaje localizado.
 */
export function safeRetryHint(): string { return i18n.t('hooks.idempotency.safeRetryHint') }
