/**
 * El depósito que YA salió (o pudo salir) hacia la red, en DISCO.
 *
 * El proveedor tarda en ver una transferencia (minuto y medio en el caso real que lo
 * destapó), así que entre difundir el envío y que la orden pase de `awaiting_deposit` hay
 * una ventana en la que el backend sigue diciendo "esperando tu envío". La pantalla de
 * seguimiento se lo creía y volvía a ofrecer la dirección y el botón de enviar —justo
 * después de haber enviado—, que es la peor cosa que puede hacer: el proveedor espera UN
 * importe exacto, y un segundo envío no se cambia, se queda esperando una devolución manual.
 *
 * Va a disco y no a memoria porque esa ventana sobrevive a salir de la pantalla, a cambiar
 * de app y a un reinicio. Guarda el hash, que además es la prueba que el usuario quiere ver
 * mientras espera.
 *
 * La nota se escribe ANTES de difundir (`markDepositAttempt`, con el hash calculado en el
 * teléfono), no al confirmarse: si la respuesta de la difusión se pierde, el envío pudo
 * entrar igual, y sin nota una pantalla nueva construía otro. Queda como `pending` hasta que
 * la difusión contesta (`markDepositSent`) y se borra solo si consta que NO entró ni
 * entrará (`clearDepositSent`). Un `pending` que nunca se aclara bloquea reenviar a ESA
 * orden; lo seguro entonces es abrir otro intercambio, no mandar dos veces al mismo depósito.
 *
 * Para que sí se pueda aclarar después, la nota pendiente guarda una REFERENCIA al envío
 * (`ref`, ver `sentRef.ts`): con ella se pregunta a la cadena qué fue de él aunque la
 * pantalla que lo firmó ya no exista (`settleDepositNote` en `depositGuard.ts`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@qpexchange:deposit'

/**
 * La nota dura mucho más que la ventana de depósito del proveedor a propósito: una orden
 * puede quedarse «esperando» días, y si la nota caducaba antes (eran 12 h) el seguimiento
 * volvía a ofrecer enviar. Lo que acota el fichero es el número de notas.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_NOTES = 100

/**
 * `pending`: salió hacia la red y aún no consta que entrara. `txid` null: patrocinada, sin
 * hash hasta que el patrocinador firma. `ref`: con qué preguntar a la cadena por él, tal
 * como salió del disco (sin validar: quien lo use lo pasa por `parseSentRef`).
 */
export type SentDeposit = { uuid: string, txid: string | null, at: number, pending: boolean, ref: unknown }

type Entry = { txid: string | null, at: number, pending?: boolean, ref?: unknown }
type Store = Record<string, Entry>

const readStore = async ({ strict = false }: { strict?: boolean } = {}): Promise<Store> => {
	try {
		const raw = await AsyncStorage.getItem(KEY)
		const parsed = raw ? JSON.parse(raw) as Store : {}
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch (error) {
		if (strict) throw error
		return {}
	}
}

const writeStore = async (store: Store): Promise<void> => {
	try { await AsyncStorage.setItem(KEY, JSON.stringify(store)) } catch { /* disco lleno: se pierde la nota, no el envío */ }
}

/** Quita lo viejo y lo que sobra en cada escritura: sin esto la nota crece para siempre. */
const prune = (store: Store): Store => {
	const now = Date.now()
	const fresh = Object.entries(store).filter(([, v]) => v && typeof v.at === 'number' && now - v.at < MAX_AGE_MS)
	return Object.fromEntries(fresh.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_NOTES))
}

/**
 * El depósito va a salir hacia la red. No rebaja una nota que ya consta como enviada.
 *
 * @param ref - Con qué preguntar después a la cadena por este envío (`sentRefOf`).
 */
export const markDepositAttempt = async (uuid: string, txid: string | null, ref: unknown = null): Promise<void> => {
	if (!uuid) { return }
	const store = prune(await readStore())
	if (store[uuid] && !store[uuid].pending) { return }
	store[uuid] = { txid: txid || null, at: Date.now(), pending: true, ...(ref ? { ref } : {}) }
	await writeStore(prune(store))
}

/** La red aceptó el depósito. */
export const markDepositSent = async (uuid: string, txid: string): Promise<void> => {
	if (!uuid || !txid) { return }
	const store = await readStore()
	store[uuid] = { txid, at: Date.now() }
	await writeStore(prune(store))
}

/**
 * @param strict - Lanza si el disco no se deja leer. Lo usa la guarda de antes de firmar:
 *   «no pude leer la nota» no es «no hay nota».
 */
export const readDepositSent = async (uuid: string, { strict = false }: { strict?: boolean } = {}): Promise<SentDeposit | null> => {
	if (!uuid) { return null }
	const entry = (await readStore({ strict }))[uuid]
	if (!entry || typeof entry.at !== 'number') { return null }
	if (Date.now() - entry.at > MAX_AGE_MS) { return null }
	return { uuid, txid: entry.txid || null, at: entry.at, pending: entry.pending === true, ref: entry.ref ?? null }
}

/** La orden avanzó, o consta que el envío NO entró ni entrará. */
export const clearDepositSent = async (uuid: string): Promise<void> => {
	if (!uuid) { return }
	const store = await readStore()
	if (!(uuid in store)) { return }
	delete store[uuid]
	await writeStore(prune(store))
}
