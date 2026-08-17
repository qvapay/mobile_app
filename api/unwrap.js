/**
 * Puente entre el contrato de los módulos de `api/` y el de React Query.
 *
 * Los 15 módulos devuelven `{ success, data?, error?, status? }` y nunca lanzan;
 * React Query se construye sobre promesas que RECHAZAN. Sin un traductor, cada
 * `queryFn` acabaría repitiendo su propio `if (!result.success) throw …`, que es
 * justo la duplicación que un refactor de datos debería eliminar.
 */

/**
 * Error de API con el código HTTP adjunto, para que la política de reintentos
 * pueda distinguir un fallo del cliente de uno del servidor.
 *
 * @property {number|undefined} status - Código HTTP, o `undefined` cuando no hubo respuesta.
 */
export class ApiError extends Error {

	constructor(message, status) {
		super(message)
		this.name = 'ApiError'
		this.status = status
	}
}

/**
 * Convierte un resultado del contrato en su `data`, o lanza `ApiError`.
 *
 * @param {{ success: boolean, data?: *, error?: string, status?: number }} result - Respuesta de un módulo de `api/`.
 * @returns {*} El `data` del resultado (`null` si venía vacío).
 * @throws {ApiError} Si `success` es falso.
 *
 * @example
 * queryFn: () => unwrap(await transferApi.getLatestTransactions({ take: 6 }))
 */
export const unwrap = (result) => {

	if (!result?.success) {
		throw new ApiError(result?.error || 'Ha ocurrido un error inesperado', result?.status)
	}

	// React Query trata `undefined` como un fallo de la query ("Query data cannot
	// be undefined"), así que un éxito sin cuerpo se normaliza a null
	return result.data === undefined ? null : result.data
}

/**
 * Política de reintentos de React Query.
 *
 * El matiz importante está en `status`: ante un 500 o un fallo de red, el
 * interceptor de `api/client.js` (líneas 135-142) rechaza con un objeto plano
 * `{ message }` SIN `.response`, así que los módulos rellenan
 * `status: error.response?.status` con **undefined**. Es decir, los dos casos
 * donde más sentido tiene reintentar son precisamente los que llegan sin código,
 * y una regla ingenua del tipo `status >= 500` no los reintentaría nunca.
 *
 * De ahí que la condición se exprese al revés: se descarta el reintento solo
 * cuando consta un 4xx (fallo del cliente: reintentar no lo arregla). Todo lo
 * demás —5xx y ausencia de código— se reintenta.
 *
 * @param {number} failureCount - Intentos fallidos hasta ahora (React Query lo pasa).
 * @param {ApiError|Error} error - Error lanzado por `unwrap`.
 * @returns {boolean} Si conviene reintentar.
 */
export const shouldRetry = (failureCount, error) => {

	if (failureCount >= 2) return false

	const status = error?.status
	if (typeof status === 'number' && status >= 400 && status < 500) return false

	return true
}
