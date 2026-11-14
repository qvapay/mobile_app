/**
 * Registro remoto de RPCs con fallback empaquetado.
 *
 * Fuente de verdad: repo qvapay/rpc-registry vía raw.githubusercontent.com
 * (el espejo rpc.qvapay.com está pendiente de montar). TTL 1h — un flip de `enabled` en un commit llega
 * a todos los clientes en su próximo refresh sin publicar versión. Si la red
 * falla o el payload no valida, gana `bundled.json` (o el último remoto bueno,
 * que React Query conserva y persiste a disco: el registro no es secreto).
 *
 * Lo remoto NO se usa tal cual: pasa por `pinRegistry` (./pins), que deja del
 * remoto solo la lista de nodos de cada red y toma todo lo demás (contratos,
 * decimales, chainId, nativo, explorador, staking) del empaquetado. Se aplica al
 * LEER (`select`), no al descargar, para que también cubra lo que ya estaba
 * guardado en disco.
 */
import { useQuery } from '@tanstack/react-query'

import bundledJson from './bundled.json'
import { pinRegistry } from './pins'
import type { RpcRegistry } from './types'

/**
 * Solo GitHub raw por ahora. El espejo `https://rpc.qvapay.com/registry.json`
 * queda para más adelante: mientras no exista, tenerlo delante costaba el
 * timeout completo (5s) en cada refresh antes de caer a la fuente que sí
 * responde. Cuando se monte, va PRIMERO en este array.
 */
const REGISTRY_URLS = [
	'https://raw.githubusercontent.com/qvapay/rpc-registry/main/registry.json',
]

const FETCH_TIMEOUT_MS = 5_000

export const REGISTRY_QUERY_KEY = ['wallet', 'registry']

export const bundledRegistry = bundledJson as RpcRegistry

/** Validación defensiva: un JSON truncado o un MITM torpe no deben tumbar la wallet. */
export const isValidRegistry = (value: unknown): value is RpcRegistry => {
	if (!value || typeof value !== 'object') return false
	const reg = value as RpcRegistry
	if (typeof reg.version !== 'number' || !reg.chains || typeof reg.chains !== 'object') return false
	const chains = Object.values(reg.chains)
	if (chains.length === 0) return false
	return chains.every(chain =>
		chain && typeof chain === 'object'
		&& ['evm', 'tron', 'btc', 'stacks', 'solana'].includes(chain.kind)
		&& Array.isArray(chain.rpcs)
		&& chain.rpcs.every(rpc => typeof rpc?.url === 'string' && rpc.url.startsWith('https://') && typeof rpc.priority === 'number'),
	)
}

const fetchRemoteRegistry = async (): Promise<RpcRegistry> => {
	let lastError: unknown = null
	for (const url of REGISTRY_URLS) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
		try {
			const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
			if (!res.ok) { lastError = new Error(`registry ${url}: HTTP ${res.status}`); continue }
			const json: unknown = await res.json()
			if (isValidRegistry(json)) return json
			lastError = new Error(`registry ${url}: payload inválido`)
		} catch (err) {
			lastError = err
		} finally {
			clearTimeout(timer)
		}
	}
	throw lastError ?? new Error('registry: sin fuentes')
}

/**
 * Registro efectivo para la UI/adapters. Del remoto solo salen los nodos
 * (`pinRegistry`), y solo si su `version` no es más vieja que la empaquetada (un
 * espejo rancio no debe degradar una app recién publicada con un bundled más
 * nuevo). Acepta cualquier cosa y nunca lanza: lo que no tenga forma de
 * registro es el empaquetado.
 */
export const resolveRegistry = (remote: unknown): RpcRegistry => {
	const pinned = pinRegistry(remote, bundledRegistry)
	return pinned && pinned.version >= bundledRegistry.version ? pinned : bundledRegistry
}

export const useRegistry = (): RpcRegistry => {
	const { data } = useQuery({
		queryKey: REGISTRY_QUERY_KEY,
		queryFn: fetchRemoteRegistry,
		staleTime: 60 * 60 * 1000,
		retry: 1,
		// `select` y no un cálculo en cada render: el resultado conserva su identidad
		// mientras no cambie lo descargado, y de ella cuelgan el router y los catálogos
		select: resolveRegistry,
	})
	return data ?? bundledRegistry
}
