/**
 * Swap QUSD en la wallet → saldo (`POST /swap` direction in): la app construye una tx
 * PATROCINADA (fee 0, authType sponsored) de transferencia SIP-010 a la tesorería, la
 * verifica re-parseando (regla 6), la firma tras el gate de la wallet (PIN/biometría) y
 * manda el hex al backend — NUNCA la difunde: la co-firma y paga la fee la tesorería.
 *
 * La firma se retiene en un ref solo para reenviar el MISMO hex si la petición falló por
 * red (misma clave de idempotencia); si el backend responde `reason: 'nonce'` (otro envío
 * consumió el nonce), se reconstruye y re-firma desde cero.
 */

import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWallet } from '../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { AllRpcsFailedError } from '../../../wallet/registry/rpcRouter'
import { StacksVerifyError } from '../../../wallet/stacks/tx'
import { prepareSend, signPrepared } from './walletSendActions'
import type { PreparedSend, SignedSend } from './walletSendActions'
import { swapApi } from '../../../api/swapApi'
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, safeRetryHint } from '../../../helpers/idempotency'
import type { AssetView } from '../../../wallet/assets'
import type { Swap, SwapPair } from '../../../types/domain'

export type SwapInPhase = 'idle' | 'preparing' | 'ready' | 'signing' | 'submitting' | 'error'

type Args = {
	pair: SwapPair | null
	asset: AssetView | undefined
	/** Unidades mínimas del token (múltiplo de 10^(decimals−2): centavos enteros). */
	amountUnits: bigint | null
	/** USD con dos decimales (lo que viaja al backend). */
	amount: string
	onCreated: (swap: Swap) => void
}

export default function useSwapIn({ pair, asset, amountUnits, amount, onCreated }: Args) {

	const { t } = useTranslation()
	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()

	const [phase, setPhase] = useState<SwapInPhase>('idle')
	const [error, setError] = useState<string | null>(null)
	/** Motivo estructurado del último fallo (para ofrecer el reintento correcto). */
	const [reason, setReason] = useState<string | null>(null)
	const [authVisible, setAuthVisible] = useState(false)
	const preparedRef = useRef<PreparedSend | null>(null)
	const signedRef = useRef<SignedSend | null>(null)
	const inFlightRef = useRef(false)
	const idempotencyKeyRef = useRef(makeIdempotencyKey())

	const describe = useCallback((err: unknown): string => {
		if (err instanceof StacksVerifyError) return t('crypto.wallet.send.errors.verifyFailed')
		if (err instanceof AllRpcsFailedError) return t('crypto.wallet.send.errors.noNodes')
		const message = (err as Error)?.message ?? ''
		return message ? t('crypto.wallet.send.errors.generic', { message }) : t('crypto.wallet.send.errors.unknown')
	}, [t])

	const prepare = useCallback(async (): Promise<PreparedSend | null> => {
		if (!pair || !asset || !addresses || amountUnits === null) return null
		if (!addresses.stx || !addresses.stxPublicKey) throw new Error(t('crypto.wallet.swap.errors.noStacksKey'))
		const chain = registry.chains[asset.chainKey]
		const intent = { chainKey: asset.chainKey, from: addresses.stx, fromPublicKey: addresses.stxPublicKey, to: pair.treasury, amount: amountUnits, contract: pair.asset }
		return prepareSend(chain, intent, 'normal', { sponsored: true })
	}, [pair, asset, addresses, amountUnits, registry, t])

	const submit = useCallback(async (hex: string) => {
		if (!pair) return
		setPhase('submitting')
		const result = await callWithDuplicateRetry(() => swapApi.create({ direction: 'in', pair: pair.id, amount, signedTx: hex, asset: pair.asset, idempotencyKey: idempotencyKeyRef.current }))
		if (result.success && result.data?.data) {
			idempotencyKeyRef.current = makeIdempotencyKey()
			preparedRef.current = null; signedRef.current = null
			setPhase('idle')
			onCreated(result.data.data)
			return
		}
		const failure = result.success ? null : result
		const details = failure?.details as { code?: string, reason?: string } | undefined
		setPhase('error')
		if (isNetworkFailure(result)) {
			// El hex firmado se conserva: reintentar reenvía la MISMA tx con la misma clave
			setReason('network')
			setError(`${failure?.error || t('errors.network')}. ${safeRetryHint()}`)
			return
		}
		// Nonce consumido / tx caducada: hay que reconstruir y re-firmar
		if (details?.reason === 'nonce' || details?.code === 'ORIGIN_NONCE_MISMATCH' || details?.code === 'DUPLICATE_ORIGIN_NONCE') {
			preparedRef.current = null; signedRef.current = null
			idempotencyKeyRef.current = makeIdempotencyKey()
		}
		setReason(details?.reason ?? details?.code ?? 'rejected')
		setError(failure?.error || t('crypto.wallet.swap.errors.createFailed'))
	}, [pair, amount, onCreated, t])

	/** CTA: construye (o reutiliza) la tx y abre el gate de la wallet. */
	const start = useCallback(async () => {
		if (inFlightRef.current) return
		inFlightRef.current = true
		try {
			setError(null); setReason(null)
			if (!preparedRef.current) {
				setPhase('preparing')
				preparedRef.current = await prepare()
				if (!preparedRef.current) { setPhase('idle'); return }
			}
			setPhase('ready')
			setAuthVisible(true)
		} catch (err) {
			setPhase('error')
			setError(describe(err))
		} finally { inFlightRef.current = false }
	}, [prepare, describe])

	const onAuthorized = useCallback(async () => {
		setAuthVisible(false)
		const prepared = preparedRef.current
		if (!prepared || inFlightRef.current) return
		inFlightRef.current = true
		try {
			setPhase('signing')
			await new Promise<void>(resolve => setTimeout(resolve, 30))
			// Firma UNA vez: un doble tap reenvía el mismo hex
			const signed = signedRef.current ?? await signPrepared(prepared)
			signedRef.current = signed
			if (signed.kind !== 'stacks') throw new Error('wallet: firma de otra cadena')
			await submit(signed.signed.hex)
		} catch (err) {
			setPhase('error')
			setError(describe(err))
		} finally { inFlightRef.current = false }
	}, [submit, describe])

	const retry = useCallback(() => {
		const signed = signedRef.current
		if (signed && signed.kind === 'stacks' && reason === 'network') { submit(signed.signed.hex); return }
		start()
	}, [reason, submit, start])

	/** Un cambio de importe invalida lo preparado. */
	const reset = useCallback(() => { preparedRef.current = null; signedRef.current = null; setPhase('idle'); setError(null); setReason(null) }, [])

	return { phase, error, reason, authVisible, closeAuth: () => setAuthVisible(false), start, onAuthorized, retry, reset }
}
