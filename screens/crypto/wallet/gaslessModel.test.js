/**
 * @jest-environment node
 *
 * Interpretación de la respuesta al canjear un permiso de patrocinio. Lo que se prueba
 * aquí es si el envío gratis del día se conserva o se gasta, y si el usuario acaba
 * reenviando algo que ya salió a la red.
 */
import { classifySubmitFailure, consumesGrant, fallsBackToPaid, grantChain, interpretSubmit, isUnprovenOutcome, sponsorChainFor, sponsoredNotice, isGrantUsable } from './gaslessModel'

const result = (overrides = {}) => ({ status: 'confirmed', reason: null, rebuild: false, retryable: false, signature: 'SIG', explorer: null, message: null, ...overrides })

describe('interpretSubmit', () => {

	it('confirmada con firma: listo', () => {
		expect(interpretSubmit(result())).toEqual({ kind: 'done', txid: 'SIG' })
	})

	// Antes, con firma se daba por «Enviado». Pero `pending` es que el patrocinador NO la vio
	// confirmar: si la red la descarta, la pantalla ya había dicho que sí
	it('difundida sin confirmar NO es «enviado», tenga firma o no: se persigue', () => {
		expect(interpretSubmit(result({ status: 'pending' }))).toEqual({ kind: 'poll' })
		expect(interpretSubmit(result({ status: 'pending', signature: null }))).toEqual({ kind: 'poll' })
	})

	// El backend contesta «no se gastó nada» también cuando la difusión falló sin saberse si entró
	it('Solana: una difusión fallida no prueba que no entrara → no se sabe', () => {
		expect(interpretSubmit(result({ status: 'authorized', signature: null, reason: 'broadcast_failed' }), 'solana')).toEqual({ kind: 'unknown' })
	})

	it('BSC: ahí sí es un error sin más (el nonce impide que entren las dos)', () => {
		expect(interpretSubmit(result({ status: 'authorized', signature: null, reason: 'broadcast_failed', message: 'No disponible' }), 'bsc')).toEqual({ kind: 'error', message: 'No disponible' })
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
		// Paymaster que no la acepta, otra tx sin minar, presupuesto agotado… (nada llegó a mandarse)
		for (const reason of ['not_sponsorable', 'nonce_gap', 'daily_budget', 'paused', 'simulation_failed', 'origin_insufficient_funds']) {
			expect(fallsBackToPaid(result({ status: 'authorized', signature: null, reason }), 'solana')).toBe(true)
			expect(fallsBackToPaid(result({ status: 'authorized', signature: null, reason }), 'bsc')).toBe(true)
		}
	})

	// El agujero: el nodo acepta la tx ya co-firmada y la respuesta se pierde. El backend lo
	// contaba como «no se gastó nada», la pantalla ofrecía pagar, y entraban las dos
	it('Solana: tras una difusión fallida NO se ofrece pagar (la gratis pudo entrar)', () => {
		const outcome = result({ status: 'authorized', signature: null, reason: 'broadcast_failed' })
		expect(isUnprovenOutcome(outcome, 'solana')).toBe(true)
		expect(fallsBackToPaid(outcome, 'solana')).toBe(false)
		// Y el permiso no se devuelve: pudo gastarse
		expect(consumesGrant(outcome, 'solana')).toBe(true)
	})

	it('BSC: sí se puede, porque patrocinada y pagada comparten nonce y solo una entra', () => {
		const outcome = result({ status: 'authorized', signature: null, reason: 'broadcast_failed' })
		expect(isUnprovenOutcome(outcome, 'bsc')).toBe(false)
		expect(fallsBackToPaid(outcome, 'bsc')).toBe(true)
		expect(consumesGrant(outcome, 'bsc')).toBe(false)
	})

	it('sin decir la cadena se asume la estricta (Solana)', () => {
		expect(fallsBackToPaid(result({ status: 'authorized', signature: null, reason: 'broadcast_failed' }))).toBe(false)
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

// La PETICIÓN de canje falla (no llega un desenlace). Antes todo era «no se sabe», y con un
// permiso caducado la pantalla se quedaba en «no pudimos confirmar» sin salida
describe('classifySubmitFailure', () => {
	const failure = (status, details) => ({ status, details })

	it('sin respuesta o error del servidor: no se sabe si llegó a mandarse', () => {
		expect(classifySubmitFailure({})).toEqual({ kind: 'unknown' })
		expect(classifySubmitFailure(failure(500, { error: 'boom' }))).toEqual({ kind: 'unknown' })
		expect(classifySubmitFailure(failure(503))).toEqual({ kind: 'unknown' })
	})

	it('el permiso caducó o no existe: esta petición no mandó nada, y el permiso ya no sirve', () => {
		expect(classifySubmitFailure(failure(409, { code: 'GRANT_EXPIRED' }))).toEqual({ kind: 'rejected', grantGone: true })
		expect(classifySubmitFailure(failure(404, { code: 'NOT_FOUND' }))).toEqual({ kind: 'rejected', grantGone: true })
	})

	it('demasiadas peticiones o cuerpo inválido: tampoco mandó nada, y el permiso sigue vivo', () => {
		expect(classifySubmitFailure(failure(429, { code: 'RATE_LIMITED' }))).toEqual({ kind: 'rejected', grantGone: false })
		expect(classifySubmitFailure(failure(400, { code: 'INVALID_BODY' }))).toEqual({ kind: 'rejected', grantGone: false })
		expect(classifySubmitFailure(failure(401))).toEqual({ kind: 'rejected', grantGone: false })
	})

	it('el permiso ya se canjeó y consta confirmado: es el envío, con su firma', () => {
		expect(classifySubmitFailure(failure(409, { code: 'GRANT_NOT_AVAILABLE', status: 'confirmed', signature: 'SIG' }))).toEqual({ kind: 'done', txid: 'SIG' })
	})

	it('el permiso tiene un canje en curso o en revisión: no se sabe', () => {
		for (const status of ['submitted', 'pending', 'review']) {
			expect(classifySubmitFailure(failure(409, { code: 'GRANT_NOT_AVAILABLE', status, signature: null }))).toEqual({ kind: 'unknown' })
		}
	})

	it('el permiso terminó sin envío: no sirve', () => {
		for (const status of ['failed', 'expired', 'cancelled']) {
			expect(classifySubmitFailure(failure(409, { code: 'GRANT_NOT_AVAILABLE', status, signature: null }))).toEqual({ kind: 'rejected', grantGone: true })
		}
	})

	it('confirmado SIN firma no se da por enviado', () => {
		expect(classifySubmitFailure(failure(409, { code: 'GRANT_NOT_AVAILABLE', status: 'confirmed', signature: null }))).toEqual({ kind: 'rejected', grantGone: true })
	})
})
