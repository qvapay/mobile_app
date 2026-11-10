/**
 * Reglas PURAS del pago de compras con PIX: si se ofrece, a cuánto, cómo se lee un error y cuándo
 * seguir consultando el cobro. Espejo de qpweb `scripts/store/pix-checkout.js` (`pixQuote`) y
 * `scripts/store/pix-rules.js`; cambiar una de esas reglas exige tocar los dos repos.
 *
 * Quien decide es el servidor: el precio de aquí solo se enseña antes de pagar, el que vale es
 * `total_brl` del cobro.
 */

import type { PixCharge, PixEligibility, PixRate, PixStage, PixSurface } from '../../../types/domain'

export const PIX_MIN_BRL = 0.5
export const PIX_MAX_USD = 3000

/** Lo que pesa el seguimiento: cada 4 s con el QR abierto, y un rato más tras pagar. */
export const PIX_POLL_MS = 4000
/** La entrega suele salir en segundos; pasado este rato basta con `pix_holds` de `GET /store/my`. */
export const PIX_VERIFYING_WATCH_MS = 30_000
/** Tras caducar, un pago aún puede entrar por el webhook (`PIX_PENDING_GRACE_MS` de qpweb). */
export const PIX_EXPIRED_GRACE_MS = 10 * 60 * 1000

export type PixQuote = { totalUsd: number, totalBrl: number }

/** Qué pinta una compra: nada, la llamada a hacerse GOLD o a verificar el CPF, o la opción de pago con su precio. */
export type PixOffer = { kind: 'hidden' } | { kind: 'gold' } | { kind: 'cpf' } | { kind: 'ready', quote: PixQuote }

const HIDDEN: PixOffer = { kind: 'hidden' }

/**
 * Precio de una compra en reales.
 *
 * @param base - Lo que costaría con saldo, en USD.
 * @param rate - Tasa y recargo de `GET /pix/eligibility`.
 * @returns El total, o null sin tasa válida o fuera de los límites por pago.
 */
export function pixQuote(base: number, rate: PixRate | null | undefined): PixQuote | null {
	const amount = Number(base) || 0
	const usdPerBrl = Number(rate?.usd_per_brl) || 0
	const pct = Number(rate?.surcharge_pct) || 0
	const provider = Number(rate?.provider_pct) || 0
	if (!(amount > 0) || !(usdPerBrl > 0) || !(provider < 100)) { return null }
	// El procesador retiene su parte del TOTAL: por eso se divide y no se suma
	const totalUsd = Math.round((amount * (1 + pct / 100)) / (1 - provider / 100) * 100) / 100
	if (totalUsd > PIX_MAX_USD) { return null }
	// Hacia arriba al centavo de real: nunca cobrar de menos por redondeo
	const totalBrl = Math.ceil((totalUsd / usdPerBrl) * 100) / 100
	if (totalBrl < PIX_MIN_BRL) { return null }
	return { totalUsd, totalBrl }
}

/**
 * Traduce la eligibilidad a lo que pinta una compra. `CPF_REQUIRED` lleva a la pantalla del CPF, o
 * a la de GOLD si `gold_required`: verificarlo exige GOLD vigente. Cualquier otro motivo oculta la
 * opción sin explicarla, y una compra fuera de `surfaces` también.
 *
 * @param eligibility - Respuesta de `GET /pix/eligibility`, o nada si aún no hay (o falló).
 * @param surface - La compra.
 * @param base - Lo que costaría con saldo, en USD.
 */
export function resolvePixOffer(eligibility: PixEligibility | null | undefined, surface: PixSurface, base: number): PixOffer {
	if (!eligibility?.surfaces?.includes(surface)) { return HIDDEN }
	if (eligibility.reason === 'CPF_REQUIRED') { return { kind: eligibility.gold_required ? 'gold' : 'cpf' } }
	if (!eligibility.eligible) { return HIDDEN }
	const quote = pixQuote(base, eligibility.quote)
	return quote ? { kind: 'ready', quote } : HIDDEN
}

/** Fallo de `POST /pix/checkout`, ya clasificado para quien paga. */
export type PixCheckoutFailure =
	/** Ya hay un QR abierto: se abre en vez de avisar. */
	| { kind: 'open', charge: PixCharge }
	/** Supera el tope de 30 días. */
	| { kind: 'cap', remaining: number | null, resetsAt: string | null }
	/** Falta el CPF aunque la eligibilidad dijera otra cosa. */
	| { kind: 'cpf' }
	/** Recarga a Cuba: el servidor exige el nombre del destinatario. */
	| { kind: 'recipient' }
	/** Esta compra no se paga con PIX: la opción se retira. */
	| { kind: 'vetoed', code: string | null }
	/** Se puede reintentar; `code` da el mensaje. */
	| { kind: 'retry', code: string | null }

const VETO_CODES: ReadonlySet<string> = new Set([
	'PIX_NOT_ELIGIBLE', 'PIX_SURFACE_OFF', 'PIX_P2P_PACKAGE', 'PIX_BRAND_BLOCKED', 'PIX_SELLER_LINKED',
	'GIFTCARD_CARD_BLOCKED', 'SUPPLIER_CARD_BLOCKED',
])

/**
 * Clasifica el error de `POST /pix/checkout` por `code` del body y, sin código, por HTTP.
 *
 * @param status - HTTP de la respuesta (undefined = red o 500).
 * @param details - Body crudo del error.
 */
export function classifyPixCheckoutError(status: number | undefined, details: unknown): PixCheckoutFailure {
	const body = (details ?? {}) as { code?: unknown, charge?: unknown, remaining?: unknown, resets_at?: unknown }
	const code = typeof body.code === 'string' ? body.code : null

	if (code === 'PIX_QR_OPEN' && body.charge) { return { kind: 'open', charge: body.charge as PixCharge } }
	if (code === 'PIX_CAP_EXCEEDED') {
		return {
			kind: 'cap',
			remaining: typeof body.remaining === 'number' ? body.remaining : null,
			resetsAt: typeof body.resets_at === 'string' ? body.resets_at : null,
		}
	}
	if (code === 'CPF_REQUIRED') { return { kind: 'cpf' } }
	if (code === 'RECIPIENT_NAME_REQUIRED') { return { kind: 'recipient' } }
	if (code && VETO_CODES.has(code)) { return { kind: 'vetoed', code } }
	// El límite de POST /pix/checkout responde sin código
	if (status === 429) { return { kind: 'retry', code: 'RATE_LIMITED' } }
	if (status === 503) { return { kind: 'retry', code: 'PIX_UNAVAILABLE' } }
	return { kind: 'retry', code }
}

/** Con esta etapa ya se cobró: la compra está en marcha o se devolvió. */
export const isPixPaid = (stage: PixStage): boolean => stage === 'verifying' || stage === 'delivered' || stage === 'refunded'

/**
 * Cada cuánto consultar el cobro, o `false` para dejar de hacerlo: mientras el QR esté abierto (con
 * la gracia tras caducar, porque el pago aún puede entrar) y un rato en `verifying`.
 *
 * @param args.stage - Etapa actual.
 * @param args.expiresAt - `expires_at` del cobro; sin él (cobro recién reservado) se sigue consultando.
 * @param args.verifyingSince - Cuándo se vio `verifying` por primera vez, o null.
 * @param args.now - Reloj.
 */
export function pixPollDelay({ stage, expiresAt, verifyingSince, now }: {
	stage: PixStage | undefined
	expiresAt: string | null | undefined
	verifyingSince: number | null
	now: number
}): number | false {
	if (stage === 'awaiting_payment') {
		const expires = expiresAt ? new Date(expiresAt).getTime() : NaN
		return Number.isFinite(expires) && now > expires + PIX_EXPIRED_GRACE_MS ? false : PIX_POLL_MS
	}
	if (stage === 'verifying') {
		return verifyingSince === null || now - verifyingSince <= PIX_VERIFYING_WATCH_MS ? PIX_POLL_MS : false
	}
	return false
}

/**
 * Segundos que le quedan al QR.
 *
 * @returns Los segundos (0 = caducado), o null si el cobro aún no tiene `expires_at`.
 */
export function pixSecondsLeft(expiresAt: string | null | undefined, now: number): number | null {
	if (!expiresAt) { return null }
	const expires = new Date(expiresAt).getTime()
	if (!Number.isFinite(expires)) { return null }
	return Math.max(0, Math.floor((expires - now) / 1000))
}

/** `mm:ss` de la cuenta atrás. */
export function formatPixClock(seconds: number): string {
	const minutes = Math.floor(seconds / 60)
	return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Importe en reales al estilo brasileño, sea cual sea el idioma de la app: lo que el usuario
 * compara con lo que le enseña su banco. Sin `Intl` para que no dependa del runtime.
 *
 * @param value - Importe en BRL.
 * @returns `R$ 1.234,56`.
 */
export function formatBrl(value: number | string | null | undefined): string {
	const [whole, cents] = (Number(value) || 0).toFixed(2).split('.')
	return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`
}
