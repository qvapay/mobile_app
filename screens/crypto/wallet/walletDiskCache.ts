/**
 * Última foto en DISCO de las queries on-chain de la wallet (saldos y
 * posiciones de staking), para que un arranque en frío pinte al instante en
 * vez de un skeleton hasta que responda la cadena más lenta.
 *
 * Decisión (2026-10-02, relaja la regla 5 del plan también para saldos y
 * staking, como ya se hizo con el historial el 2026-09-14): son datos públicos
 * en la cadena para quien tenga la dirección, y las direcciones ya viven en
 * disco (`@qpwallet:meta`). Va FUERA del persister de React Query a propósito:
 * esas queries siguen con `meta.noPersist` y llevan bigint, que su serializer
 * no sabe escribir. "Eliminar wallet" borra estas claves.
 *
 * Un blob por wallet (clave por dirección EVM), con cada query guardada junto a
 * su `queryKey` completa: sembrar es un `setQueryData` por entrada, sin
 * duplicar aquí cómo se construyen las claves.
 */
import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { decodeDiskJson, encodeDiskJson } from '../../../wallet/diskJson'

const PREFIX = '@qpwallet:snapshot:'
const VERSION = 'v1'

type Entry = { key: QueryKey, data: unknown, updatedAt: number }
type Snapshot = Record<string, Entry>

const storageKey = (evm: string): string => `${PREFIX}${VERSION}:${evm}`

// Espejo en memoria por wallet + cola de escrituras: saldos y staking guardan
// por su cuenta y un leer-modificar-escribir concurrente se pisaría
const mirrors = new Map<string, Snapshot>()
const loads = new Map<string, Promise<Snapshot>>()
let writeChain: Promise<void> = Promise.resolve()
// Sube al eliminar la wallet: un guardado en vuelo de antes no debe resucitar la foto
let generation = 0

const loadSnapshot = (evm: string): Promise<Snapshot> => {
	let pending = loads.get(evm)
	if (!pending) {
		pending = AsyncStorage.getItem(storageKey(evm))
			.then(raw => (raw ? decodeDiskJson<Snapshot>(raw) : {}))
			.catch(() => ({}))
			.then(snapshot => {
				mirrors.set(evm, { ...snapshot, ...mirrors.get(evm) })
				return mirrors.get(evm) as Snapshot
			})
		loads.set(evm, pending)
	}
	return pending
}

/**
 * Guarda el resultado de una query on-chain recién resuelta. Best-effort: sin
 * disco la sesión sigue en memoria.
 */
export const saveWalletQuery = (evm: string | null | undefined, key: QueryKey, data: unknown): void => {
	if (!evm || data == null) return
	const gen = generation
	const mirror = mirrors.get(evm) ?? {}
	mirror[JSON.stringify(key)] = { key, data, updatedAt: Date.now() }
	mirrors.set(evm, mirror)
	writeChain = writeChain
		.then(() => (gen === generation ? AsyncStorage.setItem(storageKey(evm), encodeDiskJson(mirror)) : undefined))
		.catch(() => { /* sin disco: solo memoria */ })
}

/**
 * Siembra en React Query lo guardado de esta wallet, sin pisar nada que ya
 * esté en memoria. `updatedAt` es el de la foto, así que la query nace vieja y
 * se revalida al montar: se pinta lo de disco y se refresca por detrás.
 */
export const primeWalletQueries = async (queryClient: QueryClient, evm: string): Promise<void> => {
	const snapshot = await loadSnapshot(evm)
	for (const entry of Object.values(snapshot)) {
		// Una query creada por setQueryData no lleva las opciones del hook: sin
		// estos defaults nacería persistible y el persister intentaría escribir
		// (sin cifrar y con bigint) justo lo que estas queries excluyen
		queryClient.setQueryDefaults(entry.key.slice(0, 2), { meta: { noPersist: true } })
		if (queryClient.getQueryData(entry.key) === undefined) {
			queryClient.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt })
		}
	}
}

/**
 * true cuando la foto de disco ya está sembrada (o no hay wallet). Las queries
 * on-chain esperan a esto antes de pedir a la cadena, y la home de la wallet
 * antes de pintarse, para no enseñar un skeleton que dura un frame.
 */
export const useWalletQueriesPrimed = (queryClient: QueryClient, evm: string | null | undefined): boolean => {
	const [primedFor, setPrimedFor] = useState<string | null>(() => (evm && loads.has(evm) && mirrors.has(evm) ? evm : null))
	useEffect(() => {
		if (!evm || primedFor === evm) return
		let cancelled = false
		primeWalletQueries(queryClient, evm).finally(() => { if (!cancelled) setPrimedFor(evm) })
		return () => { cancelled = true }
	}, [queryClient, evm, primedFor])
	return !evm || primedFor === evm
}

/** Borra TODAS las fotos guardadas (flujo "Eliminar wallet"). */
export const clearWalletSnapshots = async (): Promise<void> => {
	generation++
	mirrors.clear()
	loads.clear()
	// En la cola de escrituras: lo ya encolado termina antes y el borrado gana
	writeChain = writeChain.then(async () => {
		const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PREFIX))
		await Promise.all(keys.map(key => AsyncStorage.removeItem(key)))
	}).catch(() => { /* best-effort */ })
	await writeChain
}
