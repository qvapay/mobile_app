/**
 * Contrato de respuesta de los 15 módulos de `api/`: nunca lanzan; devuelven
 * `{ success, data?, error?, status? }`. El discriminante es `success` literal,
 * así que TS estrecha solo con un `if (result.success)`.
 *
 * `status` es genuinamente opcional: ante un 5xx o un fallo de red el
 * interceptor de `api/client.js` rechaza con un objeto plano SIN `.response`,
 * y los módulos rellenan `status: error.response?.status` con `undefined`.
 */

export type ApiSuccess<T> = {
	success: true
	/** Cuerpo de la respuesta; algunos endpoints responden sin cuerpo. */
	data?: T
	status?: number
}

export type ApiFailure = {
	success: false
	/** Mensaje de error listo para UI (los interceptores lo dan en español). */
	error?: string
	/** Body de error crudo del backend (validaciones, códigos como DUPLICATE_REQUEST). */
	details?: unknown
	status?: number
}

export type ApiResult<T = unknown> = ApiSuccess<T> | ApiFailure

/**
 * Forma del error que llega al `catch` de los módulos de `api/`: un AxiosError
 * (con `.response`) O el objeto plano `{ message }` con que el interceptor de
 * `client.ts` rechaza los 500 y fallos de red (SIN `.response`). Cubre ambos.
 */
export type ApiClientError = {
	response?: {
		data?: { error?: string, message?: string } & Record<string, unknown>
		status?: number
	}
	message?: string
}
