/**
 * Historial on-chain en DISCO (AsyncStorage), un registro por activo y
 * dirección. Es lo que hace que la actividad pinte al instante y que cada
 * sincronización pida solo lo nuevo (ver wallet/historyMerge.ts).
 *
 * Decisión (2026-09-14, relaja la regla 5 del plan para el historial): el
 * historial es público en la cadena y las direcciones ya viven en disco
 * (`@qpwallet:meta`), así que guardarlo no expone nada nuevo. Los saldos
 * siguen sin persistir. Eliminar la wallet borra estas claves.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import { emptyHistoryCache } from '../../../wallet/historyMerge'
import type { HistoryCache } from '../../../wallet/historyMerge'

const PREFIX = '@qpwallet:history:'

/**
 * Versión del formato por activo. Subirla obliga a resincronizar ese historial desde cero
 * (la sincronización por ancla solo pide lo NUEVO y jamás volvería a ver lo ya descartado):
 * - tron:native v2 (2026-09-30): el servidor ahora manda congelar/votar/cobrar (`staking=1`).
 */
const VERSIONS: Record<string, string> = { 'tron:native': 'v2' }

const keyFor = (assetId: string, address: string): string => `${PREFIX}${VERSIONS[assetId] ? `${VERSIONS[assetId]}:` : ''}${assetId}:${address}`
const legacyKeyFor = (assetId: string, address: string): string => `${PREFIX}${assetId}:${address}`

export const loadHistoryCache = async (assetId: string, address: string): Promise<HistoryCache> => {
	try {
		const raw = await AsyncStorage.getItem(keyFor(assetId, address))
		if (!raw) {
			// Primera lectura tras subir de versión: la copia vieja ya no vale, se borra
			if (VERSIONS[assetId]) AsyncStorage.removeItem(legacyKeyFor(assetId, address)).catch(() => {})
			return emptyHistoryCache()
		}
		const parsed = JSON.parse(raw) as Partial<HistoryCache>
		if (!Array.isArray(parsed.items)) return emptyHistoryCache()
		return { items: parsed.items, olderCursor: parsed.olderCursor ?? null, complete: !!parsed.complete, updatedAt: parsed.updatedAt ?? 0 }
	} catch {
		return emptyHistoryCache()
	}
}

export const saveHistoryCache = async (assetId: string, address: string, cache: HistoryCache): Promise<void> => {
	try { await AsyncStorage.setItem(keyFor(assetId, address), JSON.stringify(cache)) } catch { /* sin disco: la sesión sigue en memoria */ }
}

/** Borra TODO el historial guardado (flujo "Eliminar wallet"). */
export const clearHistoryCaches = async (): Promise<void> => {
	try {
		const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PREFIX))
		await Promise.all(keys.map(key => AsyncStorage.removeItem(key)))
	} catch { /* best-effort */ }
}
