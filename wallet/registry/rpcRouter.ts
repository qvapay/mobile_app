/**
 * Router de RPCs: decide contra qué endpoint habla cada cadena y rota en
 * fallos de red. Es el corazón del plan "registry remoto": cuando un nodo
 * propio (`owner: qvapay`, priority 0) pasa a `enabled: true` en el registro,
 * gana aquí sin publicar versión nueva.
 *
 * Módulo puro a propósito (cero imports de react-native): el estado de salud
 * se inyecta/emite vía deps para que la persistencia (AsyncStorage
 * `@qpwallet:rpc-health`) viva en la capa React y los tests corran en node.
 */
import type { RegistryChain, RegistryRpc, RpcRegistry } from './types'

export type RpcHealth = {
	ok: boolean
	/** null = nunca medida. */
	latencyMs: number | null
	checkedAt: number
	/** Fallos consecutivos (éxito o probe OK la resetea). */
	failures: number
	lastFailureAt: number
}

/** Salud por URL de RPC (las URLs son únicas entre cadenas). */
export type HealthMap = Record<string, RpcHealth>

export const MAX_FAILURES = 3
/** Ventana del circuit breaker: pasado esto desde el último fallo, se reabre solo. */
export const BREAKER_REOPEN_MS = 2 * 60_000
export const CALL_TIMEOUT_MS = 8_000
export const PROBE_TIMEOUT_MS = 3_000
/** Máximo de RPCs distintos que intenta una misma llamada. */
export const MAX_ATTEMPTS = 3

/** Todos los candidatos de la cadena fallaron (o no hay ninguno habilitado). */
export class AllRpcsFailedError extends Error {
	errors: unknown[]
	constructor(chainKey: string, errors: unknown[]) {
		super(`rpcRouter: sin RPC utilizable para ${chainKey} (${errors.length} intentos)`)
		this.name = 'AllRpcsFailedError'
		this.errors = errors
	}
}

/**
 * Un error rota de RPC solo si huele a infraestructura: red caída, timeout
 * (AbortError), 5xx o `retryable: true` explícito del adapter. Los errores de
 * negocio (fondos insuficientes, nonce, revert) NO rotan: son iguales en
 * cualquier endpoint y reintentarlos podría duplicar un broadcast.
 */
export const isRetryableRpcError = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false
	const e = err as { name?: string, retryable?: boolean, status?: number }
	if (e.retryable === true) return true
	if (e.retryable === false) return false
	if (e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'TypeError') return true
	return typeof e.status === 'number' && e.status >= 500
}

export type ProbeRequest = (
	chainKey: string,
	chain: RegistryChain,
	rpc: RegistryRpc,
	timeoutMs: number,
) => Promise<void>

/**
 * Ping mínimo por dialecto; lanza si el endpoint no responde algo sano.
 * Exportado para que la pantalla Nodos valide un nodo escrito a mano antes
 * de guardarlo (un nodo custom muerto no debe llegar al router).
 */
export const probeRpc: ProbeRequest = async (_chainKey, chain, rpc, timeoutMs) => {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		let res: Response
		if (chain.kind === 'btc' || rpc.api === 'esplora') {
			res = await fetch(`${rpc.url}/blocks/tip/height`, { signal: controller.signal, headers: rpc.headers })
		} else if (chain.kind === 'tron' && rpc.api !== 'jsonrpc') {
			res = await fetch(`${rpc.url}/wallet/getnowblock`, {
				method: 'POST',
				signal: controller.signal,
				headers: { 'Content-Type': 'application/json', ...rpc.headers },
			})
		} else {
			// Los nodos jsonrpc de TRON se registran ya con `/jsonrpc` (bundled v4):
			// añadirlo a ciegas probaba `/jsonrpc/jsonrpc` y los marcaba caídos
			const base = rpc.url.replace(/\/+$/, '')
			const url = chain.kind === 'tron' && !base.endsWith('/jsonrpc') ? `${base}/jsonrpc` : rpc.url
			res = await fetch(url, {
				method: 'POST',
				signal: controller.signal,
				headers: { 'Content-Type': 'application/json', ...rpc.headers },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
			})
		}
		if (!res.ok) {
			const err = new Error(`probe ${rpc.url}: HTTP ${res.status}`) as Error & { status: number }
			err.status = res.status
			throw err
		}
	} finally {
		clearTimeout(timer)
	}
}

type RouterDeps = {
	now?: () => number
	/** Salud precargada (AsyncStorage) para no arrancar a ciegas. */
	initialHealth?: HealthMap
	/** Notificación de cambios (la capa React persiste y refresca la pantalla Nodos). */
	onHealthChange?: (health: HealthMap) => void
	probeRequest?: ProbeRequest
}

export const createRpcRouter = (getRegistry: () => RpcRegistry, deps: RouterDeps = {}) => {
	const now = deps.now ?? Date.now
	const probeRequest = deps.probeRequest ?? probeRpc
	const health: HealthMap = { ...(deps.initialHealth ?? {}) }

	const emit = () => { deps.onHealthChange?.({ ...health }) }

	const markFailure = (url: string) => {
		const prev = health[url]
		health[url] = {
			ok: false,
			latencyMs: prev?.latencyMs ?? null,
			checkedAt: now(),
			failures: (prev?.failures ?? 0) + 1,
			lastFailureAt: now(),
		}
		emit()
	}

	const markSuccess = (url: string, latencyMs: number) => {
		health[url] = { ok: true, latencyMs, checkedAt: now(), failures: 0, lastFailureAt: health[url]?.lastFailureAt ?? 0 }
		emit()
	}

	const isBroken = (url: string): boolean => {
		const h = health[url]
		if (!h || h.failures < MAX_FAILURES) return false
		return now() - h.lastFailureAt < BREAKER_REOPEN_MS
	}

	/** Habilitados, por priority asc; a igual priority, latencia conocida asc (desconocida al final). */
	const orderedCandidates = (chain: RegistryChain): RegistryRpc[] =>
		chain.rpcs
			.filter(r => r.enabled !== false)
			.slice()
			.sort((a, b) => {
				if (a.priority !== b.priority) return a.priority - b.priority
				const la = health[a.url]?.ok ? health[a.url].latencyMs ?? Infinity : Infinity
				const lb = health[b.url]?.ok ? health[b.url].latencyMs ?? Infinity : Infinity
				return la - lb
			})

	const chainOf = (chainKey: string): RegistryChain => {
		const chain = getRegistry().chains[chainKey]
		if (!chain) throw new Error(`rpcRouter: cadena desconocida '${chainKey}'`)
		return chain
	}

	/**
	 * Mejor RPC ahora mismo. Si el breaker tiene a TODOS abiertos, devuelve el
	 * primero por prioridad igualmente: un candidato sospechoso es mejor que
	 * dejar la cadena sin servicio.
	 */
	const pickRpc = (chainKey: string): RegistryRpc | null => {
		const candidates = orderedCandidates(chainOf(chainKey))
		return candidates.find(r => !isBroken(r.url)) ?? candidates[0] ?? null
	}

	/**
	 * Ejecuta `fn` contra el mejor RPC, rotando (máx MAX_ATTEMPTS endpoints
	 * distintos) solo en errores de infraestructura. `fn` recibe un
	 * AbortSignal con timeout de 8s y DEBE pasarlo a su fetch. `accept`
	 * filtra candidatos por dialecto antes de elegir.
	 */
	const call = async <T>(
		chainKey: string,
		fn: (rpc: RegistryRpc, signal: AbortSignal) => Promise<T>,
		{ accept }: { accept?: (rpc: RegistryRpc) => boolean } = {},
	): Promise<T> => {
		// `accept` descarta dialectos que no sirven para esta llamada (p. ej. los
		// nodos jsonrpc de TRON no construyen ni difunden transacciones)
		const candidates = orderedCandidates(chainOf(chainKey)).filter(rpc => !accept || accept(rpc))
		const usable = candidates.filter(r => !isBroken(r.url))
		const queue = (usable.length > 0 ? usable : candidates).slice(0, MAX_ATTEMPTS)
		const errors: unknown[] = []

		for (const rpc of queue) {
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
			const started = now()
			try {
				const result = await fn(rpc, controller.signal)
				markSuccess(rpc.url, now() - started)
				return result
			} catch (err) {
				if (!isRetryableRpcError(err)) throw err
				markFailure(rpc.url)
				errors.push(err)
			} finally {
				clearTimeout(timer)
			}
		}
		throw new AllRpcsFailedError(chainKey, errors)
	}

	/**
	 * Mide TODOS los candidatos habilitados en paralelo (timeout 3s) y guarda
	 * su salud. Así, cuando un nodo qvapay pase a `enabled: true`, el próximo
	 * probe ya lo deja ganando por priority 0.
	 */
	const probe = async (chainKey?: string): Promise<void> => {
		const registry = getRegistry()
		const keys = chainKey ? [chainKey] : Object.keys(registry.chains)
		await Promise.all(keys.flatMap(key => {
			const chain = registry.chains[key]
			if (!chain) return []
			return chain.rpcs.filter(r => r.enabled !== false).map(async rpc => {
				const started = now()
				try {
					await probeRequest(key, chain, rpc, PROBE_TIMEOUT_MS)
					markSuccess(rpc.url, now() - started)
				} catch {
					markFailure(rpc.url)
				}
			})
		}))
	}

	const getHealth = (): HealthMap => ({ ...health })

	/**
	 * Hidrata salud persistida (AsyncStorage) sin pisar mediciones más
	 * frescas hechas mientras el read asíncrono estaba en vuelo.
	 */
	const seedHealth = (seed: HealthMap): void => {
		for (const [url, entry] of Object.entries(seed)) {
			const existing = health[url]
			if (!existing || existing.checkedAt < entry.checkedAt) health[url] = entry
		}
		emit()
	}

	return { pickRpc, call, probe, getHealth, seedHealth }
}

export type RpcRouter = ReturnType<typeof createRpcRouter>
