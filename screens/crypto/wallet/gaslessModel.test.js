/**
 * @jest-environment node
 *
 * Interpretación de la respuesta al canjear un permiso de patrocinio. Lo que se prueba
 * aquí es si el envío gratis del día se conserva o se gasta, y si el usuario acaba
 * reenviando algo que ya salió a la red.
 */
import { consumesGrant, interpretSubmit, isGrantUsable } from './gaslessModel'

const result = (overrides = {}) => ({ status: 'confirmed', reason: null, rebuild: false, retryable: false, signature: 'SIG', explorer: null, message: null, ...overrides })

describe('interpretSubmit', () => {

	it('confirmada con firma: listo', () => {
		expect(interpretSubmit(result())).toEqual({ kind: 'done', txid: 'SIG' })
	})

	it('difundida sin confirmar pero CON firma ya vale: la tx está en la red', () => {
		expect(interpretSubmit(result({ status: 'pending' }))).toEqual({ kind: 'done', txid: 'SIG' })
	})

	it('difundida sin firma hay que perseguirla', () => {
		expect(interpretSubmit(result({ status: 'pending', signature: null }))).toEqual({ kind: 'poll' })
	})

	it('un blockhash caducado manda reconstruir, no fallar', () => {
		// Es el caso más común de todos: la tx tarda más de 60 s en llegar
		expect(interpretSubmit(result({ status: 'authorized', rebuild: true, signature: null, reason: 'blockhash_expired' }))).toEqual({ kind: 'rebuild' })
	})

	it('lo demás es un error con el mensaje del backend', () => {
		expect(interpretSubmit(result({ status: 'failed', signature: null, message: 'La transacción no se pudo completar' })))
			.toEqual({ kind: 'error', message: 'La transacción no se pudo completar' })
	})

	it('un fallo sin mensaje cae a su motivo', () => {
		expect(interpretSubmit(result({ status: 'review', signature: null, reason: 'reserved_unpaid' })).message).toBe('reserved_unpaid')
	})

	it('confirmada SIN firma no se da por buena', () => {
		// No debería pasar; si pasara, decir "enviado" sin nada que enseñar es peor
		expect(interpretSubmit(result({ signature: null })).kind).toBe('error')
	})
})

describe('consumesGrant', () => {

	it('solo `authorized` conserva el permiso', () => {
		// Es el único estado en el que el backend PRUEBA que no se gastó nada
		expect(consumesGrant(result({ status: 'authorized' }))).toBe(false)
	})

	it('todo lo que llegó a la red lo gasta', () => {
		for (const status of ['confirmed', 'pending', 'failed']) {
			expect(consumesGrant(result({ status }))).toBe(true)
		}
	})

	it('lo que quedó en revisión también: pudo cobrarse', () => {
		expect(consumesGrant(result({ status: 'review' }))).toBe(true)
	})
})

describe('isGrantUsable', () => {

	it('un permiso vigente sirve', () => {
		expect(isGrantUsable(new Date(Date.now() + 60_000).toISOString())).toBe(true)
	})

	it('uno caducado no', () => {
		expect(isGrantUsable(new Date(Date.now() - 1).toISOString())).toBe(false)
	})

	it('una fecha ilegible tampoco', () => {
		expect(isGrantUsable('mañana')).toBe(false)
	})
})
