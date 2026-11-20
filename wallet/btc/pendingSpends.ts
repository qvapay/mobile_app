/**
 * Lo que esta wallet acaba de gastar en Bitcoin y un nodo puede no saber todavía. Módulo PURO.
 *
 * La app arma cada envío con los UTXOs que le lista el nodo. Un nodo cuyo índice por dirección
 * va por detrás del mempool sigue listando, durante un rato, monedas que la wallet gastó hace
 * segundos, y aún no lista el cambio. El envío siguiente las volvería a gastar: la red lo
 * rechaza o, si paga más comisión, lo toma por un reemplazo del primero (se firma con RBF),
 * que ya no llega aunque la app lo dio por enviado. Medido con pagos reales del mempool
 * (2026-11-18 y 2026-11-20): un nodo con índice por tandas tarda en torno a un minuto. Entre
 * dos públicos grandes hay segundos, que también es una ventana: de 16 lecturas hechas en uno
 * nada más ver la tx en el otro, 8 aún no la traían. En las 18 lecturas atrasadas, la lista
 * del nodo más la nota dio exactamente la lista del nodo que iba al día.
 *
 * Por eso cada tx que un nodo ACEPTÓ deja aquí una nota con lo que gasta y con las salidas
 * que vuelven a la propia dirección, leídas de los bytes firmados. Al armar el envío
 * siguiente, la lista del nodo se corrige con ellas (`applyPendingSpends`):
 *
 * - Lo que una nota gastó no se ofrece, lo liste el nodo o no.
 * - El cambio de una nota se añade SOLO si el nodo demuestra ir por detrás de esa tx: aún
 *   lista algo que ella gasta, o ella gasta el cambio de otra que tampoco ha visto. Si ya la
 *   vio manda su lista, y un cambio que no está ahí es que ya se gastó.
 *
 * Las notas viven en memoria y caducan (`PENDING_SPEND_TTL_MS`); después vuelve a mandar el
 * nodo, como antes de existir. Una nota equivocada (la tx la reemplazó otra wallet con la
 * misma frase) solo puede esconder monedas un rato o añadir una salida que la red rechazará
 * al difundir: los importes salen de una tx que firmó esta wallet, no de lo que diga un nodo.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { Address, OutScript, Transaction } from '@scure/btc-signer'

import type { Utxo } from './tx'

export type BtcOutpoint = { txid: string, vout: number }

export type PendingBtcSpend = {
	txid: string
	/** scriptPubKey (hex) de la dirección que firmó: la misma dirección se escribe de más de una forma. */
	owner: string
	spent: BtcOutpoint[]
	/** Salidas de la tx que vuelven a esa dirección (el cambio). */
	created: { vout: number, value: bigint }[]
	/** Cuándo dijo un nodo que la conoce (ms epoch). */
	at: number
}

/**
 * Cuánto vale una nota: una hora, lo que tarda en confirmarse casi cualquier envío (el nivel
 * Económico apunta a ~1 h). El retraso del índice de un nodo se mide en segundos o en un
 * minuto, pero un nodo puede no tener una tx pendiente hasta que se mina (la que paga menos
 * de lo que él admite). Alargarla sale barato: con el nodo al día la nota no cambia nada.
 * Pasada la hora manda la lista del nodo, y lo que él dé por disponible se puede volver a
 * gastar, como antes.
 */
export const PENDING_SPEND_TTL_MS = 60 * 60_000

/** Tope de notas: muy por encima de lo que se envía en una hora. */
const MAX_NOTES = 64

const outpointKey = ({ txid, vout }: BtcOutpoint): string => `${txid.toLowerCase()}:${vout}`

const scriptOf = (address: string): Uint8Array | null => {
	try { return OutScript.encode(Address().decode(address)) } catch { return null }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i])

/**
 * Qué gasta una tx firmada y qué salidas suyas vuelven a `address`. Sale de los BYTES que se
 * difunden, no de cómo se armó: vale igual para un envío, para un swap con su OP_RETURN y
 * para un envío a la propia dirección.
 */
export const readSignedBtcSpend = (hex: string, address: string): Omit<PendingBtcSpend, 'at'> => {
	const own = scriptOf(address)
	if (!own) throw new Error('btc: dirección de origen inválida')
	const tx = Transaction.fromRaw(hexToBytes(hex), { allowUnknownOutputs: true })
	const spent: BtcOutpoint[] = []
	for (let i = 0; i < tx.inputsLength; i++) {
		const input = tx.getInput(i)
		if (!input.txid || typeof input.index !== 'number') throw new Error('btc: input sin origen')
		spent.push({ txid: bytesToHex(input.txid), vout: input.index })
	}
	const created: PendingBtcSpend['created'] = []
	for (let i = 0; i < tx.outputsLength; i++) {
		const output = tx.getOutput(i)
		if (output.script && typeof output.amount === 'bigint' && sameBytes(output.script, own)) created.push({ vout: i, value: output.amount })
	}
	return { txid: tx.id, owner: bytesToHex(own), spent, created }
}

/**
 * La lista de UTXOs de un nodo, corregida con las notas de esa dirección. PURO.
 *
 * «El nodo no ha visto la tx» necesita una prueba: que siga listando algo que ella gasta. Con
 * dos envíos seguidos, el segundo gasta el cambio del primero, que un nodo atrasado nunca
 * listó; por eso la prueba se hereda (gasta la salida de otra tx que el nodo tampoco ha visto)
 * y se repite hasta que no cambia nada.
 */
export const applyPendingSpends = (utxos: Utxo[], notes: PendingBtcSpend[]): Utxo[] => {
	if (notes.length === 0) return utxos
	const listed = new Set(utxos.map(outpointKey))
	const spent = new Set<string>()
	for (const note of notes) for (const outpoint of note.spent) spent.add(outpointKey(outpoint))

	const unseen = new Set<string>()
	const unseenOutputs = new Set<string>()
	let grew = true
	while (grew) {
		grew = false
		for (const note of notes) {
			if (unseen.has(note.txid)) continue
			if (!note.spent.some(outpoint => listed.has(outpointKey(outpoint)) || unseenOutputs.has(outpointKey(outpoint)))) continue
			unseen.add(note.txid)
			for (const output of note.created) unseenOutputs.add(outpointKey({ txid: note.txid, vout: output.vout }))
			grew = true
		}
	}

	const spendable = utxos.filter(utxo => !spent.has(outpointKey(utxo)))
	for (const note of notes) {
		if (!unseen.has(note.txid)) continue
		for (const output of note.created) {
			const key = outpointKey({ txid: note.txid, vout: output.vout })
			if (spent.has(key) || listed.has(key)) continue
			spendable.push({ txid: note.txid, vout: output.vout, value: output.value, confirmed: false })
		}
	}
	return spendable
}

export type PendingBtcSpends = {
	/** Anota una tx firmada que un nodo aceptó. Lanza si los bytes no son una tx o la dirección no vale. */
	record: (hex: string, address: string) => void
	/** La lista de UTXOs de un nodo para esa dirección, corregida con sus notas vigentes. */
	apply: (address: string, utxos: Utxo[]) => Utxo[]
	/** Notas vigentes. */
	list: () => PendingBtcSpend[]
	clear: () => void
}

export const createPendingBtcSpends = ({ now = Date.now, ttlMs = PENDING_SPEND_TTL_MS }: { now?: () => number, ttlMs?: number } = {}): PendingBtcSpends => {
	const notes = new Map<string, PendingBtcSpend>()
	// Por distancia y no por «más vieja que»: un reloj que el usuario atrasa no alarga una nota
	const prune = (): void => {
		const at = now()
		for (const [txid, note] of notes) if (Math.abs(at - note.at) >= ttlMs) notes.delete(txid)
	}
	return {
		record: (hex, address) => {
			prune()
			const spend = readSignedBtcSpend(hex, address)
			// La misma tx aceptada otra vez (una re-difusión) renueva su nota
			notes.delete(spend.txid)
			notes.set(spend.txid, { ...spend, at: now() })
			for (const txid of notes.keys()) {
				if (notes.size <= MAX_NOTES) break
				notes.delete(txid)
			}
		},
		apply: (address, utxos) => {
			prune()
			const own = scriptOf(address)
			if (!own || notes.size === 0) return utxos
			const owner = bytesToHex(own)
			return applyPendingSpends(utxos, [...notes.values()].filter(note => note.owner === owner))
		},
		list: () => { prune(); return [...notes.values()] },
		clear: () => notes.clear(),
	}
}

/** Las notas de esta sesión de la app. */
export const pendingBtcSpends = createPendingBtcSpends()
