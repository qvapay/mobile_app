/**
 * Cartera de acciones tokenizadas (xStocks) — módulo PURO, testeable en node.
 *
 * Dos unidades conviven y no se pueden mezclar:
 *   · CRUDA: lo que hay en la cuenta de token. Es lo que se envía y se cambia.
 *   · ACCIÓN: cruda × multiplicador de dividendos (Scaled UI). Es lo que ve el usuario y la
 *     unidad del precio de mercado (`usdPrice` de Jupiter ≈ precio del subyacente).
 * El valor en USD sale igual por los dos caminos (crudas × precio por cruda = acciones ×
 * precio por acción); aquí se calcula por el de crudas, que no depende del multiplicador.
 */
import { formatUnits } from '../../../wallet/chains/units'
import { currentMultiplier, scaleRaw } from '../../../wallet/solana/mint'
import type { MintInfo } from '../../../wallet/solana/mint'
import { XSTOCK_DECIMALS, XSTOCKS } from '../../../wallet/xstocks'
import type { XStock } from '../../../wallet/xstocks'
import type { JupiterPriceEntry } from '../../../api/xstocksApi'

export type ScaledUiMap = Record<string, MintInfo['scaledUi']>

export type XStockQuote = {
	/** USD por acción. */
	price: number
	/** USD por unidad CRUDA (sin multiplicador): la que valora el saldo. */
	rawPrice: number
	/** Variación 24 h en %, o null si no se conoce. */
	change24h: number | null
	liquidity: number | null
}

const positive = (value: unknown): number | null => {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? n : null
}

const multiplierNumber = (scaledUi: MintInfo['scaledUi'] | undefined, nowSeconds: number): number => {
	const { num, den } = currentMultiplier(scaledUi ?? null, nowSeconds)
	return Number(num) / Number(den)
}

/**
 * Entrada de Jupiter → cotización. El precio por cruda lo da Jupiter (`usdPricePrescaled`)
 * cuando el mint tiene Scaled UI; si no, se deriva con el multiplicador leído de la CADENA.
 */
export const toQuote = (entry: JupiterPriceEntry | undefined, scaledUi: MintInfo['scaledUi'] | undefined, nowSeconds: number): XStockQuote | null => {
	const price = positive(entry?.usdPrice)
	if (price === null) return null
	const rawPrice = positive(entry?.scaledUiConfig?.usdPricePrescaled) ?? price * multiplierNumber(scaledUi, nowSeconds)
	// `Number(null)` es 0: sin dato no puede leerse como "no se movió"
	const rawChange = entry?.priceChange24h
	const change = rawChange === null || rawChange === undefined ? NaN : Number(rawChange)
	return {
		price,
		rawPrice,
		change24h: Number.isFinite(change) ? change : null,
		liquidity: positive(entry?.liquidity),
	}
}

export type XStockPosition = {
	stock: XStock
	assetId: string
	/** Saldo crudo (unidades mínimas): lo que se vende con "vender todo". */
	raw: bigint
	/** Acciones (escaladas), decimal exacto. */
	shares: string
	quote: XStockQuote | null
	/** Valor USD de la posición, o null sin precio. */
	value: number | null
	/** Lo que ha ganado/perdido HOY la posición (por la variación 24 h), o null. */
	dayChange: number | null
}

/** De la variación % y el valor ACTUAL, cuánto se movió en USD (valor previo = v / (1 + c)). */
export const dayChangeUsd = (value: number, changePct: number): number => value - value / (1 + changePct / 100)

/** Acciones de un saldo CRUDO (× el multiplicador de dividendos vigente), decimal exacto. */
export const sharesOf = (raw: bigint, scaledUi: MintInfo['scaledUi'] | undefined, nowSeconds: number): string =>
	formatUnits(scaleRaw(raw, currentMultiplier(scaledUi ?? null, nowSeconds)), XSTOCK_DECIMALS)

export const buildPosition = (stock: XStock, raw: bigint, quote: XStockQuote | null, scaledUi: MintInfo['scaledUi'] | undefined, nowSeconds: number): XStockPosition => {
	const shares = sharesOf(raw, scaledUi, nowSeconds)
	const value = quote ? Number(formatUnits(raw, XSTOCK_DECIMALS)) * quote.rawPrice : null
	return {
		stock,
		assetId: `solana:${stock.mint}`,
		raw,
		shares,
		quote,
		value,
		dayChange: value !== null && quote?.change24h !== null && quote?.change24h !== undefined ? dayChangeUsd(value, quote.change24h) : null,
	}
}

/** Una fila por xStock, en el orden del catálogo. `balances` = saldos crudos de la wallet por assetId. */
export const buildPositions = ({ balances, quotes, scaledUi, nowSeconds }: {
	balances: Record<string, string>
	quotes: Record<string, XStockQuote | null>
	scaledUi: ScaledUiMap
	nowSeconds: number
}): XStockPosition[] => XSTOCKS.map(stock => buildPosition(
	stock,
	BigInt(balances[`solana:${stock.mint}`] ?? '0'),
	quotes[stock.mint] ?? null,
	scaledUi[stock.mint],
	nowSeconds,
))

export type PortfolioSummary = {
	/** Valor total de las posiciones con precio. */
	value: number
	/** Variación de hoy en USD y en % sobre el valor de ayer. */
	dayChange: number
	dayChangePct: number
	/** Posiciones con saldo. */
	held: XStockPosition[]
}

export const summarizePortfolio = (positions: XStockPosition[]): PortfolioSummary => {
	const held = positions.filter(p => p.raw > 0n)
	const value = held.reduce((sum, p) => sum + (p.value ?? 0), 0)
	const dayChange = held.reduce((sum, p) => sum + (p.dayChange ?? 0), 0)
	const previous = value - dayChange
	return { value, dayChange, dayChangePct: previous > 0 ? (dayChange / previous) * 100 : 0, held }
}

/**
 * "Populares" para quien aún no tiene acciones: por liquidez (es lo que hace que comprar poco
 * no mueva el precio), con las sin cotización al final.
 */
export const sortByLiquidity = (positions: XStockPosition[]): XStockPosition[] =>
	positions.slice().sort((a, b) => (b.quote?.liquidity ?? -1) - (a.quote?.liquidity ?? -1))

/**
 * USD → unidades CRUDAS a vender para recibir ≈ esa cantidad, sin pasarse del saldo. Lo usa
 * "Vender $X"; "vender todo" usa el saldo crudo tal cual.
 */
export const rawForUsd = (usd: number, quote: XStockQuote, balance: bigint): bigint => {
	if (!(usd > 0) || !(quote.rawPrice > 0)) return 0n
	const units = BigInt(Math.floor((usd / quote.rawPrice) * 10 ** XSTOCK_DECIMALS))
	return units > balance ? balance : units
}
