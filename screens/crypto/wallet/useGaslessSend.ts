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
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { walletApi } from '../../../api/walletApi'
import { useIdempotencyKey } from '../../../hooks/useIdempotencyKey'
import { makeIdempotencyKey } from '../../../helpers/idempotency'
import type { AssetView } from '../../../wallet/assets'
import type { GaslessIneligibleReason, SponsorGrant } from '../../../types/domain'
import type { SponsorChain } from '../../../types/domain'
import { consumesGrant, fallsBackToPaid, grantChain, interpretSubmit, sponsorChainFor } from './gaslessModel'

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

	const pollUntilResolved = useCallback(async (uuid: string): Promise<{ txid: string } | { rebuild: true }> => {
		const deadline = Date.now() + PENDING_DEADLINE_MS
		while (Date.now() < deadline) {
			await new Promise<void>(resolve => setTimeout(resolve, PENDING_INTERVAL_MS))
			const result = await walletApi.gaslessGet(uuid)
			const grant = result.success ? result.data : null
			if (!grant) { continue }
			if (grant.status === 'confirmed' && grant.signature) { return { txid: grant.signature } }
			if (grant.status === 'failed' || grant.status === 'review') { throw new Error(grant.reason || 'sponsored_failed') }
		}
		// Se difundió y no se vio confirmar: el backend la sigue, pero aquí no se puede
		// prometer un resultado que no se tiene
		throw new Error('sponsored_pending')
	}, [])

	const submit = useCallback(async (signedTx: string): Promise<{ txid: string } | { rebuild: true }> => {
		const grant = grantRef.current
		if (!grant) { throw new Error('sponsored_no_grant') }

		const result = await walletApi.gaslessSubmit(grant.uuid, signedTx)
		if (!result.success || !result.data) { throw new Error(result.success ? 'sponsored_failed' : result.error || 'sponsored_failed') }

		const outcome = result.data
		// Marcar el permiso gastado ANTES de decidir qué hacer: si la pantalla se
		// desmonta a mitad, lo que no puede pasar es que se cancele algo ya cobrado
		if (consumesGrant(outcome)) { spentRef.current = true }

		const action = interpretSubmit(outcome)
		if (action.kind === 'error' && fallsBackToPaid(outcome)) {
			// Se suelta el permiso ANTES de lanzar: sin puente, el motor reconstruye la tx como
			// un envío normal y la pantalla enseña la comisión de verdad
			grantRef.current = null
			walletApi.gaslessCancel(grant.uuid)
			setState({ phase: 'failed', grant: null, reason: null, remainingToday: null, renewsAt: null })
			throw new Error(action.message)
		}
		if (action.kind === 'done') { return { txid: action.txid } }
		if (action.kind === 'rebuild') { return { rebuild: true } }
		if (action.kind === 'poll') {
			setState(s => ({ ...s, phase: 'pending' }))
			return pollUntilResolved(grant.uuid)
		}
		throw new Error(action.message)
	}, [pollUntilResolved])

	/** Tras un éxito, la siguiente compra necesita su propia clave. */
	const reset = useCallback(() => {
		idempotencyKeyRef.current = makeIdempotencyKey()
		spentRef.current = false
		grantRef.current = null
	}, [idempotencyKeyRef])

	const bridge: SponsorBridge | null = state.phase === 'eligible' && state.grant
		? { chain: grantChain(state.grant), feePayer: state.grant.fee_payer, submit }
		: null

	return { state, bridge, submit, reset }
}

export default useGaslessSend
