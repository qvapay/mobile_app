/**
 * Lo mínimo para volver a preguntar a la cadena por un envío MÁS TARDE, sin la tx ni su
 * firma. PURO.
 *
 * Cabe en disco (solo strings y números) y no lleva nada secreto: el hash o la firma del
 * envío y lo que cada cadena necesita para decir «ya no entrará» (el nonce, los inputs, la
 * vigencia). Con él, una nota de «quizá salió» se puede aclarar después de salir de la
 * pantalla que lo firmó, cuando la tx y su firma ya no existen en memoria.
 *
 * Lo que vuelve del disco pasa por `parseSentRef`: una referencia que no tenga la forma
 * exacta no se usa (la pregunta se queda en «no se sabe», que nunca deja firmar otra).
 */

export type SentRef =
	| { kind: 'tron', chainKey: string, rawHex: string }
	| { kind: 'evm', chainKey: string, hash: string, from: string, nonce: number }
	| { kind: 'btc', chainKey: string, txid: string, inputs: { txid: string, vout: number }[] }
	/** `nonce` en decimal: un bigint no cabe en JSON. */
	| { kind: 'stacks', chainKey: string, txid: string, from: string, nonce: string }
	| { kind: 'solana', chainKey: string, signature: string, owner: string, lastValidBlockHeight: number, blockhashSlot: number | null }
	/** Patrocinada: su id es la firma del pagador, que no se tiene. `message`: lo firmado, en base64. */
	| { kind: 'solana-sponsored', chainKey: string, owner: string, message: string, lastValidBlockHeight: number, blockhashSlot: number | null }

const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const slot = (value: unknown): value is number | null => value === null || count(value)

/** Tope de inputs de una tx de Bitcoin de la wallet (`MAX_INPUTS` de wallet/btc/tx). */
const MAX_INPUTS = 40
/** Un raw de TRON o un mensaje de Solana caben de sobra; más que esto no es uno de los nuestros. */
const MAX_PAYLOAD = 8_000

/** La referencia leída del disco, o null si no tiene la forma exacta de una. */
export const parseSentRef = (raw: unknown): SentRef | null => {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
	const ref = raw as Record<string, unknown>
	if (!text(ref.chainKey, 40)) return null
	const chainKey = ref.chainKey
	switch (ref.kind) {
		case 'tron':
			return text(ref.rawHex, MAX_PAYLOAD) && /^[0-9a-f]+$/i.test(ref.rawHex) ? { kind: 'tron', chainKey, rawHex: ref.rawHex } : null
		case 'evm':
			return text(ref.hash) && /^0x[0-9a-f]{64}$/i.test(ref.hash) && text(ref.from) && /^0x[0-9a-f]{40}$/i.test(ref.from) && count(ref.nonce)
				? { kind: 'evm', chainKey, hash: ref.hash, from: ref.from, nonce: ref.nonce }
				: null
		case 'btc': {
			if (!text(ref.txid) || !/^[0-9a-f]{64}$/i.test(ref.txid) || !Array.isArray(ref.inputs) || ref.inputs.length > MAX_INPUTS) return null
			const inputs: { txid: string, vout: number }[] = []
			for (const input of ref.inputs as unknown[]) {
				const item = input as { txid?: unknown, vout?: unknown } | null
				if (!item || typeof item !== 'object' || !text(item.txid) || !/^[0-9a-f]{64}$/i.test(item.txid) || !count(item.vout)) return null
				inputs.push({ txid: item.txid, vout: item.vout })
			}
			return { kind: 'btc', chainKey, txid: ref.txid, inputs }
		}
		case 'stacks':
			return text(ref.txid) && /^(0x)?[0-9a-f]{64}$/i.test(ref.txid) && text(ref.from) && text(ref.nonce, 20) && /^\d+$/.test(ref.nonce)
				? { kind: 'stacks', chainKey, txid: ref.txid, from: ref.from, nonce: ref.nonce }
				: null
		case 'solana':
			return text(ref.signature) && text(ref.owner) && count(ref.lastValidBlockHeight) && slot(ref.blockhashSlot)
				? { kind: 'solana', chainKey, signature: ref.signature, owner: ref.owner, lastValidBlockHeight: ref.lastValidBlockHeight, blockhashSlot: ref.blockhashSlot }
				: null
		case 'solana-sponsored':
			return text(ref.owner) && text(ref.message, MAX_PAYLOAD) && count(ref.lastValidBlockHeight) && slot(ref.blockhashSlot)
				? { kind: 'solana-sponsored', chainKey, owner: ref.owner, message: ref.message, lastValidBlockHeight: ref.lastValidBlockHeight, blockhashSlot: ref.blockhashSlot }
				: null
		default:
			return null
	}
}
