/**
 * Nodos RPC del usuario (Ajustes → Avanzado → Nodos → "Añadir nodo").
 *
 * Viven en SettingsContext (`crypto.customRpcs`, mapa chainKey → urls; no son
 * secreto) y se funden con el registro efectivo justo antes de entrar al
 * router: un nodo que el usuario escribió a mano gana a TODO lo del registro,
 * incluidos los propios de qvapay (priority 0). Módulo puro a propósito
 * (cero react-native): se testea en node.
 */
import type { RegistryRpc, RpcRegistry } from './types'

/** chainKey del registro → URLs https del usuario, en orden de alta. */
export type CustomRpcMap = Record<string, string[]>

export const CUSTOM_RPC_OWNER = 'user'
/** Por debajo del 0 reservado a qvapay: lo que el usuario configuró manda. */
export const CUSTOM_RPC_PRIORITY = -1
export const MAX_CUSTOM_RPCS_PER_CHAIN = 5

export type CustomRpcError = 'invalid' | 'insecure' | 'credentials' | 'duplicate' | 'limit'

/**
 * Limpia una URL escrita a mano: recorta espacios y la barra final. Devuelve
 * null si no parsea o si no es https (el registro y el validador remoto
 * exigen https; un nodo en claro filtraría a qué direcciones consulta la app).
 */
export const normalizeRpcUrl = (input: string): string | null => {
	const trimmed = input.trim()
	if (!trimmed) return null
	let parsed: URL
	try { parsed = new URL(trimmed) } catch { return null }
	if (parsed.protocol !== 'https:') return null
	if (parsed.username || parsed.password) return null
	if (parsed.hash) return null
	return parsed.toString().replace(/\/+$/, '')
}

/** Motivo por el que una URL no puede añadirse a la cadena, o null si vale. */
export const validateCustomRpc = (map: CustomRpcMap, chainKey: string, input: string): CustomRpcError | null => {
	const trimmed = input.trim()
	if (!trimmed) return 'invalid'
	let parsed: URL
	try { parsed = new URL(trimmed) } catch { return 'invalid' }
	if (parsed.protocol !== 'https:') return 'insecure'
	if (parsed.username || parsed.password) return 'credentials'
	const url = normalizeRpcUrl(trimmed)
	if (!url) return 'invalid'
	const existing = map[chainKey] ?? []
	if (existing.includes(url)) return 'duplicate'
	if (existing.length >= MAX_CUSTOM_RPCS_PER_CHAIN) return 'limit'
	return null
}

/** Nuevo mapa con la URL añadida (inmutable). Lanza si `validateCustomRpc` la rechaza. */
export const addCustomRpc = (map: CustomRpcMap, chainKey: string, input: string): CustomRpcMap => {
	const error = validateCustomRpc(map, chainKey, input)
	if (error) throw new Error(`customRpcs: ${error}`)
	const url = normalizeRpcUrl(input) as string
	return { ...map, [chainKey]: [...(map[chainKey] ?? []), url] }
}

/** Nuevo mapa sin la URL; la cadena desaparece del mapa si queda vacía. */
export const removeCustomRpc = (map: CustomRpcMap, chainKey: string, url: string): CustomRpcMap => {
	const rest = (map[chainKey] ?? []).filter(u => u !== url)
	const next = { ...map }
	if (rest.length > 0) next[chainKey] = rest
	else delete next[chainKey]
	return next
}

export const toCustomRpc = (url: string): RegistryRpc => ({
	url,
	priority: CUSTOM_RPC_PRIORITY,
	owner: CUSTOM_RPC_OWNER,
})

/**
 * Registro efectivo con los nodos del usuario delante de cada cadena. Si una
 * URL coincide con una del registro, la del registro se retira (la salud se
 * indexa por URL, así que comparten mediciones). Cadenas que el registro no
 * conoce se ignoran. Devuelve el MISMO objeto si no hay nada que aplicar,
 * para que los memos de la capa React no se disparen en vano.
 */
export const applyCustomRpcs = (registry: RpcRegistry, custom: CustomRpcMap | null | undefined): RpcRegistry => {
	if (!custom) return registry
	const entries = Object.entries(custom).filter(([key, urls]) => registry.chains[key] && Array.isArray(urls) && urls.length > 0)
	if (entries.length === 0) return registry
	const chains = { ...registry.chains }
	for (const [key, urls] of entries) {
		const chain = chains[key]
		const own = new Set(urls)
		chains[key] = {
			...chain,
			rpcs: [...urls.map(toCustomRpc), ...chain.rpcs.filter(r => !own.has(r.url))],
		}
	}
	return { ...registry, chains }
}
