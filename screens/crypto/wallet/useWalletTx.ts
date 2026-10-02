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
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { isExpiredBroadcastError } from './txExpiry'

export type TxPhase = 'preparing' | 'ready' | 'waitingEnergy' | 'signing' | 'broadcasting' | 'error'

/** Lo mínimo que el núcleo necesita saber de una tx preparada. */
export type PreparedTx = { summary: { expiresAt: number | null } }

/**
 * `rebuild`: la difusión no gastó nada pero la tx ya no vale (p. ej. blockhash caducado): se reconstruye.
 * `note`: la tx entró pero con un matiz que la pantalla de éxito debe contar (TRON: congelado sin voto).
 */
export type SubmitResult = { txid: string, duplicate: boolean, note?: string } | { rebuild: true }

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
}

export const useWalletTx = <P extends PreparedTx, S>({ ready, build, sign, submit, onSent, describeError }: Args<P, S>) => {

	const [phase, setPhase] = useState<TxPhase>('preparing')
	const [prepared, setPrepared] = useState<P | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [authVisible, setAuthVisible] = useState(false)
	const signedRef = useRef<S | null>(null)
	const inFlightRef = useRef(false)

	const prepare = useCallback(async () => {
		if (!ready) return
		setPhase('preparing'); setError(null); signedRef.current = null
		try {
			setPrepared(await build())
			setPhase('ready')
		} catch (err) {
			setPhase('error')
			setError(describeError(err))
		}
	}, [ready, build, describeError])

	useEffect(() => { prepare() }, [prepare])

	const isExpired = useCallback((current: P) => current.summary.expiresAt !== null && current.summary.expiresAt <= Date.now(), [])

	const broadcast = useCallback(async (current: P, signed: S) => {
		setPhase('broadcasting')
		try {
			const result = await submit(current, signed)
			if ('rebuild' in result) {
				signedRef.current = null
				await prepare()
				return
			}
			onSent(result.txid, current, result.duplicate, result.note)
		} catch (err) {
			// La red dio la tx por CADUCADA antes que nuestro reloj: no se ejecutó, así que se
			// reconstruye (y el usuario vuelve a confirmar). Si no, "Reintentar" re-difundiría la
			// misma tx caducada en bucle
			if (isExpiredBroadcastError(err)) {
				signedRef.current = null
				await prepare()
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
			setPhase('signing')
			// Un tick para que el spinner pinte antes del PBKDF2 (síncrono, ~1-2s en Hermes)
			await new Promise<void>(resolve => setTimeout(resolve, 30))
			const signed = signedRef.current ?? await sign(prepared)
			signedRef.current = signed
			await broadcast(prepared, signed)
		} catch (err) {
			setPhase('error')
			setError(describeError(err))
		} finally {
			inFlightRef.current = false
		}
	}, [prepared, prepare, sign, broadcast, isExpired, describeError])

	/**
	 * Reconstruye SIEMPRE, tirando la firma retenida. `retry()` no vale para
	 * esto: con una firma viva y la tx vigente re-difunde la MISMA tx sin pasar
	 * por el gate de autenticación, que es lo correcto para reintentar pero no
	 * para "algo cambió fuera, recalcula".
	 */
	const refresh = useCallback(() => { signedRef.current = null; return prepare() }, [prepare])

	const retry = useCallback(() => {
		// Firmada y aún vigente: re-difundir la MISMA tx; si no, empezar de cero
		if (prepared && signedRef.current && !isExpired(prepared)) {
			if (inFlightRef.current) return
			inFlightRef.current = true
			broadcast(prepared, signedRef.current).finally(() => { inFlightRef.current = false })
			return
		}
		prepare()
	}, [prepared, broadcast, prepare, isExpired])

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
