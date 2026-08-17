/**
 * Tests del puente entre el contrato `{ success, data, error, status }` de los
 * módulos de `api/` y el de React Query, que espera promesas que rechazan.
 *
 * El caso que de verdad importa es el de `status: undefined`: ante un 500 o un
 * fallo de red el interceptor rechaza sin `.response`, así que los dos
 * escenarios donde reintentar tiene sentido llegan SIN código HTTP.
 * @jest-environment node
 */
import { unwrap, shouldRetry, retryDelay, ApiError } from './unwrap'

describe('unwrap', () => {
	test('un éxito devuelve el data tal cual', () => {
		expect(unwrap({ success: true, data: [1, 2], status: 200 })).toEqual([1, 2])
	})

	test('un éxito sin cuerpo se normaliza a null, no a undefined', () => {
		// React Query rechaza una query cuyo queryFn devuelve undefined
		expect(unwrap({ success: true, status: 204 })).toBe(null)
	})

	test('un éxito con data null se respeta', () => {
		expect(unwrap({ success: true, data: null })).toBe(null)
	})

	test('un fallo lanza ApiError conservando mensaje y status', () => {
		expect(() => unwrap({ success: false, error: 'Sin permiso', status: 403 }))
			.toThrow(ApiError)
		try {
			unwrap({ success: false, error: 'Sin permiso', status: 403 })
		} catch (e) {
			expect(e.message).toBe('Sin permiso')
			expect(e.status).toBe(403)
		}
	})

	test('un fallo sin mensaje usa el genérico en español', () => {
		expect(() => unwrap({ success: false })).toThrow('Ha ocurrido un error inesperado')
	})

	test('un resultado nulo o indefinido se trata como fallo, no revienta', () => {
		expect(() => unwrap(null)).toThrow(ApiError)
		expect(() => unwrap(undefined)).toThrow(ApiError)
	})
})

describe('shouldRetry', () => {
	test('no reintenta un 4xx: el fallo es del cliente', () => {
		expect(shouldRetry(0, new ApiError('No autorizado', 401))).toBe(false)
		expect(shouldRetry(0, new ApiError('Sin permiso', 403))).toBe(false)
		expect(shouldRetry(0, new ApiError('No existe', 404))).toBe(false)
	})

	test('el 429 es la excepción de los 4xx: el token bucket se rellena solo', () => {
		// Sin esto, el scroll infinito del histórico rebotaba en el cuarto swipe
		// y la lista se quedaba muda sin reintentar
		expect(shouldRetry(0, new ApiError('Demasiadas', 429))).toBe(true)
		expect(shouldRetry(2, new ApiError('Demasiadas', 429))).toBe(false)
	})

	test('SÍ reintenta cuando no hay status (500 y red llegan así)', () => {
		// El interceptor rechaza con un objeto plano sin .response, así que los
		// módulos rellenan status con undefined — una regla `status >= 500` no
		// reintentaría jamás los dos casos que más lo merecen
		expect(shouldRetry(0, new ApiError('No se ha podido conectar con el servidor', undefined))).toBe(true)
		expect(shouldRetry(0, new ApiError('Ha ocurrido un error, contacte a soporte', undefined))).toBe(true)
	})

	test('reintenta un 5xx con código explícito', () => {
		expect(shouldRetry(0, new ApiError('Bad gateway', 502))).toBe(true)
		expect(shouldRetry(0, new ApiError('No disponible', 503))).toBe(true)
	})

	test('se rinde tras dos intentos, sea cual sea el error', () => {
		expect(shouldRetry(2, new ApiError('Bad gateway', 502))).toBe(false)
		expect(shouldRetry(5, new ApiError('Sin red', undefined))).toBe(false)
	})

	test('un error que no es ApiError se reintenta (no consta que sea del cliente)', () => {
		expect(shouldRetry(0, new Error('boom'))).toBe(true)
	})
})

describe('retryDelay', () => {
	test('un 429 espera el refill del rate limit, no el backoff caliente', () => {
		expect(retryDelay(0, new ApiError('Demasiadas', 429))).toBe(2500)
		expect(retryDelay(1, new ApiError('Demasiadas', 429))).toBe(2500)
	})

	test('el resto usa backoff exponencial corto', () => {
		expect(retryDelay(0, new ApiError('Sin red', undefined))).toBe(1000)
		expect(retryDelay(1, new ApiError('Bad gateway', 502))).toBe(2000)
		// Y se acota: nunca más de 5s entre intentos
		expect(retryDelay(4, new ApiError('Sin red', undefined))).toBe(5000)
	})
})
