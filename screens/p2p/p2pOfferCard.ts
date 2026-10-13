/**
 * Reglas PURAS de la tarjeta de oferta del mercado P2P (`ui/P2POfferItem`).
 * Paridad con la fila de la web (`components/particles/p2p.js` de qpweb y
 * `docs/mobile-p2p-card-design-plan.md`): formato de la tasa, desviación frente
 * al promedio del mercado, acción del botón, quién paga y requisitos del maker.
 * Sin react-native: se testea con `@jest-environment node`.
 */

import type { P2POffer, P2PRequirements, P2PStatus, P2POrderStatus } from '../../types/domain'

/** Margen neutro de la desviación: entre −2 % y +2 % la tasa está "en el promedio". */
export const TREND_THRESHOLD = 2

const fixed2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

/**
 * Tasa siempre con dos decimales y separador de miles (`1.13`, `1,030.00`),
 * en en-US como la web: la tasa es un número que se compara, no prosa.
 */
export const formatRate = (n: number | null | undefined): string =>
	n != null && Number.isFinite(n) ? n.toLocaleString('en-US', fixed2) : '—'

/** Dólares: dos decimales fijos (`480.00`). */
export const formatUsd = (v: unknown): string => (Number(v) || 0).toLocaleString('en-US', fixed2)

/** Monto en la moneda de pago: hasta dos decimales (`1,030`). */
export const formatCoinAmount = (v: unknown): string => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export type RateTrend = 'good' | 'bad' | 'neutral'

/**
 * Desviación de la tasa frente al promedio de su moneda (`average` de
 * `/p2p/averages`) y si le conviene a quien TOMA la oferta: en una `sell` el
 * taker compra (tasa baja = mejor), en una `buy` vende (tasa alta = mejor).
 * null sin promedio (o promedio 0) o sin tasa: la card no enseña nada.
 */
export const rateDeviation = (rate: number | null, average: unknown, type: P2POffer['type']): { pct: number, trend: RateTrend } | null => {
	const avg = Number(average) || 0
	if (!(avg > 0) || rate == null || !Number.isFinite(rate)) return null
	const pct = ((rate - avg) / avg) * 100
	const edge = type === 'sell' ? -pct : pct
	const trend: RateTrend = edge > TREND_THRESHOLD ? 'good' : edge < -TREND_THRESHOLD ? 'bad' : 'neutral'
	return { pct, trend }
}

/** `+2.4%` / `-1.2%`: un decimal, signo explícito si es positivo. */
export const formatDeviation = (pct: number): string => `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`

export type CardAction = 'buy' | 'sell' | 'manage' | Exclude<P2PStatus, 'open'>

/**
 * Qué dice el botón. Manda el estado de MI orden si la hay (la oferta sigue
 * `open` mientras otros toman). Abierta: el dueño gestiona; el resto opera con
 * el tipo de la oferta (`sell` → Comprar, `buy` → Vender).
 */
export const cardAction = ({ status, myOrderStatus, isOwner, type }: { status: P2PStatus, myOrderStatus?: P2POrderStatus | null, isOwner: boolean, type: P2POffer['type'] }): CardAction => {
	const effective = myOrderStatus || status
	if (effective !== 'open') return effective
	return isOwner ? 'manage' : type
}

/** ¿Paga la moneda quien mira? En `sell` paga el taker; en `buy`, el dueño. */
export const viewerPays = (type: P2POffer['type'], viewerIsOwner: boolean): boolean => (type === 'sell') !== viewerIsOwner

/** Porcentaje que QUEDA de una oferta por rango (0–100), para la barra. */
export const remainingPct = (offer: Pick<P2POffer, 'amount' | 'available_amount'>): number => {
	const total = Number(offer.amount)
	if (!(total > 0)) return 0
	return Math.max(0, Math.min(100, (Number(offer.available_amount) / total) * 100))
}

const REQUIREMENT_KEYS: (keyof P2PRequirements)[] = ['min_completed', 'min_rating', 'min_account_days', 'min_trustscore']

/** Solo los requisitos activos (> 0), en el orden de la web; null si no hay ninguno. */
export const activeRequirements = (req: P2PRequirements | null | undefined): [keyof P2PRequirements, number][] | null => {
	if (!req) return null
	const out = REQUIREMENT_KEYS
		.map(k => [k, Number(req[k])] as [keyof P2PRequirements, number])
		.filter(([, v]) => Number.isFinite(v) && v > 0)
	return out.length ? out : null
}

/** `dd/MM HH:mm` en hora local, sin depender del locale de Intl. */
export const formatStamp = (date: string | null | undefined): string | null => {
	if (!date) return null
	const d = new Date(date)
	if (Number.isNaN(d.getTime())) return null
	const p = (n: number) => String(n).padStart(2, '0')
	return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
