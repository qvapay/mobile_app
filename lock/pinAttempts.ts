/**
 * Límite de intentos del PIN de la app. Módulo PURO: decide, no guarda ni pinta.
 *
 * El PIN son 4 dígitos (10.000 combinaciones) y es lo único entre quien tenga el teléfono
 * desbloqueado y la frase de la wallet. Sin límite, se prueba entero a mano en una tarde.
 * Dos frenos, porque cada uno falla por un lado distinto:
 *
 * 1. **Espera creciente** a partir del quinto fallo. Frena, pero se mide con el reloj del
 *    teléfono, y en Android la hora se cambia desde Ajustes sin pedir nada: quien adelante
 *    el reloj se salta la espera. Por eso no basta.
 * 2. **Prueba de dueño del dispositivo** al décimo fallo (`helpers/deviceOwnerProof`: huella,
 *    cara o el código del teléfono). No depende de ningún reloj: sin esa credencial no hay
 *    intento once. El dueño de verdad la pasa en un segundo y recupera sus intentos.
 *
 * En un teléfono sin bloqueo de pantalla la prueba no existe (`ownerProofAvailable: false`):
 * ahí solo queda la espera, que sube hasta una hora por intento.
 *
 * El contador se guarda ANTES de comparar el PIN (ver `registerAttempt`): si se anotara
 * después, matar la app justo tras un fallo lo dejaría sin contar.
 */

export type PinAttempts = {
	/** Fallos seguidos desde el último acierto o la última prueba de dueño. */
	failures: number
	/** Cuándo fue el último (ms del reloj del teléfono). 0 = nunca. */
	lastFailureAt: number
}

export const NO_ATTEMPTS: PinAttempts = { failures: 0, lastFailureAt: 0 }

/** Fallos que no cuestan nada: un dedo torpe no merece castigo. */
export const FREE_ATTEMPTS = 5
/** Con estos fallos ya no vale esperar: hay que probar que el teléfono es de uno. */
export const OWNER_PROOF_AFTER = 10

/** Espera tras el fallo nº 5, 6, 7, 8 y 9. */
const WAITS_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000]
/** Tope, y lo que se espera por intento cuando no hay prueba de dueño que pedir. */
export const MAX_WAIT_MS = 60 * 60_000

/** Cuánto hay que esperar tras `failures` fallos seguidos antes del siguiente intento. */
export const waitAfterFailures = (failures: number): number => {
	if (!(failures >= FREE_ATTEMPTS)) return 0
	return WAITS_MS[failures - FREE_ATTEMPTS] ?? MAX_WAIT_MS
}

export type PinGate =
	/** Se puede intentar. `freeLeft`: intentos que quedan antes de la primera espera. */
	| { kind: 'open', freeLeft: number }
	/** Hay que esperar hasta `until` (reloj del teléfono). */
	| { kind: 'wait', until: number, remainingMs: number }
	/** Demasiados fallos: solo la prueba de dueño del dispositivo devuelve los intentos. */
	| { kind: 'ownerProof' }

/**
 * ¿Se puede teclear otro PIN ahora?
 *
 * @param ownerProofAvailable - El teléfono tiene bloqueo de pantalla (hay prueba que pedir).
 */
export const pinGate = (state: PinAttempts, now: number, { ownerProofAvailable }: { ownerProofAvailable: boolean }): PinGate => {
	const failures = sane(state).failures
	if (failures < FREE_ATTEMPTS) return { kind: 'open', freeLeft: FREE_ATTEMPTS - failures }
	// La prueba va ANTES que la espera: el reloj se puede adelantar, la prueba no
	if (failures >= OWNER_PROOF_AFTER && ownerProofAvailable) return { kind: 'ownerProof' }
	const until = clampToNow(sane(state), now).lastFailureAt + waitAfterFailures(failures)
	return until > now ? { kind: 'wait', until, remainingMs: until - now } : { kind: 'open', freeLeft: 0 }
}

/**
 * Un último fallo «en el futuro» significa que el reloj se atrasó (a mano, o porque estaba
 * mal y la red lo corrigió): se cuenta como ocurrido ahora y la espera vuelve a empezar.
 *
 * Quien carga el contador tiene que GUARDAR lo que devuelve esto. Si no, con el reloj ya
 * por detrás de esa fecha la espera se recalcularía desde «ahora» en cada consulta y no
 * terminaría nunca: el dueño se quedaría fuera por haber tenido la hora mal.
 */
export const clampToNow = (state: PinAttempts, now: number): PinAttempts => (state.lastFailureAt > now ? { ...state, lastFailureAt: now } : state)

/**
 * Lo que se guarda ANTES de comparar el PIN: el intento cuenta como fallo hasta que se
 * demuestre lo contrario. Si acierta, `NO_ATTEMPTS`; si no, ya está anotado.
 */
export const registerAttempt = (state: PinAttempts, now: number): PinAttempts => ({ failures: sane(state).failures + 1, lastFailureAt: now })

/** Lo guardado puede venir de cualquier sitio (disco, versión vieja): nunca un contador raro. */
const sane = (state: PinAttempts | null | undefined): PinAttempts => {
	const failures = Number.isInteger(state?.failures) && (state as PinAttempts).failures > 0 ? (state as PinAttempts).failures : 0
	const lastFailureAt = Number.isFinite(state?.lastFailureAt) && (state as PinAttempts).lastFailureAt > 0 ? (state as PinAttempts).lastFailureAt : 0
	return { failures, lastFailureAt }
}

/** Formato en disco: `{"f":<fallos>,"t":<ms>}`. */
export const serializePinAttempts = (state: PinAttempts): string => {
	const { failures, lastFailureAt } = sane(state)
	return JSON.stringify({ f: failures, t: lastFailureAt })
}

/**
 * Lee lo guardado. Algo ilegible vuelve como «sin fallos»: el contador es un freno, no la
 * llave, y un almacén que falla no puede dejar a su dueño fuera de la app. El PIN se
 * sigue exigiendo igual.
 */
export const parsePinAttempts = (raw: string | null | undefined): PinAttempts => {
	if (!raw) return NO_ATTEMPTS
	try {
		const parsed = JSON.parse(raw) as { f?: unknown, t?: unknown } | null
		if (!parsed || typeof parsed !== 'object') return NO_ATTEMPTS
		return sane({ failures: parsed.f as number, lastFailureAt: parsed.t as number })
	} catch {
		return NO_ATTEMPTS
	}
}

/** Minutos y segundos que faltan, redondeando hacia ARRIBA (nunca «0:00» con espera viva). */
export const waitParts = (remainingMs: number): { minutes: number, seconds: number } => {
	const total = Math.max(0, Math.ceil(remainingMs / 1000))
	return { minutes: Math.floor(total / 60), seconds: total % 60 }
}

/** La cuenta atrás tal como se pinta: `0:30`, `4:59`, `60:00`. */
export const formatWait = (remainingMs: number): string => {
	const { minutes, seconds } = waitParts(remainingMs)
	return `${minutes}:${String(seconds).padStart(2, '0')}`
}
