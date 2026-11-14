/**
 * Límite de intentos del PIN (lógica pura). El PIN son 4 dígitos y protege la frase de la
 * wallet: lo que se fija aquí es que no se pueda probar entero, ni esperando ni adelantando
 * el reloj del teléfono, y que su dueño nunca se quede fuera por un almacén o un reloj malos.
 * @jest-environment node
 */
import {
	clampToNow,
	FREE_ATTEMPTS,
	MAX_WAIT_MS,
	NO_ATTEMPTS,
	OWNER_PROOF_AFTER,
	parsePinAttempts,
	pinGate,
	registerAttempt,
	serializePinAttempts,
	waitAfterFailures,
	waitParts,
} from './pinAttempts'

const NOW = 1_800_000_000_000
const WITH_PROOF = { ownerProofAvailable: true }
const NO_PROOF = { ownerProofAvailable: false }
/** `n` fallos seguidos, el último en `at`. */
const failed = (n, at = NOW) => ({ failures: n, lastFailureAt: at })

describe('espera creciente', () => {
	test('los cinco primeros fallos no cuestan nada', () => {
		for (let n = 0; n < FREE_ATTEMPTS; n++) expect(waitAfterFailures(n)).toBe(0)
		expect(pinGate(NO_ATTEMPTS, NOW, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 5 })
		expect(pinGate(failed(4), NOW, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 1 })
	})

	test('del quinto al noveno: 30 s, 1 min, 5 min, 15 min, 30 min', () => {
		expect([5, 6, 7, 8, 9].map(waitAfterFailures)).toEqual([30_000, 60_000, 300_000, 900_000, 1_800_000])
	})

	test('a partir del décimo, una hora por intento', () => {
		expect(waitAfterFailures(10)).toBe(MAX_WAIT_MS)
		expect(waitAfterFailures(250)).toBe(MAX_WAIT_MS)
	})

	test('con espera viva no se puede teclear; al cumplirse, sí', () => {
		expect(pinGate(failed(5), NOW, WITH_PROOF)).toEqual({ kind: 'wait', until: NOW + 30_000, remainingMs: 30_000 })
		expect(pinGate(failed(5), NOW + 29_999, WITH_PROOF)).toMatchObject({ kind: 'wait', remainingMs: 1 })
		expect(pinGate(failed(5), NOW + 30_000, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 0 })
	})
})

describe('prueba de dueño del dispositivo', () => {
	test('al décimo fallo ya no vale esperar: ni una hora ni un año después', () => {
		expect(pinGate(failed(OWNER_PROOF_AFTER), NOW, WITH_PROOF)).toEqual({ kind: 'ownerProof' })
		expect(pinGate(failed(OWNER_PROOF_AFTER), NOW + MAX_WAIT_MS, WITH_PROOF)).toEqual({ kind: 'ownerProof' })
		// Adelantar el reloj del teléfono no abre nada
		expect(pinGate(failed(OWNER_PROOF_AFTER), NOW + 365 * 24 * 3600_000, WITH_PROOF)).toEqual({ kind: 'ownerProof' })
		expect(pinGate(failed(37), NOW + 365 * 24 * 3600_000, WITH_PROOF)).toEqual({ kind: 'ownerProof' })
	})

	test('con nueve fallos todavía es espera, no prueba', () => {
		expect(pinGate(failed(9), NOW, WITH_PROOF)).toMatchObject({ kind: 'wait', remainingMs: 1_800_000 })
	})

	test('en un teléfono sin bloqueo de pantalla no hay prueba que pedir: solo queda la espera de una hora', () => {
		expect(pinGate(failed(10), NOW, NO_PROOF)).toEqual({ kind: 'wait', until: NOW + MAX_WAIT_MS, remainingMs: MAX_WAIT_MS })
		expect(pinGate(failed(10), NOW + MAX_WAIT_MS, NO_PROOF)).toEqual({ kind: 'open', freeLeft: 0 })
	})

	test('probar el PIN entero a mano no sale: como mucho 10 intentos por prueba', () => {
		// Un atacante sin la credencial del teléfono, con todo el tiempo y el reloj a su gusto
		let state = NO_ATTEMPTS
		let clock = NOW
		let tries = 0
		for (;;) {
			const gate = pinGate(state, clock, WITH_PROOF)
			if (gate.kind === 'ownerProof') break
			if (gate.kind === 'wait') { clock = gate.until; continue }
			state = registerAttempt(state, clock)
			tries++
			if (tries > 100) break
		}
		expect(tries).toBe(OWNER_PROOF_AFTER)
	})
})

describe('el intento se anota antes de comparar', () => {
	test('registerAttempt suma un fallo con su hora', () => {
		expect(registerAttempt(NO_ATTEMPTS, NOW)).toEqual({ failures: 1, lastFailureAt: NOW })
		expect(registerAttempt(failed(4, NOW - 5000), NOW)).toEqual({ failures: 5, lastFailureAt: NOW })
	})

	test('el quinto fallo es el que activa la espera', () => {
		let state = NO_ATTEMPTS
		for (let i = 0; i < 4; i++) state = registerAttempt(state, NOW)
		expect(pinGate(state, NOW, WITH_PROOF).kind).toBe('open')
		state = registerAttempt(state, NOW)
		expect(pinGate(state, NOW, WITH_PROOF).kind).toBe('wait')
	})
})

describe('reloj del teléfono', () => {
	test('atrasar el reloj no acorta la espera: vuelve a empezar', () => {
		// Falló a las NOW y pone el reloj una hora atrás
		expect(pinGate(failed(5), NOW - 3600_000, WITH_PROOF)).toEqual({ kind: 'wait', until: NOW - 3600_000 + 30_000, remainingMs: 30_000 })
	})

	test('un último fallo «en el futuro» se fija a ahora; si no se guardara, la espera no terminaría nunca', () => {
		// El reloj estaba adelantado al fallar y la red lo corrigió: el fallo quedó 2 h por delante
		const stored = failed(6, NOW + 2 * 3600_000)
		const clamped = clampToNow(stored, NOW)
		expect(clamped).toEqual({ failures: 6, lastFailureAt: NOW })
		// Guardado así, la espera de 1 min corre y se cumple
		expect(pinGate(clamped, NOW + 60_000, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 0 })
		// Sin guardarlo, cada consulta la recalcula desde su propio «ahora»
		expect(pinGate(stored, NOW + 60_000, WITH_PROOF).kind).toBe('wait')
		// Y lo que ya está en el pasado no se toca
		expect(clampToNow(failed(6, NOW - 1), NOW)).toEqual(failed(6, NOW - 1))
	})
})

describe('lo que se guarda en disco', () => {
	test('ida y vuelta', () => {
		expect(serializePinAttempts(failed(7))).toBe(`{"f":7,"t":${NOW}}`)
		expect(parsePinAttempts(serializePinAttempts(failed(7)))).toEqual(failed(7))
		expect(parsePinAttempts(serializePinAttempts(NO_ATTEMPTS))).toEqual(NO_ATTEMPTS)
	})

	test.each([null, undefined, '', 'basura', '{', 'null', '[]', '42', '{"f":"7"}', '{"f":-3,"t":1}', '{"f":1.5,"t":1}', '{"f":null}'])('%p se lee como «sin fallos» (nunca deja fuera al dueño)', (raw) => {
		expect(parsePinAttempts(raw).failures).toBe(0)
		expect(pinGate(parsePinAttempts(raw), NOW, WITH_PROOF).kind).toBe('open')
	})

	test('un contador válido con una fecha ilegible conserva los fallos', () => {
		expect(parsePinAttempts('{"f":12,"t":"ayer"}')).toEqual({ failures: 12, lastFailureAt: 0 })
		// Sin fecha, la espera ya se da por cumplida, pero la prueba de dueño sigue en pie
		expect(pinGate(parsePinAttempts('{"f":12,"t":"ayer"}'), NOW, WITH_PROOF)).toEqual({ kind: 'ownerProof' })
		expect(pinGate(parsePinAttempts('{"f":7}'), NOW, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 0 })
	})

	test('un estado raro en memoria tampoco rompe la puerta', () => {
		expect(pinGate(null, NOW, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 5 })
		expect(pinGate({ failures: NaN, lastFailureAt: NaN }, NOW, WITH_PROOF)).toEqual({ kind: 'open', freeLeft: 5 })
		expect(registerAttempt({ failures: -4, lastFailureAt: 0 }, NOW)).toEqual({ failures: 1, lastFailureAt: NOW })
	})
})

describe('cuenta atrás', () => {
	test('minutos y segundos, redondeando hacia arriba', () => {
		expect(waitParts(30_000)).toEqual({ minutes: 0, seconds: 30 })
		expect(waitParts(29_001)).toEqual({ minutes: 0, seconds: 30 })
		expect(waitParts(60_000)).toEqual({ minutes: 1, seconds: 0 })
		expect(waitParts(3_599_001)).toEqual({ minutes: 60, seconds: 0 })
		expect(waitParts(1)).toEqual({ minutes: 0, seconds: 1 })
		expect(waitParts(0)).toEqual({ minutes: 0, seconds: 0 })
		expect(waitParts(-500)).toEqual({ minutes: 0, seconds: 0 })
	})
})
