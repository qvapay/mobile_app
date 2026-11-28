/**
 * Idempotencia para operaciones de dinero (P2P create, transfer, withdraw).
 * Contrato backend 2026-08-13: clave opcional `idempotency_key` de 8-64 chars
 * `[A-Za-z0-9._-]`, generada al INICIAR el intento, estable en todo reintento
 * y rotada solo tras éxito confirmado (2xx parseado). El servidor la
 * namespacea por usuario y endpoint.
 *
 * Desde el 2026-11-27 la llevan también la tienda, GOLD con saldo y ahorros,
 * y en esas rutas el servidor comprueba además los DATOS: la misma clave con
 * otros datos es un 422 `IDEMPOTENCY_KEY_REUSED`. Ahí la clave se ata a lo que
 * se manda (`runIdempotent`), no al montaje de una pantalla.
 */
import i18n from '../i18n'
import type { ApiResult } from '../types/api'

/**
 * Genera una clave de idempotencia. Desde el polyfill de quick-crypto
 * (`polyfills.ts`) hay `crypto.getRandomValues` real; el fallback a
 * `Math.random` solo queda para jest node, donde no corre el polyfill.
 *
 * @returns Clave que cumple `[A-Za-z0-9._-]{8,64}`.
 */
export function makeIdempotencyKey(): string {
	const rand = (): string => {
		const cryptoGlobal = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto
		if (cryptoGlobal?.getRandomValues) {
			const bytes = cryptoGlobal.getRandomValues(new Uint8Array(8))
			return Array.from(bytes, b => (b % 36).toString(36)).join('')
		}
		return Math.random().toString(36).slice(2, 10)
	}
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

// ─── Clave atada a los datos de la operación ────────────────────────────────

/**
 * Cuánto se recuerda la clave de una operación sin resultado confirmado: lo
 * mismo que el servidor guarda una operación terminada (`IDEMPOTENCY_DONE_TTL`
 * de qpweb). Pasado ese tiempo la misma clave crearía una operación nueva.
 */
export const PAYLOAD_KEY_TTL_MS = 24 * 60 * 60 * 1000

/** Clave de cada operación pendiente de un 2xx, por firma. Solo en memoria. */
const payloadKeys = new Map<string, { key: string, at: number }>()

/** Copia con las claves ordenadas y sin `undefined`, para que el orden de los campos no cambie la firma. */
const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) { return value.map(canonical) }
	if (value && typeof value === 'object') {
		const source = value as Record<string, unknown>
		const out: Record<string, unknown> = {}
		for (const name of Object.keys(source).sort()) {
			if (source[name] !== undefined) { out[name] = canonical(source[name]) }
		}
		return out
	}
	return value
}

/**
 * Firma de una operación: la ruta y TODO lo que se manda. Dos cuerpos con la
 * misma firma son idénticos, así que el servidor les calcula la misma huella
 * (la saca solo del cuerpo) y nunca responde `IDEMPOTENCY_KEY_REUSED`.
 *
 * @param scope - Nombre de la operación (`store:voucher`, `saving:deposit`…).
 * @param payload - Cuerpo de la petición, sin la clave.
 * @returns Texto estable para ese cuerpo.
 */
export function payloadSignature(scope: string, payload: unknown): string {
	return `${scope}|${JSON.stringify(canonical(payload))}`
}

/**
 * La clave de una operación identificada por sus datos: la MISMA mientras no
 * conste un 2xx, se repita desde donde se repita (otro toque, la pantalla
 * vuelta a abrir tras un corte). Cambiar cualquier dato es otra operación y
 * otra clave. Vive en memoria: cerrar la app la pierde.
 *
 * @param scope - Nombre de la operación.
 * @param payload - Cuerpo de la petición, sin la clave.
 * @param now - Reloj inyectable para tests.
 * @returns Clave de idempotencia de esa operación.
 */
export function idempotencyKeyFor(scope: string, payload: unknown, now: number = Date.now()): string {
	for (const [signature, entry] of payloadKeys) {
		if (now - entry.at >= PAYLOAD_KEY_TTL_MS) { payloadKeys.delete(signature) }
	}
	const signature = payloadSignature(scope, payload)
	const known = payloadKeys.get(signature)
	if (known) { return known.key }
	const key = makeIdempotencyKey()
	payloadKeys.set(signature, { key, at: now })
	return key
}

/**
 * Olvida la clave de una operación: la siguiente con los mismos datos es una
 * operación nueva. Solo tras un 2xx, o cuando el servidor dice que la clave
 * es de otra operación.
 *
 * @param scope - Nombre de la operación.
 * @param payload - Cuerpo de la petición, sin la clave.
 */
export function settleIdempotencyKey(scope: string, payload: unknown): void {
	payloadKeys.delete(payloadSignature(scope, payload))
}

/** Vacía las claves recordadas (tests). */
export function resetIdempotencyKeys(): void { payloadKeys.clear() }

const codeOf = (result: ApiResult | null | undefined): unknown => (result && !result.success ? (result.details as { code?: unknown } | null | undefined)?.code : undefined)

/**
 * ¿El servidor dice que la clave ya se usó con otros datos (422)? Es un fallo
 * de la app, no del usuario: se pide una clave nueva y no se enseña su texto.
 *
 * @param result - Resultado de un módulo api.
 * @returns Si es el 422 `IDEMPOTENCY_KEY_REUSED`.
 */
export function isIdempotencyKeyReused(result: ApiResult | null | undefined): boolean {
	return !!result && !result.success && result.status === 422 && codeOf(result) === 'IDEMPOTENCY_KEY_REUSED'
}

/**
 * ¿El 2xx es la respuesta de una operación que YA se había hecho
 * (`duplicate: true`)? Trae la operación original: no se hizo otra ni se cobró
 * de nuevo, y la pantalla lo tiene que decir en vez de celebrar una nueva.
 *
 * @param result - Resultado de un módulo api.
 * @returns Si es la repetición de una operación ya terminada.
 */
export function isDuplicateReplay(result: ApiResult | null | undefined): boolean {
	return !!result && result.success && (result.data as { duplicate?: unknown } | null | undefined)?.duplicate === true
}

/**
 * Ejecuta una operación de dinero con la clave atada a sus datos.
 *
 * - La clave sale de `idempotencyKeyFor`: todo reintento del mismo cuerpo la
 *   reutiliza, y solo un 2xx la suelta.
 * - Ante el 409 «en proceso» o un 429 (el límite de la ruta se comprueba ANTES
 *   que la clave, y un reintento inmediato lo pisa) espera y repite UNA vez con
 *   la misma clave. Ninguno de los dos hizo nada en el servidor.
 * - Un 422 `IDEMPOTENCY_KEY_REUSED` suelta la clave y devuelve un fallo con un
 *   texto neutro: el siguiente intento va con clave nueva.
 *
 * @param scope - Nombre de la operación.
 * @param payload - Cuerpo de la petición, sin la clave.
 * @param call - Llamada al servidor con la clave que recibe.
 * @param opts - `delayMs`: espera antes del único reintento (la ventana del límite de la ruta).
 * @returns El resultado del intento final.
 */
export async function runIdempotent<T extends ApiResult>(scope: string, payload: unknown, call: (key: string) => Promise<T>, { delayMs = 5200 }: { delayMs?: number } = {}): Promise<T> {
	const key = idempotencyKeyFor(scope, payload)
	let result = await call(key)
	if (isDuplicateInFlight(result) || (!result.success && result.status === 429)) {
		await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
		result = await call(key)
	}
	if (result.success) {
		settleIdempotencyKey(scope, payload)
	} else if (isIdempotencyKeyReused(result)) {
		settleIdempotencyKey(scope, payload)
		return { ...result, error: i18n.t('hooks.idempotency.tryAgain') }
	}
	return result
}

/**
 * Aviso para la repetición de una operación ya hecha (`isDuplicateReplay`).
 *
 * @returns Mensaje localizado.
 */
export function duplicateNotice(): string { return i18n.t('hooks.idempotency.alreadyProcessed') }
