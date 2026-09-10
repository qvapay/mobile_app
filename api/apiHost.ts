import config from '../config'

/**
 * Host efectivo de la API.
 *
 * En producción es siempre `config.API_BASE_URL` (api.qvapay.com) y este
 * módulo no hace nada. En `__DEV__` la URL base es la IP del backend local;
 * la primera petición lanza UNA sonda contra `/status` y, si el host no
 * contesta en `API_DEV_PROBE_TIMEOUT` (red caída, timeout, otra máquina), el
 * cliente entero pasa a producción durante el resto de la sesión. Cualquier
 * respuesta HTTP —incluso un 4xx/5xx— cuenta como "alcanzable": solo el
 * silencio cambia de host. Las peticiones que salgan mientras la sonda está
 * en vuelo la esperan (máximo ese timeout) para no morir contra la LAN.
 *
 * Leer SIEMPRE `getApiBaseUrl()` en call time (SSE, PDF): un consumidor que
 * copie `config.API_BASE_URL` a nivel de módulo no seguiría el cambio.
 */

// Metro inyecta `process.env.NODE_ENV` en el bundle y jest lo fija a 'test';
// no hay @types/node en el proyecto, así que se declara lo mínimo.
declare const process: { env: Record<string, string | undefined> } | undefined

const PROBE_TIMEOUT_MS = config.API_DEV_PROBE_TIMEOUT ?? 15000

let baseUrl: string = config.API_BASE_URL
let probe: Promise<string> | null = null
let switched = false

const isJest = (): boolean => typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test'

const isDevProbeEnabled = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__ && !isJest() && baseUrl !== config.API_PROD_URL

/** URL base actual (puede haber cambiado a producción en dev). */
export const getApiBaseUrl = (): string => baseUrl

/** true si la sesión dev cayó a producción por no alcanzar la LAN. */
export const isUsingFallbackHost = (): boolean => switched

const probeLocalHost = async (): Promise<string> => {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
	try {
		await fetch(`${baseUrl}/status`, { signal: controller.signal, headers: { Accept: 'application/json' } })
	} catch {
		const local = baseUrl
		baseUrl = config.API_PROD_URL
		switched = true
		console.warn(`[api] ${local} no responde en ${PROBE_TIMEOUT_MS / 1000}s — usando ${baseUrl} el resto de la sesión`)
	} finally { clearTimeout(timer) }
	return baseUrl
}

/**
 * Resuelve el host antes de cada petición. Fuera de dev (o ya en producción)
 * es síncrono en la práctica; en dev, la primera llamada arranca la sonda y
 * las siguientes comparten la misma promesa.
 */
export const ensureApiHost = (): Promise<string> => {
	if (!isDevProbeEnabled()) return Promise.resolve(baseUrl)
	if (!probe) probe = probeLocalHost()
	return probe
}

/** Solo tests: vuelve al estado inicial. */
export const __resetApiHostForTests = (): void => {
	baseUrl = config.API_BASE_URL
	probe = null
	switched = false
}
