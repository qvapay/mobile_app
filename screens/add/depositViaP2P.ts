/**
 * «Vía P2P» en el depósito — módulo PURO (cero react-native, testeable bajo
 * `@jest-environment node`).
 *
 * Las monedas cubanas que NO se depositan (saldo ETECSA y tarjetas en CUP/MLC)
 * sí se VENDEN en el P2P: la tesorería de QvaPay (`@skymind`) publica ofertas
 * `sell` automatizadas en ellas, y quien entra al depósito con ese saldo es
 * justo el tomador que falta. Espejo de qpweb
 * `scripts/p2p/treasury-showcase-rules.js` (composición del escaparate) y
 * `scripts/p2p/requirements-rules.js` (evaluación de requisitos): cambiar
 * ticks, tope o reglas exige tocar LOS DOS repos.
 *
 * La app compone el escaparate con `GET /p2p/index` (dos listados: tesorería y
 * mercado) porque qpweb aún no expone `GET /topup/alternatives`; cuando exista,
 * `composeShowcase` y `evaluateRequirements` se sustituyen por su respuesta.
 */

import { activeRequirements } from '../p2p/p2pOfferCard'
import type { ApplicantRequirementKey } from '../p2p/p2pApplicantRequirements'
import type { PeerProfilePayload } from '../p2p/p2pQueries'
import type { Coin, P2POffer, P2PRequirements, User } from '../../types/domain'

/** Mismo orden que `TREASURY_SHOWCASE_TICKS` de qpweb. */
export const VIA_P2P_TICKS = ['ETECSA', 'BANK_CUP', 'BANK_MLC', 'CLASICA', 'BANDECPREPAGO'] as const

export type ViaP2PTick = typeof VIA_P2P_TICKS[number]

/** Username de la tesorería: el `peer=` que filtra sus ofertas en `/p2p/index`. */
export const VIA_P2P_PEER = 'skymind'

/** Ofertas que se enseñan como máximo. */
export const VIA_P2P_TAKE = 5
/** Se piden de más para poder descartar las `only_vip` sin quedarse corto. */
export const VIA_P2P_FETCH = 10

const EMPTY_COINS: Coin[] = []

/**
 * ¿Esta moneda se vende en el P2P en vez de depositarse? Solo las de la lista
 * Y mientras sigan sin admitir depósito: si qpweb vuelve a habilitar una, la
 * app la trata como depósito normal sin publicar versión.
 */
export const isViaP2PCoin = (coin: Pick<Coin, 'tick' | 'enabled_in'> | null | undefined): boolean =>
	!!coin && (VIA_P2P_TICKS as readonly string[]).includes(coin.tick) && !coin.enabled_in

/**
 * Las monedas «Vía P2P» que faltan en el catálogo depositable, en el orden de
 * la lista. Devuelve siempre el MISMO array vacío cuando no hay ninguna: la
 * pantalla conserva así la identidad de su catálogo.
 *
 * @param all - `GET /coins/v2` sin filtros (trae `enabled_in`).
 * @param depositable - El catálogo `enabled_in=true` que ya pinta la pantalla.
 */
export const viaP2PCoinsFrom = (all: Coin[] | null | undefined, depositable: Coin[] | null | undefined): Coin[] => {
	if (!all?.length) return EMPTY_COINS
	const listed = new Set((depositable ?? []).map(c => c.tick))
	const out: Coin[] = []
	for (const tick of VIA_P2P_TICKS) {
		if (listed.has(tick)) continue
		const coin = all.find(c => c.tick === tick)
		if (coin && isViaP2PCoin(coin)) out.push(coin)
	}
	return out.length ? out : EMPTY_COINS
}

export type ShowcaseSource = 'treasury' | 'market'

export type Showcase = {
	source: ShowcaseSource
	offers: P2POffer[]
	/** La del puesto promocionado cuando va la primera; si no, null. */
	promotedUuid: string | null
}

type ComposeInput = {
	treasury: P2POffer[] | null | undefined
	promoted: P2POffer | null | undefined
	market: P2POffer[] | null | undefined
	vip: boolean
}

// Un no-VIP no ve ofertas `only_vip` (el detalle le respondería 404)
const visibleTo = (offers: (P2POffer | null | undefined)[], vip: boolean): P2POffer[] =>
	offers.filter((o): o is P2POffer => !!o && (vip || !o.only_vip))

/**
 * Compone el escaparate como la web: las de la tesorería si tiene alguna
 * visible; si no, la promocionada del par (primera) y las mejores del mercado
 * sin repetirla. Nunca más de `VIA_P2P_TAKE`.
 */
export const composeShowcase = ({ treasury, promoted, market, vip }: ComposeInput): Showcase => {
	const own = visibleTo(treasury ?? [], vip).slice(0, VIA_P2P_TAKE)
	if (own.length) return { source: 'treasury', offers: own, promotedUuid: null }
	const top = visibleTo([promoted], vip)[0] ?? null
	const rest = visibleTo(market ?? [], vip).filter(o => o.uuid !== top?.uuid)
	const offers = (top ? [top, ...rest] : rest).slice(0, VIA_P2P_TAKE)
	return { source: 'market', offers, promotedUuid: top?.uuid ?? null }
}

/**
 * Requisitos «para tomar estas ofertas»: por clave, el MÁXIMO entre las
 * mostradas. Cada oferta guarda los requisitos vigentes cuando se publicó y
 * pueden cambiar desde `/admin/settings` sin deploy, así que el máximo nunca
 * sub-declara lo que el usuario necesita. `null` si ninguna trae.
 */
export const showcaseRequirements = (offers: P2POffer[]): P2PRequirements | null => {
	const out: P2PRequirements = {}
	for (const offer of offers) {
		for (const [key, value] of activeRequirements(offer.requirements) ?? []) {
			if (value > (out[key] ?? 0)) out[key] = value
		}
	}
	return Object.keys(out).length ? out : null
}

/** Lo que se compara contra los requisitos (espejo de `applicantStats` de qpweb). */
export type ApplicantStats = { completed: number, rating: number, accountDays: number, trustscore: number }

export type RequirementMiss = { key: ApplicantRequirementKey, required: number, actual: number }

export type RequirementsCheck = { ok: boolean, missing: RequirementMiss[] }

/** Días desde `createdAt` (0 si no se puede leer); el backend hace `floor` al comparar. */
export const accountDaysSince = (createdAt: string | null | undefined, now = Date.now()): number => {
	const t = createdAt ? new Date(createdAt).getTime() : NaN
	return Number.isFinite(t) ? Math.max(0, (now - t) / 86400000) : 0
}

/**
 * Estadísticas del propio usuario desde su perfil público P2P (`GET
 * /p2p/user/{uuid}`: la MISMA caché de operaciones y rating que usa el
 * backend al evaluar) más el TrustScore y la antigüedad de la sesión.
 */
export const applicantStatsFrom = (profile: PeerProfilePayload | null | undefined, user: Pick<User, 'createdAt' | 'trustscore'> | null | undefined, now = Date.now()): ApplicantStats => {
	const createdAt = (profile?.user?.createdAt as string | undefined) ?? user?.createdAt
	return {
		completed: Number(profile?.stats?.completedP2P) || 0,
		rating: Number(profile?.stats?.averageRating) || 0,
		accountDays: accountDaysSince(createdAt, now),
		trustscore: Number(user?.trustscore) || 0,
	}
}

/** ¿Cumple? Misma semántica que qpweb: `floor` en días y `actual < required` = falta. */
export const evaluateRequirements = (requirements: P2PRequirements | null | undefined, stats: ApplicantStats): RequirementsCheck => {
	const active = activeRequirements(requirements)
	if (!active) return { ok: true, missing: [] }
	const actualOf: Record<ApplicantRequirementKey, number> = {
		min_completed: stats.completed,
		min_rating: stats.rating,
		min_account_days: Math.floor(stats.accountDays),
		min_trustscore: stats.trustscore,
	}
	const missing: RequirementMiss[] = []
	for (const [key, required] of active) {
		const actual = actualOf[key as ApplicantRequirementKey]
		if (actual < required) missing.push({ key: key as ApplicantRequirementKey, required, actual })
	}
	return { ok: missing.length === 0, missing }
}

/** Claves i18n de «cómo se paga» por moneda (se resuelven con `t` en render). */
export const HOW_TO_PAY_KEYS: Record<ViaP2PTick, string> = {
	ETECSA: 'add.viaP2P.howToPay.ETECSA',
	BANK_CUP: 'add.viaP2P.howToPay.BANK_CUP',
	BANK_MLC: 'add.viaP2P.howToPay.BANK_MLC',
	CLASICA: 'add.viaP2P.howToPay.CLASICA',
	BANDECPREPAGO: 'add.viaP2P.howToPay.BANDECPREPAGO',
}

export const howToPayKey = (tick: string): string => HOW_TO_PAY_KEYS[tick as ViaP2PTick] ?? 'add.viaP2P.howToPay.default'

/** Params del tab P2P para «Ver todas»: Comprar, moneda fijada, mejor tasa y, con tesorería, solo `@skymind`. */
export const marketParams = (tick: string, coinName: string | undefined, source: ShowcaseSource) => ({
	coin: tick,
	coinName: coinName || tick,
	type: 'sell' as const,
	sort: 'best_rate' as const,
	...(source === 'treasury' ? { peer: VIA_P2P_PEER } : {}),
})
