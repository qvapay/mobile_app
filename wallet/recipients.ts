/**
 * ¿A quién va este envío? Defensa contra el address poisoning. Módulo PURO.
 *
 * El ataque: el atacante genera una dirección que EMPIEZA y TERMINA como una con la que el
 * usuario ya trata y la mete en su historial (le manda una cantidad mínima, o hace un
 * `transferFrom` de 0 desde la wallet del usuario, que cualquiera puede hacer en USDT). Cuando
 * el usuario copia "su dirección de siempre" de la actividad, copia la del atacante.
 * Resaltar los extremos (`helpers/addressHighlight`) no basta: son justo lo que imita.
 *
 * Aquí se clasifica el destino contra el historial del propio usuario en la misma familia de
 * direcciones (una dirección EVM es la misma en Ethereum, BSC y Base):
 *   · `self`      una dirección propia.
 *   · `lookalike` comparte principio y final con una de confianza, pero es OTRA.
 *   · `known`     ya se le envió dinero de verdad (salida confirmada y mayor que 0).
 *   · `poisoner`  solo aparece en el historial por polvo o transferencias de 0.
 *   · `new`       nada de lo anterior.
 *
 * "De confianza" = propias, a las que se envió dinero y las que mandaron una cantidad real.
 * Una salida de 0 no cuenta como envío: es la firma del `transferFrom` de 0 del atacante.
 *
 * El parecido se mira ANTES que "ya se le envió": una sola salida hacia la imitación (el envío
 * de prueba de 1 USDT antes del grande, o la estafa que ya funcionó una vez) no puede silenciar
 * el aviso para siempre. El precio es que el Bob de verdad también avisa mientras su imitación
 * sea de confianza en el historial, y esa es justo una señal que conviene dar.
 */
import { isSameAddress } from './assets'
import { isDustTx } from './dust'
import type { ChainKind } from './registry/types'
import type { WalletTx } from '../types/domain'

/** Caracteres significativos que tienen que coincidir en cada extremo, como mínimo. */
export const LOOKALIKE_MIN_EDGE = 2
/** Y entre los dos extremos: a partir de aquí ya no es casualidad (hex: ~1 entre 16^6). */
export const LOOKALIKE_MIN_EDGES = 6

export type RecipientVerdict =
	| { kind: 'self' }
	| { kind: 'known' }
	/**
	 * `of`: la dirección de confianza a la que se parece, tal como la conoce el usuario.
	 * `known`: al destino YA se le envió dinero, así que no se puede saber cuál de las dos es la
	 * de verdad (quizá pagó a la imitación una vez): el aviso no puede señalar ninguna.
	 */
	| { kind: 'lookalike', of: string, known: boolean }
	| { kind: 'poisoner' }
	| { kind: 'new' }

/** Historial de un activo de la familia, con el precio que decide qué es polvo. */
export type RecipientHistory = { items: WalletTx[], priceUsd: number | null }

/** Forma comparable: sin mayúsculas donde la familia no las distingue (ver `isSameAddress`). */
const canonical = (kind: ChainKind, address: string): string => {
	const text = address.trim()
	const caseless = kind === 'evm' || kind === 'stacks' || (kind === 'btc' && /^bc1/i.test(text))
	return caseless ? text.toLowerCase() : text
}

/**
 * Lo que de verdad distingue una dirección de otra: sin el prefijo fijo de su formato
 * (`0x`, la `T` de TRON, `bc1q`/`bc1p`, el `1`/`3` de base58, `SP`/`SM`). Sin quitarlo, todas
 * las de una red "coincidirían" ya en su primer carácter.
 */
const significant = (kind: ChainKind, canonicalAddress: string): string => {
	if (kind === 'evm') return canonicalAddress.replace(/^0x/, '')
	if (kind === 'tron') return canonicalAddress.replace(/^T/, '')
	if (kind === 'stacks') return canonicalAddress.slice(2)
	if (kind === 'btc') return /^bc1/.test(canonicalAddress) ? canonicalAddress.slice(4) : canonicalAddress.slice(1)
	return canonicalAddress
}

/** Caracteres iguales al principio y al final, sin solaparse. */
const sharedEdges = (a: string, b: string): { head: number, tail: number } => {
	const max = Math.min(a.length, b.length)
	let head = 0
	while (head < max && a[head] === b[head]) head++
	let tail = 0
	while (tail < max - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
	return { head, tail }
}

/** Cuánto se parecen sus extremos; 0 si son la misma o no se parecen lo suficiente. */
const lookalikeScore = (kind: ChainKind, to: string, other: string): number => {
	const a = significant(kind, canonical(kind, to))
	const b = significant(kind, canonical(kind, other))
	if (a === b) return 0
	const { head, tail } = sharedEdges(a, b)
	return head >= LOOKALIKE_MIN_EDGE && tail >= LOOKALIKE_MIN_EDGE && head + tail >= LOOKALIKE_MIN_EDGES ? head + tail : 0
}

const isZero = (amount: string): boolean => {
	const value = Number(amount)
	return Number.isFinite(value) && value === 0
}

/** Contraparte de un movimiento: a quién se envió, o quién envió. */
const counterparty = (tx: WalletTx): string | null => (tx.direction === 'out' ? tx.to : tx.direction === 'in' ? tx.from : null)

/**
 * Clasifica `to` contra el historial del usuario en su familia de direcciones.
 *
 * @param params.kind - Familia de direcciones del activo que se envía.
 * @param params.to - Destino tecleado, pegado o escaneado.
 * @param params.own - Direcciones propias en esa familia.
 * @param params.histories - Historial de CADA activo de la familia con su precio.
 */
export const checkRecipient = ({ kind, to, own, histories }: {
	kind: ChainKind
	to: string
	own: string[]
	histories: RecipientHistory[]
}): RecipientVerdict => {
	if (own.some(address => isSameAddress(kind, address, to))) return { kind: 'self' }

	const key = (address: string) => canonical(kind, address)
	/** Forma original de cada dirección de confianza, para enseñarla tal cual. */
	const trusted = new Map<string, string>()
	const sentTo = new Set<string>()
	const suspicious = new Set<string>()
	for (const address of own) trusted.set(key(address), address)

	for (const { items, priceUsd } of histories) {
		for (const tx of items) {
			if (tx.kind !== undefined && tx.kind !== 'transfer') continue
			if (tx.status === 'failed') continue
			const other = counterparty(tx)
			if (!other) continue
			if (isZero(tx.amount) || isDustTx(tx, priceUsd)) {
				suspicious.add(key(other))
				continue
			}
			if (tx.status !== 'confirmed') continue
			trusted.set(key(other), other)
			if (tx.direction === 'out') sentTo.add(key(other))
		}
	}

	const target = key(to)
	// `lookalikeScore` descarta el propio destino: se compara con las DEMÁS de confianza
	let best: { of: string, score: number } | null = null
	for (const [candidate, original] of trusted) {
		const score = lookalikeScore(kind, target, candidate)
		if (score > 0 && (!best || score > best.score)) best = { of: original, score }
	}
	if (best) return { kind: 'lookalike', of: best.of, known: sentTo.has(target) }

	if (sentTo.has(target)) return { kind: 'known' }
	if (suspicious.has(target) && !trusted.has(target)) return { kind: 'poisoner' }
	return { kind: 'new' }
}

/** El veredicto exige que el usuario confirme expresamente que revisó la dirección. */
export const isBlockingVerdict = (verdict: RecipientVerdict | null): verdict is Extract<RecipientVerdict, { kind: 'lookalike' | 'poisoner' }> =>
	verdict?.kind === 'lookalike' || verdict?.kind === 'poisoner'

export type AddressDiff = { head: string, middle: string, tail: string }

/**
 * Trocea `address` en lo que comparte con `other` al principio y al final, y el medio que
 * cambia: el aviso pinta el medio para que se vea dónde está la diferencia.
 */
export const addressDiff = (kind: ChainKind, address: string, other: string): AddressDiff => {
	const text = address.trim()
	const { head, tail } = sharedEdges(canonical(kind, text), canonical(kind, other))
	return { head: text.slice(0, head), middle: text.slice(head, text.length - tail), tail: text.slice(text.length - tail) }
}
