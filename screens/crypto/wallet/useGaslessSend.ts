/**
 * Envío patrocinado: QvaPay paga el fee y el usuario no necesita el nativo de la red.
 *
 * - Solana (USDT/USDC): QvaPay es el fee payer, en el hueco 0 de la tx.
 * - BSC (USDT): no hay hueco de pagador en EVM. La tx sale con gasPrice 0 y un
 *   paymaster BEP-414 la mete en bloque pagando él (lo orquesta TronDealer).
 *
 * Este hook NO firma ni difunde. Solo sostiene el permiso —pedirlo, canjearlo,
 * devolverlo— y le da a `useWalletSendTx` cómo construir (pagador en Solana,
 * gasPrice 0 en BSC) y la función que manda la transacción firmada al backend.
 *
 * La regla dura del flujo: **una transacción patrocinada NUNCA se difunde desde la
 * app**. Va a medio firmar al backend, que la co-firma y la emite. `broadcastSigned`
 * tiene un guard para eso, y `broadcastSolanaTransaction` otro debajo.
 *
 * Un `eligible: false` no es un error: el usuario puede enviar igual pagando su SOL.
 * Por eso el motivo se conserva — de `not_gold` sale el gancho de GOLD y de
 * `quota_exhausted` el aviso de cuándo se renueva.
 *
 * **Nunca se pasa a «pagar» sin saber qué fue del envío gratis.** En Solana no hay nada que
 * impida que entren los dos: la patrocinada y la pagada son transacciones distintas. Así que
 * solo un rechazo que el backend PRUEBA (no llegó a mandarse) suelta el permiso y deja
 * pagar; todo lo demás —sin respuesta, `pending`, `broadcast_failed`, `failed`, `review`,
 * un permiso que caduca en un reintento— se queda como «sin confirmar» y lo aclara la
 * cadena (`lookupSend` busca la tx por su mensaje en el historial del remitente). En BSC no
 * hace falta: patrocinada y pagada comparten nonce, y solo una puede entrar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { walletApi } from '../../../api/walletApi'
import { useIdempotencyKey } from '../../../hooks/useIdempotencyKey'
import { makeIdempotencyKey } from '../../../helpers/idempotency'
import type { AssetView } from '../../../wallet/assets'
import type { GaslessIneligibleReason, SponsorGrant } from '../../../types/domain'
import type { SponsorChain } from '../../../types/domain'
import { classifySubmitFailure, consumesGrant, fallsBackToPaid, grantChain, interpretSubmit, sponsorChainFor } from './gaslessModel'
import { TxNotSentError, TxUnconfirmedError } from './useWalletTx'
import type { TxLookup } from './useWalletTx'

/** Cuánto se espera a que una tx difundida aparezca confirmada. */
const PENDING_DEADLINE_MS = 90_000
const PENDING_INTERVAL_MS = 3_000

export type GaslessPhase =
	| 'off'
	/** Pidiendo permiso. */
	| 'quoting'
	/** Hay permiso: el envío sale gratis. */
	| 'eligible'
	/** No hay, y el motivo decide qué se le cuenta al usuario. */
	| 'ineligible'
	/** Difundida sin confirmar todavía. */
	| 'pending'
	/** Falló sin gastar nada: se devolvió el permiso y el envío pasa a pagarse. */
	| 'failed'

export type GaslessState = {
	phase: GaslessPhase
	grant: SponsorGrant | null
	reason: GaslessIneligibleReason | null
	remainingToday: number | null
	renewsAt: string | null
}

/** Lo que el motor de envío necesita saber del patrocinio. */
export type SponsorBridge = {
	chain: SponsorChain
	/** Solana: pagador de QvaPay para el hueco 0. BSC: null (la tx va con gasPrice 0). */
	feePayer: string | null
	/** Base64 en Solana, raw hex `0x…` en BSC. */
	submit: (tx: string) => Promise<{ txid: string } | { rebuild: true }>
}

export const isSponsorable = (asset: AssetView | undefined): boolean => sponsorChainFor(asset) !== null

export const useGaslessSend = ({ asset, to, amount, enabled = true }: {
	asset: AssetView | undefined
	to: string
	/** Unidades mínimas, como string: lo mismo que viajará en la transacción. */
	amount: string
	enabled?: boolean
}) => {

	const idempotencyKeyRef = useIdempotencyKey()
	const [state, setState] = useState<GaslessState>({ phase: 'off', grant: null, reason: null, remainingToday: null, renewsAt: null })

	// El permiso se devuelve al salir sin usarlo; el ref evita arrastrar el objeto
	// entero a las dependencias de los efectos
	const grantRef = useRef<SponsorGrant | null>(null)
	const spentRef = useRef(false)
	const chain = sponsorChainFor(asset)
	const active = enabled && chain !== null && !!to && !!amount

	useEffect(() => { grantRef.current = state.grant }, [state.grant])

	// --- Pedir el permiso ----------------------------------------------------

	useEffect(() => {
		if (!active || !chain || !asset?.contract) { setState(s => (s.phase === 'off' ? s : { ...s, phase: 'off' })); return }
		let cancelled = false
		setState(s => ({ ...s, phase: 'quoting' }))

		walletApi.gaslessQuote({ chain, asset: asset.contract, to, amount, idempotencyKey: idempotencyKeyRef.current }).then(result => {
			if (cancelled) { return }
			if (!result.success || !result.data) {
				// Sin permiso se envía pagando: un fallo aquí no puede bloquear el envío
				setState({ phase: 'ineligible', grant: null, reason: 'disabled', remainingToday: null, renewsAt: null })
				return
			}
			const payload = result.data
			// Un qpweb anterior a BSC no conoce `chain` y respondería con un permiso de Solana:
			// construir con él una tx de otra red no tiene arreglo, así que se envía pagando.
			// El permiso se devuelve YA: nunca llega al estado, así que la limpieza del
			// desmontaje no lo vería y la cuota del día quedaría retenida hasta que caduque
			if (payload.eligible && grantChain(payload.grant) !== chain) {
				walletApi.gaslessCancel(payload.grant.uuid)
				setState({ phase: 'ineligible', grant: null, reason: 'disabled', remainingToday: null, renewsAt: null })
				return
			}
			if (payload.eligible) {
				setState({ phase: 'eligible', grant: payload.grant, reason: null, remainingToday: payload.remaining_today, renewsAt: payload.renews_at })
			} else {
				setState({ phase: 'ineligible', grant: null, reason: payload.reason, remainingToday: payload.remaining_today ?? null, renewsAt: payload.renews_at ?? null })
			}
		})

		return () => { cancelled = true }
	}, [active, chain, asset?.contract, to, amount, idempotencyKeyRef])

	// --- Devolverlo si no se usa ---------------------------------------------

	useEffect(() => () => {
		const grant = grantRef.current
		// Cancelar devuelve el envío gratis a la cuota del día: salir de la pantalla
		// sin enviar no puede costar el mismo privilegio que enviar
		if (grant && !spentRef.current) { walletApi.gaslessCancel(grant.uuid) }
	}, [])

	// --- Canjearlo -----------------------------------------------------------

	/**
	 * La tx firmada cuyo desenlace no se sabe (Solana). Mientras sea la que el motor vuelve a
	 * mandar, lo que el backend conteste después («no se gastó», «reconstruye», «el permiso
	 * caducó») no prueba nada: pudo entrar en el intento anterior. Quien decide es la cadena
	 * (`lookupSend` busca la tx en el historial del remitente), no este hook.
	 */
	const unresolvedTxRef = useRef<string | null>(null)
	/** El último permiso que llegó a canjearse: es por el que pregunta `resolver.lookup`. */
	const submittedGrantRef = useRef<string | null>(null)

	/** El permiso ya no sirve: se suelta y el envío pasa a pagarse (sin puente, el motor reconstruye la tx como un envío normal). */
	const dropGrant = useCallback((uuid: string, { cancel }: { cancel: boolean }) => {
		grantRef.current = null
		if (cancel) { walletApi.gaslessCancel(uuid) }
		setState({ phase: 'failed', grant: null, reason: null, remainingToday: null, renewsAt: null })
	}, [])

	const pollUntilResolved = useCallback(async (uuid: string): Promise<{ txid: string }> => {
		const deadline = Date.now() + PENDING_DEADLINE_MS
		while (Date.now() < deadline) {
			await new Promise<void>(resolve => setTimeout(resolve, PENDING_INTERVAL_MS))
			const result = await walletApi.gaslessGet(uuid)
			const grant = result.success ? result.data : null
			if (!grant) { continue }
			if (grant.status === 'confirmed' && grant.signature) { return { txid: grant.signature } }
			// Falló o quedó en revisión: aquí no se puede saber si llegó a salir
			if (grant.status === 'failed' || grant.status === 'review') { throw new TxUnconfirmedError() }
		}
		// Se difundió y no se vio confirmar: el backend la sigue, pero aquí no se puede
		// prometer un resultado que no se tiene
		throw new TxUnconfirmedError()
	}, [])

	const submit = useCallback(async (signedTx: string): Promise<{ txid: string } | { rebuild: true }> => {
		const grant = grantRef.current
		if (!grant) { throw new Error('sponsored_no_grant') }
		const chainOfGrant = grantChain(grant)
		// Solo Solana: en BSC la patrocinada y la pagada comparten nonce y solo una puede entrar
		const carriesDoubt = chainOfGrant === 'solana'
		const alreadyUnresolved = carriesDoubt && unresolvedTxRef.current === signedTx
		/** Esta tx pudo salir y no se sabe: el permiso no se devuelve y nada la da por perdida. */
		const leaveUnresolved = (): never => {
			if (carriesDoubt) { unresolvedTxRef.current = signedTx }
			spentRef.current = true
			throw new TxUnconfirmedError()
		}

		submittedGrantRef.current = grant.uuid
		const result = await walletApi.gaslessSubmit(grant.uuid, signedTx)

		if (!result.success || !result.data) {
			const failure = classifySubmitFailure(result)
			if (failure.kind === 'done') {
				spentRef.current = true
				unresolvedTxRef.current = null
				return { txid: failure.txid }
			}
			// El backend rechazó ESTA petición antes de mandar nada. Es «no se envió» salvo que
			// esta misma tx ya hubiera salido antes sin desenlace
			if (failure.kind === 'rejected' && !alreadyUnresolved) {
				if (failure.grantGone) { dropGrant(grant.uuid, { cancel: false }) }
				throw new TxNotSentError(result.success ? 'sponsored_failed' : result.error || 'sponsored_failed')
			}
			return leaveUnresolved()
		}

		const outcome = result.data
		// Marcar el permiso gastado ANTES de decidir qué hacer: si la pantalla se
		// desmonta a mitad, lo que no puede pasar es que se cancele algo ya cobrado
		if (consumesGrant(outcome, chainOfGrant)) { spentRef.current = true }

		const action = interpretSubmit(outcome, chainOfGrant)
		if (action.kind === 'done') {
			unresolvedTxRef.current = null
			return { txid: action.txid }
		}
		if (action.kind === 'poll') {
			// Salió hacia la red y no se vio confirmar: se enseña «confirmando», no «enviado»
			if (carriesDoubt) { unresolvedTxRef.current = signedTx }
			setState(s => ({ ...s, phase: 'pending' }))
			const resolved = await pollUntilResolved(grant.uuid)
			unresolvedTxRef.current = null
			return resolved
		}
		// Con un intento anterior de esta tx sin desenlace, ni «reconstruye» ni «no se gastó»
		// valen: pudo entrar entonces. Y un desenlace que el backend no probó, tampoco
		if (action.kind === 'unknown' || alreadyUnresolved) { return leaveUnresolved() }
		if (action.kind === 'rebuild') { return { rebuild: true } }
		if (fallsBackToPaid(outcome, chainOfGrant)) {
			// Se suelta el permiso ANTES de lanzar: sin puente, el motor reconstruye la tx como
			// un envío normal y la pantalla enseña la comisión de verdad
			dropGrant(grant.uuid, { cancel: true })
			// Definitivo (`authorized` y probado: no se gastó nada): el motor suelta la firma sin preguntar
			throw new TxNotSentError(action.message)
		}
		// `failed` o `review`: en Solana no consta que no saliera (la cadena lo dirá)
		if (carriesDoubt) { return leaveUnresolved() }
		throw new Error(action.message)
	}, [pollUntilResolved, dropGrant])

	// --- Resolver un envío sin desenlace -------------------------------------

	/**
	 * Lo que el motor de envío necesita para aclarar un envío patrocinado del que no hubo
	 * respuesta. `lookup` solo sirve de prueba POSITIVA (el backend lo da por confirmado y
	 * tiene la firma): que NO entró lo dice la cadena, nunca el backend. `dropped`: la cadena
	 * confirmó que no entró ni entrará; el permiso quedó a medias en el servidor y no vale
	 * para otro intento, así que el envío pasa a pagarse.
	 */
	const resolver = useMemo(() => ({
		lookup: async (): Promise<TxLookup> => {
			const uuid = submittedGrantRef.current
			if (!uuid) { return { status: 'unknown' } }
			const result = await walletApi.gaslessGet(uuid)
			const grant = result.success ? result.data : null
			return grant?.status === 'confirmed' && grant.signature ? { status: 'landed', txid: grant.signature } : { status: 'unknown' }
		},
		dropped: () => {
			unresolvedTxRef.current = null
			const uuid = submittedGrantRef.current
			if (uuid && grantRef.current?.uuid === uuid) { dropGrant(uuid, { cancel: false }) }
		},
	}), [dropGrant])

	/** Tras un éxito, la siguiente compra necesita su propia clave. */
	const reset = useCallback(() => {
		idempotencyKeyRef.current = makeIdempotencyKey()
		spentRef.current = false
		grantRef.current = null
	}, [idempotencyKeyRef])

	// También en `pending`: el motor puede tener que volver a mandar la MISMA tx (un
	// reintento), y sin puente la sacaría a la red por su cuenta, que es justo lo que una
	// patrocinada no puede hacer
	const bridge: SponsorBridge | null = (state.phase === 'eligible' || state.phase === 'pending') && state.grant
		? { chain: grantChain(state.grant), feePayer: state.grant.fee_payer, submit }
		: null

	return { state, bridge, submit, reset, resolver }
}

export default useGaslessSend
