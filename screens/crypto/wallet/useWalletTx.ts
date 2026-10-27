/**
 * Núcleo de toda transacción firmada en la wallet: construir → VERIFICAR →
 * firmar → difundir, con sus reintentos. Lo usan Enviar (`useWalletSendTx`)
 * y el staking (`WalletStakeAction`); cada uno aporta cómo construir, firmar
 * y difundir su tx, y este hook sostiene las reglas comunes:
 *
 * - Lo que la pantalla muestra sale de la tx CONSTRUIDA (`prepared.summary`).
 * - La firma se retiene en un ref para re-difundir la MISMA tx (mismo hash)
 *   cuando la difusión falla por red; un doble tap nunca firma dos veces.
 * - Si la tx tiene vigencia (TRON ~60 s, blockhash de Solana) y expiró, se
 *   reconstruye antes de firmar: firmar una tx caducada es tirar la firma. Y si es la RED
 *   la que la da por caducada al difundir (antes que nuestro reloj), también.
 * - Pero una firma que YA salió hacia la red no se tira sin preguntar a la cadena qué fue de
 *   ella (`lookup`): un fallo de red al difundir es ambiguo (el nodo pudo aceptarla y perderse
 *   la respuesta), "caducada" al re-difundir no prueba que no se ejecutara (java-tron valida la
 *   expiración antes que el duplicado) y nuestro reloj de Solana se adelanta a la red. Construir
 *   otra sin mirar es que el usuario confirme y pague dos veces.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { TxLookup } from '../../../wallet/chains/txLookup'
import { isExpiredBroadcastError } from './txExpiry'

export type TxPhase = 'preparing' | 'ready' | 'waitingEnergy' | 'signing' | 'broadcasting' | 'error'

/** Lo mínimo que el núcleo necesita saber de una tx preparada. */
export type PreparedTx = { summary: { expiresAt: number | null } }

/**
 * `rebuild`: la difusión no gastó nada pero la tx ya no vale (p. ej. blockhash caducado): se reconstruye.
 * `note`: la tx entró pero con un matiz que la pantalla de éxito debe contar (TRON: congelado sin voto).
 */
export type SubmitResult = { txid: string, duplicate: boolean, note?: string } | { rebuild: true }

export type { TxLookup }

const UNKNOWN: TxLookup = { status: 'unknown' }

/** La tx anterior quizá se ejecutó y aún no se puede saber: no se firma otra todavía. */
export class TxUnconfirmedError extends Error {
	constructor() { super('wallet: la transacción anterior pudo enviarse; aún no se puede confirmar'); this.name = 'TxUnconfirmedError' }
}

/**
 * Rechazo DEFINITIVO de la difusión: consta que no se gastó nada (p. ej. el backend niega el
 * patrocinio con `authorized`). `submit` lo lanza para que el motor suelte la firma sin
 * preguntar a la cadena y deje reconstruir; su `message` es lo que ve el usuario.
 */
export class TxNotSentError extends Error {
	constructor(message: string) { super(message); this.name = 'TxNotSentError' }
}

type Args<P extends PreparedTx, S> = {
	/** false = faltan datos (activo, direcciones…): no se construye y la fase queda en `preparing`. */
	ready: boolean
	/** Construye y verifica. Su identidad define cuándo se reconstruye: memoizarla con sus deps. */
	build: () => Promise<P>
	sign: (prepared: P) => Promise<S>
	submit: (prepared: P, signed: S) => Promise<SubmitResult>
	/** La tx llegó a la red. `duplicate`: ya estaba (re-difusión de la misma firma). */
	onSent: (txid: string, prepared: P, duplicate: boolean, note?: string) => void
	describeError: (err: unknown) => string
	/**
	 * Pregunta a la cadena por una tx ya difundida antes de tirar su firma. Sin él la respuesta
	 * es siempre `unknown`: una firma difundida no se sustituye nunca, se re-difunde.
	 */
	lookup?: (prepared: P, signed: S) => Promise<TxLookup>
}

export const useWalletTx = <P extends PreparedTx, S>({ ready, build, sign, submit, onSent, describeError, lookup }: Args<P, S>) => {

	const [phase, setPhase] = useState<TxPhase>('preparing')
	const [prepared, setPrepared] = useState<P | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [authVisible, setAuthVisible] = useState(false)
	/**
	 * La firma retenida JUNTO a la tx que firma: re-difundir una firma con otra tx (la que un
	 * refresco dejara en `prepared`) es mandar algo inválido y anotar el intento equivocado.
	 */
	const signedRef = useRef<{ prepared: P, signed: S } | null>(null)
	/** Firmando o difundiendo: mientras, nada reconstruye la tx (la de pantalla es la que sale). */
	const lockedRef = useRef(false)
	/** La última firma que salió hacia la red y de la que no consta el resultado. */
	const attemptRef = useRef<{ prepared: P, signed: S } | null>(null)
	/** La consulta en curso sobre `attemptRef`: quien llegue mientras tanto espera la MISMA. */
	const resolvingRef = useRef<Promise<boolean> | null>(null)
	/** Cada `prepare` lleva su número: solo el último puede dejar su tx preparada. */
	const prepareGenRef = useRef(0)
	const inFlightRef = useRef(false)
	// Espejos: `prepare` es dependencia del efecto de construcción y no debe cambiar con ellos
	const lookupRef = useRef(lookup)
	const onSentRef = useRef(onSent)
	useEffect(() => { lookupRef.current = lookup; onSentRef.current = onSent }, [lookup, onSent])

	/**
	 * Antes de construir otra tx: ¿qué fue de la que ya se difundió? Si entró, cuenta como
	 * enviada; si ya nunca entrará, se puede construir otra; si no se sabe, se espera.
	 *
	 * @returns true si se puede construir otra tx.
	 */
	const resolveAttempt = useCallback((): Promise<boolean> => {
		// «Reintentar» y una reconstrucción por cambio de datos pueden llegar a la vez: una
		// sola consulta, o una respuesta vieja podría tirar un intento posterior
		if (resolvingRef.current) return resolvingRef.current
		const attempt = attemptRef.current
		if (!attempt) return Promise.resolve(true)
		const run = (async (): Promise<boolean> => {
			setPhase('preparing'); setError(null)
			const outcome = lookupRef.current ? await lookupRef.current(attempt.prepared, attempt.signed).catch(() => UNKNOWN) : UNKNOWN
			// Lo que se sepa de ESTE intento no vale si mientras tanto salió otro
			if (attemptRef.current !== attempt) return false
			if (outcome.status === 'landed') {
				attemptRef.current = null; signedRef.current = null
				onSentRef.current(outcome.txid, attempt.prepared, true)
				return false
			}
			if (outcome.status === 'dropped') {
				attemptRef.current = null
				return true
			}
			setPhase('error')
			setError(describeError(new TxUnconfirmedError()))
			return false
		})()
		resolvingRef.current = run
		run.finally(() => { if (resolvingRef.current === run) resolvingRef.current = null })
		return run
	}, [describeError])

	/** `internal`: lo pide el propio motor tras una difusión (rebuild, caducada), aun con el cerrojo. */
	const prepare = useCallback(async ({ internal = false }: { internal?: boolean } = {}) => {
		if (!ready) return
		// Un refresco de fondo no sustituye la tx mientras se firma o se difunde
		if (lockedRef.current && !internal) return
		const gen = ++prepareGenRef.current
		if (!(await resolveAttempt())) return
		// Otro `prepare` posterior (reintento, cambio de datos) manda: este ya no deja nada
		if (prepareGenRef.current !== gen) return
		setPhase('preparing'); setError(null); signedRef.current = null
		try {
			const next = await build()
			// Una tx construida mientras otra salía a la red no se ofrece para firmar
			if (prepareGenRef.current !== gen || attemptRef.current) return
			setPrepared(next)
			setPhase('ready')
		} catch (err) {
			if (prepareGenRef.current !== gen) return
			setPhase('error')
			setError(describeError(err))
		}
	}, [ready, build, describeError, resolveAttempt])

	useEffect(() => { prepare() }, [prepare])

	const isExpired = useCallback((current: P) => current.summary.expiresAt !== null && current.summary.expiresAt <= Date.now(), [])

	const broadcast = useCallback(async (current: P, signed: S) => {
		setPhase('broadcasting')
		attemptRef.current = { prepared: current, signed }
		try {
			const result = await submit(current, signed)
			if ('rebuild' in result) {
				// Respuesta definitiva de que no se gastó nada (patrocinio): sin nada que resolver
				attemptRef.current = null
				signedRef.current = null
				await prepare({ internal: true })
				return
			}
			attemptRef.current = null
			onSent(result.txid, current, result.duplicate, result.note)
		} catch (err) {
			// Consta que no se gastó nada: la firma se suelta y se puede construir otra
			if (err instanceof TxNotSentError) {
				attemptRef.current = null
				signedRef.current = null
				setPhase('error')
				setError(describeError(err))
				return
			}
			// La red dio la tx por CADUCADA: ya no puede entrar, pero pudo entrar ANTES (una
			// difusión previa sin respuesta). `prepare` pregunta a la cadena antes de construir
			// otra; re-difundir esta, en cambio, daría "caducada" en bucle
			if (isExpiredBroadcastError(err)) {
				signedRef.current = null
				await prepare({ internal: true })
				return
			}
			setPhase('error')
			setError(describeError(err))
		}
	}, [submit, prepare, onSent, describeError])

	const onAuthorized = useCallback(async () => {
		setAuthVisible(false)
		if (!prepared || inFlightRef.current) return
		inFlightRef.current = true
		try {
			if (isExpired(prepared)) { await prepare(); return }
			lockedRef.current = true
			// Lo que se estuviera construyendo ya no se ofrece: se firma la tx de pantalla
			prepareGenRef.current += 1
			setPhase('signing')
			// Un tick para que el spinner pinte antes del PBKDF2 (síncrono, ~1-2s en Hermes)
			await new Promise<void>(resolve => setTimeout(resolve, 30))
			const held = signedRef.current?.prepared === prepared ? signedRef.current : null
			const signed = held ? held.signed : await sign(prepared)
			signedRef.current = { prepared, signed }
			await broadcast(prepared, signed)
		} catch (err) {
			setPhase('error')
			setError(describeError(err))
		} finally {
			lockedRef.current = false
			inFlightRef.current = false
		}
	}, [prepared, prepare, sign, broadcast, isExpired, describeError])

	/**
	 * Reconstruye SIEMPRE, tirando la firma retenida. `retry()` no vale para
	 * esto: con una firma viva y la tx vigente re-difunde la MISMA tx sin pasar
	 * por el gate de autenticación, que es lo correcto para reintentar pero no
	 * para "algo cambió fuera, recalcula".
	 */
	const refresh = useCallback(() => {
		if (lockedRef.current) return Promise.resolve()
		signedRef.current = null
		return prepare()
	}, [prepare])

	const retry = useCallback(() => {
		if (inFlightRef.current) return
		// Firmada y aún vigente: re-difundir la MISMA tx con SU firma; si no, empezar de cero
		const held = signedRef.current
		inFlightRef.current = true
		if (held && !isExpired(held.prepared)) {
			lockedRef.current = true
			broadcast(held.prepared, held.signed).finally(() => { lockedRef.current = false; inFlightRef.current = false })
			return
		}
		// Puede preguntar a la cadena por la tx anterior: un doble tap no pregunta dos veces
		prepare().finally(() => { inFlightRef.current = false })
	}, [broadcast, prepare, isExpired])

	return {
		phase,
		/** Para fases propias del caller (TRON: esperar la energía recién comprada). */
		setPhase,
		prepared,
		error,
		authVisible,
		openAuth: useCallback(() => setAuthVisible(true), []),
		closeAuth: useCallback(() => setAuthVisible(false), []),
		onAuthorized,
		retry,
		refresh,
		busy: phase === 'signing' || phase === 'broadcasting' || phase === 'waitingEnergy',
	}
}

export default useWalletTx
