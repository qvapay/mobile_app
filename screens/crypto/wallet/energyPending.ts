/**
 * La orden de energía que quedó a medias, en DISCO.
 *
 * Un `202` significa que el saldo YA se cobró y la entrega sigue en curso. Si
 * la app se cierra (o se cae) en esa ventana, sin esta nota el usuario vuelve,
 * no ve energía, no sabe si pagó y compra otra vez. Es lo único que se guarda
 * del módulo, y es exactamente lo que evita el doble cobro.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@qpenergy:pending'

/** Pasado esto la nota se considera caduca: la orden ya estará resuelta en el historial. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PendingEnergyOrder = { uuid: string, at: number }

export const savePendingOrder = async (uuid: string): Promise<void> => {
	try { await AsyncStorage.setItem(KEY, JSON.stringify({ uuid, at: Date.now() })) } catch { /* disco lleno: se pierde la nota, no la orden */ }
}

export const clearPendingOrder = async (): Promise<void> => {
	try { await AsyncStorage.removeItem(KEY) } catch { /* ignorado */ }
}

export const readPendingOrder = async (): Promise<PendingEnergyOrder | null> => {
	try {
		const raw = await AsyncStorage.getItem(KEY)
		if (!raw) { return null }
		const parsed = JSON.parse(raw) as PendingEnergyOrder
		if (!parsed?.uuid || typeof parsed.at !== 'number') { return null }
		if (Date.now() - parsed.at > MAX_AGE_MS) { await clearPendingOrder(); return null }
		return parsed
	} catch { return null }
}
