/**
 * Envío patrocinado en Solana: QvaPay paga el fee y el usuario no necesita SOL.
 *
 * Este hook NO firma ni difunde. Solo sostiene el permiso —pedirlo, canjearlo,
 * devolverlo— y le da a `useWalletSendTx` dos cosas: la dirección del pagador (para
 * que la transacción se construya con ella en el hueco 0) y la función que manda la
 * transacción firmada al backend.
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
import { consumesGrant, interpretSubmit } from './gaslessModel'

/** Mints que el backend patrocina. Se comprueban aquí solo para no gastar una petición. */
const SPONSORED_SYMBOLS = ['USDT', 'USDC']

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

export type GaslessState = {
	phase: GaslessPhase
	grant: SponsorGrant | null
	reason: GaslessIneligibleReason | null
	remainingToday: number | null
	renewsAt: string | null
}

/** Lo que el motor de envío necesita saber del patrocinio. */
export type SponsorBridge = {
	feePayer: string | null
	submit: (base64: string) => Promise<{ txid: string } | { rebuild: true }>
}

export const isSponsorable = (asset: AssetView | undefined): boolean =>
	asset?.chainKey === 'solana' && !!asset.contract && SPONSORED_SYMBOLS.includes(asset.symbol)

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
	const active = enabled && isSponsorable(asset) && !!to && !!amount

	useEffect(() => { grantRef.current = state.grant }, [state.grant])

	// --- Pedir el permiso ----------------------------------------------------

	useEffect(() => {
		if (!active || !asset?.contract) { setState(s => (s.phase === 'off' ? s : { ...s, phase: 'off' })); return }
		let cancelled = false
		setState(s => ({ ...s, phase: 'quoting' }))

		walletApi.gaslessQuote({ to, mint: asset.contract, amount, idempotencyKey: idempotencyKeyRef.current }).then(result => {
			if (cancelled) { return }
			if (!result.success || !result.data) {
				// Sin permiso se envía pagando: un fallo aquí no puede bloquear el envío
				setState({ phase: 'ineligible', grant: null, reason: 'disabled', remainingToday: null, renewsAt: null })
				return
			}
			const payload = result.data
			if (payload.eligible) {
				setState({ phase: 'eligible', grant: payload.grant, reason: null, remainingToday: payload.remaining_today, renewsAt: payload.renews_at })
			} else {
				setState({ phase: 'ineligible', grant: null, reason: payload.reason, remainingToday: payload.remaining_today ?? null, renewsAt: payload.renews_at ?? null })
			}
		})

		return () => { cancelled = true }
	}, [active, asset?.contract, to, amount, idempotencyKeyRef])

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

	const submit = useCallback(async (base64: string): Promise<{ txid: string } | { rebuild: true }> => {
		const grant = grantRef.current
		if (!grant) { throw new Error('sponsored_no_grant') }

		const result = await walletApi.gaslessSubmit(grant.uuid, base64)
		if (!result.success || !result.data) { throw new Error(result.success ? 'sponsored_failed' : result.error || 'sponsored_failed') }

		const outcome = result.data
		// Marcar el permiso gastado ANTES de decidir qué hacer: si la pantalla se
		// desmonta a mitad, lo que no puede pasar es que se cancele algo ya cobrado
		if (consumesGrant(outcome)) { spentRef.current = true }

		const action = interpretSubmit(outcome)
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
		? { feePayer: state.grant.fee_payer, submit }
		: null

	return { state, bridge, submit, reset }
}

export default useGaslessSend
