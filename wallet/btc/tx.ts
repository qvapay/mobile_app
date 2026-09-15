/**
 * Enviar Bitcoin (P2WPKH, una sola dirección). Módulo PURO (fetch global +
 * @scure/btc-signer + noble), tests en node.
 *
 * Bitcoin no tiene "saldo" sino UTXOs: la app los lee de Esplora, elige
 * cuáles gastar (los más grandes primero), calcula la fee por tamaño
 * (sat/vB × vbytes estimados) y construye la tx con salida al destino y, si
 * sobra más que el polvo, cambio a la propia dirección. Regla 6 del plan:
 * tras firmar se RE-PARSEA la tx y se comprueba que las salidas son
 * exactamente destino (+ cambio propio) y que la fee es la calculada.
 *
 * "Enviar todo": si la cantidad pedida es el total de UTXOs, la fee se
 * descuenta de la cantidad y no hay cambio (como el MAX de Trust/SafePal).
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { Address, OutScript, p2wpkh, Transaction } from '@scure/btc-signer'

import { ChainHttpError, getJson } from '../chains/http'
import type { RegistryRpc } from '../registry/types'

/** Salida por debajo de esto no se crea (polvo): el cambio se deja en la fee. */
export const DUST_SATS = 546n

export type FeeTier = 'fast' | 'normal' | 'slow'

/** Bloques objetivo por nivel: ~10 min, ~30 min, ~1 h. */
export const FEE_TIER_TARGETS: Record<FeeTier, number> = { fast: 1, normal: 3, slow: 6 }
export const FEE_TIER_ETA_MINUTES: Record<FeeTier, number> = { fast: 10, normal: 30, slow: 60 }

/** Bloques objetivo por defecto (Normal): más barato que "próximo bloque" sin quedarse atascado. */
export const FEE_TARGET_BLOCKS = FEE_TIER_TARGETS.normal

/** Tope duro de fee absoluta (0.005 BTC): por encima, algo está mal. */
export const MAX_FEE_SATS = 500_000n

/** Fee rate mínima que aceptan los nodos (sat/vB). */
const MIN_FEE_RATE = 1

/** Tope de UTXOs por tx: más inputs = más vbytes; con esto cabe casi cualquier saldo de móvil. */
const MAX_INPUTS = 40

/** RBF: permite reemplazar por más fee si se atasca (secuencia < 0xfffffffe). */
const RBF_SEQUENCE = 0xfffffffd

export type Utxo = { txid: string, vout: number, value: bigint, confirmed: boolean }

export type BtcSendIntent = {
	from: string
	to: string
	/** sats */
	amount: bigint
}

export type BtcSelection = {
	inputs: Utxo[]
	/** sats que recibe el destino (con "enviar todo" es total − fee). */
	amount: bigint
	fee: bigint
	change: bigint
	vsize: number
	feeRate: number
	sendAll: boolean
}

export type PreparedBtcSend = {
	intent: BtcSendIntent
	selection: BtcSelection
	tier: FeeTier
	/** sat/vB por nivel, para mostrar las tres opciones sin volver al nodo. */
	feeRates: Record<FeeTier, number>
}

export class BtcVerifyError extends Error {
	constructor(message: string) { super(message); this.name = 'BtcVerifyError' }
}

// ---------------------------------------------------------------------------
// Direcciones, tamaño y fee
// ---------------------------------------------------------------------------

/** Dirección válida de mainnet: bech32 (bc1q/bc1p), P2SH (3…) o legacy (1…). */
export const isValidBtcAddress = (address: string): boolean => {
	try { Address().decode(address); return true } catch { return false }
}

/**
 * vbytes estimados de una tx P2WPKH: 10.5 de cabecera + 68 por input + 31
 * por salida P2WPKH (las salidas a otros tipos varían unos bytes; el margen
 * lo cubre el redondeo hacia arriba y la comprobación posterior con la tx real).
 */
export const estimateVsize = (inputs: number, outputs: number): number => Math.ceil(10.5 + inputs * 68 + outputs * 31)

export const feeFor = (vsize: number, feeRate: number): bigint => BigInt(Math.ceil(vsize * feeRate))

/**
 * Selección de UTXOs: confirmados primero y de mayor a menor, hasta cubrir
 * cantidad + fee. Si lo que sobra es polvo, va a la fee. Con `amount` igual
 * al total disponible se gasta todo (fee descontada del envío).
 */
export const selectUtxos = (utxos: Utxo[], amount: bigint, feeRate: number): BtcSelection => {
	const rate = Math.max(feeRate, MIN_FEE_RATE)
	const sorted = utxos.slice().sort((a, b) => (a.confirmed === b.confirmed ? (b.value > a.value ? 1 : b.value < a.value ? -1 : 0) : a.confirmed ? -1 : 1))
	const total = sorted.reduce((sum, u) => sum + u.value, 0n)
	if (amount <= 0n) throw new ChainHttpError('btc: cantidad inválida', { retryable: false })

	if (amount > total || sorted.length === 0) throw new ChainHttpError('btc: sin fondos suficientes para la cantidad más la comisión', { retryable: false })

	// Enviar todo (la cantidad ES el total): todos los inputs, una salida, fee descontada
	if (amount === total) {
		if (sorted.length > MAX_INPUTS) throw new ChainHttpError('btc: demasiados UTXOs para una sola transacción', { retryable: false })
		const vsize = estimateVsize(sorted.length, 1)
		const fee = feeFor(vsize, rate)
		if (total - fee < DUST_SATS) throw new ChainHttpError('btc: el saldo no cubre la comisión', { retryable: false })
		return { inputs: sorted, amount: total - fee, fee, change: 0n, vsize, feeRate: rate, sendAll: true }
	}

	const inputs: Utxo[] = []
	let gathered = 0n
	for (const utxo of sorted) {
		inputs.push(utxo)
		gathered += utxo.value
		if (inputs.length > MAX_INPUTS) throw new ChainHttpError('btc: demasiados UTXOs para una sola transacción', { retryable: false })
		const feeWithChange = feeFor(estimateVsize(inputs.length, 2), rate)
		if (gathered >= amount + feeWithChange) {
			const change = gathered - amount - feeWithChange
			if (change >= DUST_SATS) return { inputs, amount, fee: feeWithChange, change, vsize: estimateVsize(inputs.length, 2), feeRate: rate, sendAll: false }
			// Cambio de polvo: sin salida de cambio, lo sobrante engorda la fee
			const vsize = estimateVsize(inputs.length, 1)
			return { inputs, amount, fee: gathered - amount, change: 0n, vsize, feeRate: rate, sendAll: false }
		}
		const feeNoChange = feeFor(estimateVsize(inputs.length, 1), rate)
		if (gathered >= amount + feeNoChange) {
			const vsize = estimateVsize(inputs.length, 1)
			return { inputs, amount, fee: gathered - amount, change: 0n, vsize, feeRate: rate, sendAll: false }
		}
	}
	throw new ChainHttpError('btc: sin fondos suficientes para la cantidad más la comisión', { retryable: false })
}

// ---------------------------------------------------------------------------
// Esplora
// ---------------------------------------------------------------------------

type Deps = { signal?: AbortSignal }
const base = (rpc: RegistryRpc) => rpc.url.replace(/\/+$/, '')

export const getBtcUtxos = async (rpc: RegistryRpc, address: string, deps: Deps = {}): Promise<Utxo[]> => {
	const rows = await getJson<Array<{ txid: string, vout: number, value: number, status?: { confirmed?: boolean } }>>(`${base(rpc)}/address/${address}/utxo`, { signal: deps.signal, headers: rpc.headers })
	return (rows ?? []).map(row => ({ txid: row.txid, vout: row.vout, value: BigInt(row.value), confirmed: !!row.status?.confirmed }))
}

/** sat/vB por nivel a partir de `/fee-estimates` (mapa bloques → sat/vB). PURO. */
export const feeRatesFromEstimates = (estimates: Record<string, number> | null | undefined): Record<FeeTier, number> => {
	const at = (target: number): number => {
		// Si el nodo no trae ese objetivo exacto, el más cercano por debajo (más rápido) que exista
		for (let t = target; t >= 1; t--) {
			const rate = estimates?.[String(t)]
			if (typeof rate === 'number' && rate > 0) return Math.max(rate, MIN_FEE_RATE)
		}
		return MIN_FEE_RATE
	}
	const fast = at(FEE_TIER_TARGETS.fast)
	const normal = Math.min(at(FEE_TIER_TARGETS.normal), fast)
	const slow = Math.min(at(FEE_TIER_TARGETS.slow), normal)
	return { fast, normal, slow }
}

/** sat/vB por nivel; si el nodo no responde, 1 sat/vB en todos (mínimo de relay). */
export const getBtcFeeRates = async (rpc: RegistryRpc, deps: Deps = {}): Promise<Record<FeeTier, number>> => {
	try {
		return feeRatesFromEstimates(await getJson<Record<string, number>>(`${base(rpc)}/fee-estimates`, { signal: deps.signal, headers: rpc.headers }))
	} catch {
		return { fast: MIN_FEE_RATE, normal: MIN_FEE_RATE, slow: MIN_FEE_RATE }
	}
}

/** Compatibilidad: la tasa del nivel Normal. */
export const getBtcFeeRate = async (rpc: RegistryRpc, deps: Deps = {}): Promise<number> => (await getBtcFeeRates(rpc, deps)).normal

export const prepareBtcSend = async (rpc: RegistryRpc, intent: BtcSendIntent, deps: Deps & { tier?: FeeTier } = {}): Promise<PreparedBtcSend> => {
	if (!isValidBtcAddress(intent.to)) throw new ChainHttpError('btc: destino inválido', { retryable: false })
	const tier = deps.tier ?? 'normal'
	const [utxos, feeRates] = await Promise.all([getBtcUtxos(rpc, intent.from, deps), getBtcFeeRates(rpc, deps)])
	const selection = selectUtxos(utxos, intent.amount, feeRates[tier])
	if (selection.fee > MAX_FEE_SATS) throw new ChainHttpError(`btc: comisión anómala (${selection.fee} sats)`, { retryable: false })
	return { intent, selection, tier, feeRates }
}

// ---------------------------------------------------------------------------
// Firma, verificación y broadcast
// ---------------------------------------------------------------------------

export type SignedBtcTx = { hex: string, txid: string }

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g)!.map(b => parseInt(b, 16)))

/**
 * Construye y firma (P2WPKH, RBF). Tras firmar re-parsea la tx y verifica
 * salidas y fee contra la selección. La clave no se retiene.
 */
export const signBtcTransaction = (prepared: PreparedBtcSend, privateKey: Uint8Array): SignedBtcTx => {
	const { intent, selection } = prepared
	const pubkey = secp256k1.getPublicKey(privateKey, true)
	const own = p2wpkh(pubkey)
	if (own.address !== intent.from) throw new BtcVerifyError('la clave no corresponde a la dirección de origen')

	const tx = new Transaction({ allowUnknownOutputs: false })
	for (const utxo of selection.inputs) {
		tx.addInput({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { script: own.script, amount: utxo.value }, sequence: RBF_SEQUENCE })
	}
	tx.addOutputAddress(intent.to, selection.amount)
	if (selection.change > 0n) tx.addOutputAddress(intent.from, selection.change)
	tx.sign(privateKey)
	tx.finalize()

	const signed = { hex: tx.hex, txid: tx.id }
	verifySignedBtcTransaction(signed, prepared)
	return signed
}

export const verifySignedBtcTransaction = ({ hex }: SignedBtcTx, { intent, selection }: PreparedBtcSend): void => {
	const parsed = Transaction.fromRaw(hexToBytes(hex), { allowUnknownOutputs: false })
	const expectedOutputs = selection.change > 0n ? 2 : 1
	if (parsed.outputsLength !== expectedOutputs) throw new BtcVerifyError(`la tx trae ${parsed.outputsLength} salidas, se esperaban ${expectedOutputs}`)
	if (parsed.inputsLength !== selection.inputs.length) throw new BtcVerifyError('número de inputs distinto')

	const out0 = parsed.getOutput(0)
	if (!out0.script || !scriptMatchesAddress(out0.script, intent.to)) throw new BtcVerifyError('destino distinto')
	if (out0.amount !== selection.amount) throw new BtcVerifyError('cantidad distinta')
	if (selection.change > 0n) {
		const out1 = parsed.getOutput(1)
		if (!out1.script || !scriptMatchesAddress(out1.script, intent.from)) throw new BtcVerifyError('el cambio no vuelve a la propia dirección')
		if (out1.amount !== selection.change) throw new BtcVerifyError('cambio distinto')
	}
	const totalIn = selection.inputs.reduce((sum, u) => sum + u.value, 0n)
	const totalOut = selection.amount + selection.change
	if (totalIn - totalOut !== selection.fee) throw new BtcVerifyError('fee distinta de la calculada')
	if (selection.fee > MAX_FEE_SATS) throw new BtcVerifyError('fee por encima del tope')
}

/** ¿El script de salida es exactamente el de esa dirección? (bytes del scriptPubKey). */
const scriptMatchesAddress = (script: Uint8Array, address: string): boolean => {
	const expected = OutScript.encode(Address().decode(address))
	return script.length === expected.length && script.every((byte, i) => byte === expected[i])
}

export type BtcBroadcastResult = { txid: string, duplicate: boolean }

/**
 * `POST /tx` de Esplora con el hex; responde el txid en texto plano. Una tx
 * ya conocida cuenta como éxito (reintento tras timeout). Rechazos de
 * política (fee baja, polvo) no rotan: serían iguales en cualquier nodo.
 */
export const broadcastBtcTransaction = async (rpc: RegistryRpc, signed: SignedBtcTx, deps: Deps = {}): Promise<BtcBroadcastResult> => {
	const res = await fetch(`${base(rpc)}/tx`, { method: 'POST', body: signed.hex, signal: deps.signal, headers: { 'Content-Type': 'text/plain', ...rpc.headers } })
	const text = (await res.text()).trim()
	if (res.ok) return { txid: /^[0-9a-f]{64}$/i.test(text) ? text.toLowerCase() : signed.txid, duplicate: false }
	if (/already in block chain|already known|txn-already-in-mempool|txn-already-known|already have/i.test(text)) return { txid: signed.txid, duplicate: true }
	throw new ChainHttpError(`btc: broadcast rechazado (${res.status}): ${text.slice(0, 200)}`, { status: res.status, retryable: res.status >= 500 })
}
