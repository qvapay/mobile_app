/**
 * Instancia única del rpcRouter para la app, con su salud persistida en
 * AsyncStorage (`@qpwallet:rpc-health`, fuera de React Query a propósito) y
 * un canal de suscripción para la pantalla de Ajustes → Nodos.
 *
 * Este es el ÚNICO archivo de wallet/registry que toca almacenamiento de la
 * app; el router en sí (rpcRouter.ts) queda puro y testeable en node.
 */
import { useEffect, useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { useSettings } from '../../settings/SettingsContext'
import { applyCustomRpcs } from './customRpcs'
import type { CustomRpcMap } from './customRpcs'
import { createRpcRouter } from './rpcRouter'
import type { HealthMap, RpcRouter } from './rpcRouter'
import { bundledRegistry, useRegistry } from './useRegistry'
import type { RpcRegistry } from './types'

export const RPC_HEALTH_STORAGE_KEY = '@qpwallet:rpc-health'

let currentRegistry: RpcRegistry = bundledRegistry
let router: RpcRouter | null = null
const listeners = new Set<(health: HealthMap) => void>()

/** La capa React (useRegistry) vuelca aquí el registro efectivo en cada cambio. */
export const setCurrentRegistry = (registry: RpcRegistry): void => {
	currentRegistry = registry
}

const persistHealth = (health: HealthMap): void => {
	AsyncStorage.setItem(RPC_HEALTH_STORAGE_KEY, JSON.stringify(health)).catch(() => {})
	listeners.forEach(listener => listener(health))
}

export const getAppRpcRouter = (): RpcRouter => {
	if (!router) {
		router = createRpcRouter(() => currentRegistry, { onHealthChange: persistHealth })
		// Hidratación best-effort: la salud es solo un sesgo de arranque, si el
		// read llega tarde o falla el router ya funciona con el registro solo.
		AsyncStorage.getItem(RPC_HEALTH_STORAGE_KEY)
			.then(raw => { if (raw && router) router.seedHealth(JSON.parse(raw) as HealthMap) })
			.catch(() => {})
	}
	return router
}

/** Suscripción para la pantalla Nodos; devuelve el unsubscribe. */
export const subscribeRpcHealth = (listener: (health: HealthMap) => void): (() => void) => {
	listeners.add(listener)
	return () => { listeners.delete(listener) }
}

const NO_CUSTOM: CustomRpcMap = {}

/**
 * Registro EFECTIVO: remoto (o bundled) con los nodos del usuario
 * (`crypto.customRpcs` en SettingsContext) delante de cada cadena. Es lo que
 * ven el router y la pantalla Nodos — nunca consumir `useRegistry` a pelo
 * desde UI, o los nodos custom desaparecerían de la lista.
 */
export const useEffectiveRegistry = (): RpcRegistry => {
	const registry = useRegistry()
	const { getSetting } = useSettings()
	const custom = getSetting('crypto', 'customRpcs', NO_CUSTOM) as CustomRpcMap
	return useMemo(() => applyCustomRpcs(registry, custom), [registry, custom])
}

/**
 * Router listo para componentes: sigue el registro efectivo (remoto o
 * bundled + nodos del usuario) en cada cambio. La identidad del router es
 * estable de por vida. Debe montarlo alguien vivo toda la sesión
 * (WalletProvider): sin ese enganche el singleton se quedaría con el bundled.
 */
export const useAppRpcRouter = (): RpcRouter => {
	const registry = useEffectiveRegistry()
	useEffect(() => { setCurrentRegistry(registry) }, [registry])
	return getAppRpcRouter()
}
