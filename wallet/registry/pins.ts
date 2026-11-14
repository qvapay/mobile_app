/**
 * Qué puede decidir el registro REMOTO y qué no. Módulo PURO.
 *
 * El registro remoto (`qvapay/rpc-registry` en GitHub) existe para una cosa: cambiar a qué
 * nodos se pregunta sin publicar versión. Pero el JSON trae también contratos, decimales,
 * `chainId`, nativo y explorador de cada red, y antes la app se lo creía todo: bastaba una
 * `version` más alta. Quien publicase en ese repo controlaba, en menos de una hora y en
 * todos los teléfonos:
 *
 * - el contrato de «USDT» (un token falso valorado a 1 USD por su símbolo),
 * - los decimales (en EVM y TRON, enviar 100× lo tecleado),
 * - el `chainId` (firmar para otra red),
 * - el explorador (un enlace a donde quisiera),
 * - a quién se delega el staking.
 *
 * Y un JSON mal formado (una cadena sin `native`, un token sin `symbol`) tumbaba el tab
 * Crypto y Depositar a todo el mundo, con y sin wallet.
 *
 * La regla ahora: **el registro EMPAQUETADO es el ancla**. De cada red que la app conoce,
 * todo sale del empaquetado (`bundled.json`, que se revisa y se publica con la app) y el
 * remoto solo aporta su lista de nodos, validada entrada a entrada. El remoto no añade
 * redes, ni tokens, ni toca el staking: eso es una versión nueva de la app. Lo mal formado
 * se descarta pieza a pieza; nada de lo que traiga puede hacer lanzar a quien lo consume.
 *
 * Lo que el remoto SÍ sigue pudiendo hacer es elegir los nodos, y un nodo puede mentir en
 * lo que lee (saldos, historial). No puede hacer firmar otra cosa: cada familia verifica la
 * transacción en el teléfono antes de firmar. Cerrar también eso es firmar el registro.
 */
import type { RegistryChain, RegistryRpc, RpcRegistry } from './types'

/** Más nodos por red no ayudan y cada uno es una petición de sondeo. */
export const MAX_RPCS_PER_CHAIN = 60
const MAX_URL_LENGTH = 200
const MAX_HEADERS = 5

/**
 * https, host con nombre (sin usuario:clave@), puerto opcional, ruta y query opcionales.
 * Sin fragmento ni espacios. A propósito más estrecha que una URL cualquiera.
 */
const RPC_URL = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/i
const HEADER_NAME = /^[A-Za-z0-9-]{1,40}$/

const hostOf = (url: string): string => url.slice('https://'.length).split(/[/:?]/)[0].toLowerCase()

/** Dialectos (`api`) que la app sabe hablar en esta red: los que usa su lista empaquetada. */
const dialectsOf = (chain: RegistryChain): Set<string> =>
	new Set(chain.rpcs.map(rpc => rpc.api).filter((api): api is string => typeof api === 'string'))

const cleanHeaders = (raw: unknown): Record<string, string> | null => {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
	const entries = Object.entries(raw as Record<string, unknown>)
	if (entries.length === 0 || entries.length > MAX_HEADERS) return null
	const clean: Record<string, string> = {}
	for (const [name, value] of entries) {
		if (!HEADER_NAME.test(name) || typeof value !== 'string' || value.length > MAX_URL_LENGTH || /[\r\n]/.test(value)) return null
		clean[name] = value
	}
	return clean
}

/** Un nodo del remoto, o null si no tiene la forma exacta de uno. */
const cleanRpc = (raw: unknown, dialects: Set<string>): RegistryRpc | null => {
	if (!raw || typeof raw !== 'object') return null
	const rpc = raw as Record<string, unknown>
	if (typeof rpc.url !== 'string' || rpc.url.length > MAX_URL_LENGTH || !RPC_URL.test(rpc.url)) return null
	if (typeof rpc.priority !== 'number' || !Number.isFinite(rpc.priority)) return null

	// Dos etiquetas no son del remoto: `user` (los nodos que añade el usuario) y `qvapay`
	// fuera de qvapay.com (la pantalla Nodos lo enseñaría como nodo de la casa)
	let owner = typeof rpc.owner === 'string' && rpc.owner.trim() ? rpc.owner.trim().slice(0, 40) : 'registry'
	const host = hostOf(rpc.url)
	if (owner === 'user' || (owner === 'qvapay' && host !== 'qvapay.com' && !host.endsWith('.qvapay.com'))) owner = 'registry'

	// Los nodos del usuario van delante con prioridad -1: el remoto no se les cuela
	const clean: RegistryRpc = { url: rpc.url, priority: Math.max(0, rpc.priority), owner }
	if (rpc.enabled === false) clean.enabled = false
	if (rpc.api !== undefined) {
		// Un dialecto que la app no habla en esta red no es un nodo que pueda usar
		if (typeof rpc.api !== 'string' || !dialects.has(rpc.api)) return null
		clean.api = rpc.api
	}
	if (rpc.headers !== undefined) {
		const headers = cleanHeaders(rpc.headers)
		if (!headers) return null
		clean.headers = headers
	}
	return clean
}

/** La lista de nodos del remoto para una red, o null si no trae ninguna que valga. */
const cleanRpcs = (raw: unknown, pinned: RegistryChain): RegistryRpc[] | null => {
	if (!Array.isArray(raw)) return null
	const dialects = dialectsOf(pinned)
	const seen = new Set<string>()
	const rpcs: RegistryRpc[] = []
	for (const entry of raw) {
		const rpc = cleanRpc(entry, dialects)
		if (!rpc || seen.has(rpc.url)) continue
		seen.add(rpc.url)
		rpcs.push(rpc)
		if (rpcs.length === MAX_RPCS_PER_CHAIN) break
	}
	return rpcs.length > 0 ? rpcs : null
}

/**
 * El registro que la app usa de verdad: las redes del empaquetado, con los nodos del remoto
 * donde este trae una lista válida. Nunca lanza.
 *
 * @returns null si lo remoto ni siquiera tiene forma de registro (se usa el empaquetado).
 */
export const pinRegistry = (remote: unknown, bundled: RpcRegistry): RpcRegistry | null => {
	if (!remote || typeof remote !== 'object') return null
	const candidate = remote as { version?: unknown, updated_at?: unknown, chains?: unknown }
	if (typeof candidate.version !== 'number' || !Number.isFinite(candidate.version)) return null
	if (!candidate.chains || typeof candidate.chains !== 'object' || Array.isArray(candidate.chains)) return null
	const remoteChains = candidate.chains as Record<string, unknown>

	const chains: Record<string, RegistryChain> = {}
	for (const [key, pinned] of Object.entries(bundled.chains)) {
		const remoteChain = remoteChains[key]
		const rpcs = remoteChain && typeof remoteChain === 'object' ? cleanRpcs((remoteChain as { rpcs?: unknown }).rpcs, pinned) : null
		// Solo cambia `rpcs`. Contratos, decimales, chainId, nativo, explorador y staking: los de la app
		chains[key] = rpcs ? { ...pinned, rpcs } : pinned
	}
	return {
		version: candidate.version,
		updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : bundled.updated_at,
		chains,
	}
}
