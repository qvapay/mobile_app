/**
 * @jest-environment node
 *
 * Interpretación de la respuesta al canjear un permiso de patrocinio. Lo que se prueba
 * aquí es si el envío gratis del día se conserva o se gasta, y si el usuario acaba
 * reenviando algo que ya salió a la red.
 */
import { consumesGrant, fallsBackToPaid, grantChain, interpretSubmit, sponsorChainFor, sponsoredNotice, isGrantUsable } from './gaslessModel'

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

describe('el aviso cuando el envío VA patrocinado', () => {

	it('con envíos de sobra, dice cuántos quedan', () => {
		expect(sponsoredNotice(3)).toBe('remaining')
		expect(sponsoredNotice(1)).toBe('remaining')
	})

	it('con cero restantes NO se anuncia como una negativa: este envío ES gratis', () => {
		// `remaining_today` es lo que queda DESPUÉS de gastar este permiso, así que con la
		// cuota en 1/día siempre llega como 0 — y "te quedan 0 envíos gratis" encima de un
		// envío gratis hace dudar de si el patrocinio se aplicó
		expect(sponsoredNotice(0)).toBe('lastFree')
	})

	it('sin dato tampoco se inventa un número', () => {
		expect(sponsoredNotice(null)).toBe('lastFree')
	})
})

describe('sponsorChainFor', () => {

	it('Solana: USDT y USDC por mint exacto', () => {
		expect(sponsorChainFor({ chainKey: 'solana', contract: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' })).toBe('solana')
		expect(sponsorChainFor({ chainKey: 'solana', contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' })).toBe('solana')
	})

	it('BSC: solo USDT, sin importar mayúsculas del checksum', () => {
		expect(sponsorChainFor({ chainKey: 'bsc', contract: '0x55d398326f99059fF775485246999027B3197955' })).toBe('bsc')
		expect(sponsorChainFor({ chainKey: 'bsc', contract: '0x55d398326f99059ff775485246999027b3197955' })).toBe('bsc')
		// USDC de BSC queda fuera a propósito
		expect(sponsorChainFor({ chainKey: 'bsc', contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' })).toBeNull()
	})

	it('nativos, otras redes y el mismo contrato en otra cadena no se patrocinan', () => {
		expect(sponsorChainFor({ chainKey: 'bsc', contract: null })).toBeNull()
		expect(sponsorChainFor({ chainKey: 'solana', contract: null })).toBeNull()
		expect(sponsorChainFor({ chainKey: 'ethereum', contract: '0x55d398326f99059fF775485246999027B3197955' })).toBeNull()
		expect(sponsorChainFor({ chainKey: 'tron', contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' })).toBeNull()
		expect(sponsorChainFor(undefined)).toBeNull()
	})
})

describe('grantChain', () => {

	it('un permiso sin `chain` viene de un qpweb anterior a BSC: es de Solana', () => {
		expect(grantChain({})).toBe('solana')
		expect(grantChain({ chain: 'bsc' })).toBe('bsc')
	})
})

describe('fallsBackToPaid', () => {

	it('sin gastar nada y sin arreglo reconstruyendo: se ofrece pagar', () => {
		// Paymaster que no la acepta, otra tx sin minar, presupuesto agotado…
		for (const reason of ['not_sponsorable', 'nonce_gap', 'daily_budget', 'broadcast_failed']) {
			expect(fallsBackToPaid(result({ status: 'authorized', signature: null, reason }))).toBe(true)
		}
	})

	it('un rebuild NO cae a pagar: se reconstruye gratis con el mismo permiso', () => {
		expect(fallsBackToPaid(result({ status: 'authorized', rebuild: true, signature: null }))).toBe(false)
	})

	it('lo que pudo cobrarse nunca cae a pagar: sería enviar dos veces', () => {
		for (const status of ['confirmed', 'pending', 'failed', 'review']) {
			expect(fallsBackToPaid(result({ status }))).toBe(false)
		}
	})
})
