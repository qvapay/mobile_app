/**
 * Transporte HTTP de los adaptadores de cadena. Módulo PURO (fetch global,
 * cero react-native). Sus errores llevan la forma que entiende
 * `isRetryableRpcError` del router: `status` en errores HTTP y `retryable`
 * explícito donde el código HTTP no basta (429 y límites JSON-RPC rotan de
 * nodo; un revert o un parámetro inválido NO, sería igual en cualquier nodo).
 */

export class ChainHttpError extends Error {
	status?: number
	retryable?: boolean
	constructor(message: string, { status, retryable }: { status?: number, retryable?: boolean } = {}) {
		super(message)
		this.name = 'ChainHttpError'
		this.status = status
		this.retryable = retryable
	}
}

type RequestOptions = {
	signal?: AbortSignal
	headers?: Record<string, string>
}

const parseJson = async (res: Response, url: string): Promise<unknown> => {
	if (!res.ok) {
		// 429 = nodo saturado: otro nodo sí puede responder → rotar
		throw new ChainHttpError(`${url}: HTTP ${res.status}`, { status: res.status, retryable: res.status === 429 || res.status >= 500 })
	}
	try {
		return await res.json()
	} catch {
		// HTML de un proxy/captcha en vez de JSON: fallo del nodo, no de la petición
		throw new ChainHttpError(`${url}: respuesta no JSON`, { retryable: true })
	}
}

export const getJson = async <T>(url: string, { signal, headers }: RequestOptions = {}): Promise<T> => {
	const res = await fetch(url, { method: 'GET', signal, headers: { Accept: 'application/json', ...headers } })
	return parseJson(res, url) as Promise<T>
}

export const postJson = async <T>(url: string, body: unknown, { signal, headers }: RequestOptions = {}): Promise<T> => {
	const res = await fetch(url, {
		method: 'POST',
		signal,
		headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
		body: JSON.stringify(body),
	})
	return parseJson(res, url) as Promise<T>
}

type JsonRpcResponse<T> = { result?: T, error?: { code?: number, message?: string } }

/** Códigos JSON-RPC que significan "este nodo no puede ahora", no "petición mala". */
const RETRYABLE_RPC_CODES = new Set([-32005, -32603, -32000, 429])

/** Llamada JSON-RPC 2.0 simple (sin batch: muchos nodos públicos no lo aceptan). */
export const jsonRpc = async <T>(url: string, method: string, params: unknown[], options: RequestOptions = {}): Promise<T> => {
	const payload = await postJson<JsonRpcResponse<T>>(url, { jsonrpc: '2.0', id: 1, method, params }, options)
	if (payload?.error) {
		const code = payload.error.code
		throw new ChainHttpError(`${url}: ${method} → ${payload.error.message ?? code}`, {
			retryable: code !== undefined && RETRYABLE_RPC_CODES.has(code),
		})
	}
	if (payload?.result === undefined) throw new ChainHttpError(`${url}: ${method} sin result`, { retryable: true })
	return payload.result
}

/** Hex de cantidad JSON-RPC ('0x', '0x0', '0x1a…') → bigint. '0x' vacío = 0. */
export const hexToBigInt = (hex: string | null | undefined): bigint => {
	if (!hex || hex === '0x') return 0n
	return BigInt(hex.startsWith('0x') ? hex : `0x${hex}`)
}
