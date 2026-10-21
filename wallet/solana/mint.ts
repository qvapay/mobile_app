/**
 * Lectura de un mint SPL (clásico o Token-2022) desde `getAccountInfo` en `jsonParsed` —
 * módulo PURO. Lo usa la wallet para tres cosas que NO se fían del registry:
 *   · el programa del mint, que es parte de la semilla de la ATA;
 *   · si el emisor puede bloquear la transferencia ahora mismo (Pausable) o exige un
 *     transfer hook (cuentas extra que la wallet no sabe pasar);
 *   · el multiplicador de Scaled UI de los xStocks: los dividendos se reinvierten subiendo
 *     un multiplicador en el mint, no el saldo. El saldo crudo no cambia; lo que el usuario
 *     tiene en ACCIONES es crudo × multiplicador.
 *
 * Gotcha del multiplicador (comprobado en mainnet, 2026-10-14): el emisor programa el
 * siguiente valor en `newMultiplier` con su `newMultiplierEffectiveTimestamp`, y `multiplier`
 * NO se actualiza al llegar esa hora — el programa elige uno u otro en cada lectura. Leer solo
 * `multiplier` deja el saldo de NVDAx un 0,08 % corto (y la API de precios de Jupiter comete
 * ese mismo error en su campo `multiplier`).
 */
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './codec'
import type { TokenProgramId } from './codec'

type Extension = { extension?: string, state?: Record<string, unknown> }

export type JsonParsedMintAccount = {
	value?: {
		owner?: string
		data?: { parsed?: { type?: string, info?: { decimals?: number, extensions?: Extension[] } } }
	} | null
} | null

/** Fracción exacta: `num / den`. */
export type Fraction = { num: bigint, den: bigint }

export type MintInfo = {
	program: TokenProgramId
	decimals: number
	paused: boolean
	/** Programa del transfer hook si hay uno ACTIVO (la extensión con `programId: null` no cuenta). */
	transferHook: string | null
	/** Scaled UI: valor vigente y el programado. Ausente = el mint no la tiene (multiplicador 1). */
	scaledUi: { multiplier: string, newMultiplier: string, effectiveAt: number } | null
}

const ext = (extensions: Extension[] | undefined, name: string) => extensions?.find(e => e.extension === name)?.state

/** → null si la cuenta no existe o no es un mint de un programa de tokens conocido. */
export const parseMintInfo = (account: JsonParsedMintAccount): MintInfo | null => {
	const value = account?.value
	const owner = value?.owner
	if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) return null
	const parsed = value?.data?.parsed
	if (parsed?.type !== 'mint' || typeof parsed.info?.decimals !== 'number') return null
	const extensions = parsed.info.extensions
	const scaled = ext(extensions, 'scaledUiAmountConfig')
	const hookProgram = ext(extensions, 'transferHook')?.programId
	return {
		program: owner,
		decimals: parsed.info.decimals,
		paused: ext(extensions, 'pausableConfig')?.paused === true,
		transferHook: typeof hookProgram === 'string' && hookProgram ? hookProgram : null,
		scaledUi: scaled ? {
			multiplier: String(scaled.multiplier ?? '1'),
			newMultiplier: String(scaled.newMultiplier ?? scaled.multiplier ?? '1'),
			effectiveAt: Number(scaled.newMultiplierEffectiveTimestamp ?? 0),
		} : null,
	}
}

/** Por qué no se puede transferir este token ahora mismo, o null si se puede. */
export const mintTransferBlock = (mint: MintInfo): 'paused' | 'transferHook' | null => {
	if (mint.paused) return 'paused'
	if (mint.transferHook) return 'transferHook'
	return null
}

/** Decimal en texto (`"1.0009180758490996"`) → fracción exacta. Rechaza notación científica y negativos. */
export const decimalToFraction = (text: string): Fraction | null => {
	const match = /^(\d+)(?:\.(\d+))?$/.exec(String(text).trim())
	if (!match) return null
	const decimals = match[2] ?? ''
	const den = 10n ** BigInt(decimals.length)
	return { num: BigInt(match[1] + decimals), den }
}

const ONE: Fraction = { num: 1n, den: 1n }

/**
 * Multiplicador vigente en `nowSeconds` (unix). Un valor ilegible cae a 1: es preferible
 * enseñar las acciones sin el último dividendo que inventarse una cifra.
 */
export const currentMultiplier = (scaledUi: MintInfo['scaledUi'], nowSeconds: number): Fraction => {
	if (!scaledUi) return ONE
	const active = scaledUi.effectiveAt > 0 && nowSeconds >= scaledUi.effectiveAt ? scaledUi.newMultiplier : scaledUi.multiplier
	const fraction = decimalToFraction(active)
	return fraction && fraction.num > 0n ? fraction : ONE
}

/** Unidades crudas → unidades de UI escaladas (mismas `decimals`), truncando. Para pintar acciones. */
export const scaleRaw = (raw: bigint, multiplier: Fraction): bigint => (raw * multiplier.num) / multiplier.den

/**
 * Unidades de UI escaladas → crudas, redondeando HACIA ABAJO: al vender "N acciones" nunca se
 * pide más de lo que el usuario tiene. Para vender todo se usa el saldo crudo tal cual.
 */
export const unscaleToRaw = (scaled: bigint, multiplier: Fraction): bigint => (scaled * multiplier.den) / multiplier.num
