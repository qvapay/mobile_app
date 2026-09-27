/**
 * El depósito que YA se envió, en DISCO.
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
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@qpexchange:deposit'

/** Pasado esto la nota sobra: o la orden avanzó, o caducó su ventana de depósito (6 h). */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export type SentDeposit = { uuid: string, txid: string, at: number }

type Store = Record<string, { txid: string, at: number }>

const readStore = async (): Promise<Store> => {
	try {
		const raw = await AsyncStorage.getItem(KEY)
		const parsed = raw ? JSON.parse(raw) as Store : {}
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch { return {} }
}

const writeStore = async (store: Store): Promise<void> => {
	try { await AsyncStorage.setItem(KEY, JSON.stringify(store)) } catch { /* disco lleno: se pierde la nota, no el envío */ }
}

/** Quita lo viejo en cada escritura: sin esto la nota crece para siempre. */
const prune = (store: Store): Store => {
	const now = Date.now()
	return Object.fromEntries(Object.entries(store).filter(([, v]) => v && now - v.at < MAX_AGE_MS))
}

export const markDepositSent = async (uuid: string, txid: string): Promise<void> => {
	if (!uuid || !txid) { return }
	const store = prune(await readStore())
	store[uuid] = { txid, at: Date.now() }
	await writeStore(store)
}

export const readDepositSent = async (uuid: string): Promise<SentDeposit | null> => {
	if (!uuid) { return null }
	const entry = (await readStore())[uuid]
	if (!entry?.txid || typeof entry.at !== 'number') { return null }
	if (Date.now() - entry.at > MAX_AGE_MS) { return null }
	return { uuid, txid: entry.txid, at: entry.at }
}

export const clearDepositSent = async (uuid: string): Promise<void> => {
	if (!uuid) { return }
	const store = await readStore()
	if (!(uuid in store)) { return }
	delete store[uuid]
	await writeStore(prune(store))
}
