/**
 * Lo que quedó a medias de un alquiler de energía, en DISCO y POR USUARIO.
 *
 * Dos casillas, porque son dos momentos en los que cerrar la app invita a pagar dos veces:
 *
 * - `attempt`: una compra que SALE hacia el servidor. Se escribe ANTES de mandarla, con su
 *   clave de idempotencia y su pedido. Si la app muere con la petición en vuelo (o la
 *   respuesta se pierde), la sesión siguiente repite ese pedido con ESA clave, que el
 *   servidor contesta con la orden que ya hubiera, y no con una nueva, que cobraría otra.
 * - `order`: un `202`. El saldo YA se cobró y la entrega sigue en curso. Sin esta nota el
 *   usuario vuelve, no ve energía, no sabe si pagó y compra otra vez.
 *
 * La clave del disco lleva el uuid de la cuenta: el alquiler se cobra del saldo QvaPay, y
 * con una sola nota global la de una cuenta la leía la siguiente que entrara en el teléfono.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import { parsePendingEnergy } from './energyRentMachine'
import type { PendingEnergy, PendingEnergyAttempt } from './energyRentMachine'

export type { PendingEnergy, PendingEnergyAttempt, PendingEnergyOrder } from './energyRentMachine'

/** La nota global de las versiones anteriores a la 3.16.3: `{ uuid, at }`, sin dueño. */
const LEGACY_KEY = '@qpenergy:pending'
const keyFor = (userKey: string) => `${LEGACY_KEY}:${userKey}`

const EMPTY: PendingEnergy = { order: null, attempt: null }

const write = async (userKey: string, note: PendingEnergy): Promise<void> => {
	try {
		if (!note.order && !note.attempt) { await AsyncStorage.removeItem(keyFor(userKey)) }
		else { await AsyncStorage.setItem(keyFor(userKey), JSON.stringify(note)) }
	} catch { /* disco lleno: se pierde la nota, no la orden */ }
}

/**
 * Lo pendiente de esa cuenta; lo caducado no cuenta. La nota global de una versión anterior
 * se adopta una vez para quien esté dentro (casi siempre es suya; si no, su orden no
 * existe para esta cuenta y `WalletEnergy` la retira al consultarla).
 */
export const readPendingEnergy = async (userKey: string | null | undefined): Promise<PendingEnergy> => {
	if (!userKey) { return EMPTY }
	try {
		const own = parsePendingEnergy(await AsyncStorage.getItem(keyFor(userKey)), Date.now())
		if (own.order || own.attempt) { return own }
		const legacy = parsePendingEnergy(await AsyncStorage.getItem(LEGACY_KEY), Date.now())
		await AsyncStorage.removeItem(LEGACY_KEY)
		if (legacy.order) { await write(userKey, legacy) }
		return legacy
	} catch { return EMPTY }
}

/** Un cambio a una casilla sin tocar la otra. Las escrituras de una cuenta van en fila. */
let queue: Promise<void> = Promise.resolve()
const update = (userKey: string | null | undefined, change: (note: PendingEnergy) => PendingEnergy): Promise<void> => {
	if (!userKey) { return Promise.resolve() }
	queue = queue.then(async () => write(userKey, change(await readPendingEnergy(userKey)))).catch(() => { })
	return queue
}

/** La compra que va a salir. Se ESPERA antes de mandarla. */
export const savePendingAttempt = (userKey: string | null | undefined, attempt: Omit<PendingEnergyAttempt, 'at'> & { at: number }): Promise<void> =>
	update(userKey, note => ({ ...note, attempt }))

/** Esa compra ya tiene desenlace (o consta que no dejó nada cobrado). */
export const clearPendingAttempt = (userKey: string | null | undefined): Promise<void> =>
	update(userKey, note => ({ ...note, attempt: null }))

/** Cobrada y sin entregar todavía. Con la orden conocida, el intento deja de estar en duda. */
export const savePendingOrder = (userKey: string | null | undefined, uuid: string): Promise<void> =>
	update(userKey, () => ({ order: { uuid, at: Date.now() }, attempt: null }))

export const clearPendingOrder = (userKey: string | null | undefined): Promise<void> =>
	update(userKey, note => ({ ...note, order: null }))
