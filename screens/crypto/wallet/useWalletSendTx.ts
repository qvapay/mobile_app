/**
 * Motor de "enviar" de la wallet: construir → VERIFICAR → firmar → difundir, con sus
 * reintentos.
 *
 * Reglas que este hook sostiene (y por las que vive separado del JSX):
 * - Lo que la pantalla muestra sale de la tx CONSTRUIDA, no del formulario.
 * - La firma se retiene en un ref para poder re-difundir la MISMA tx (mismo hash) cuando
 *   la difusión falla por red; un doble tap nunca firma dos veces (`inFlightRef`).
 * - Si la tx tiene vigencia (TRON ~60 s, el blockhash de Solana) y expiró, se reconstruye
 *   desde cero antes de firmar: firmar una tx caducada es tirar la firma.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import { useQueryClient } from '@tanstack/react-query'

import { addressForKind } from '../../../wallet/assets'
import { parseUnits } from '../../../wallet/chains/units'
import { getAppRpcRouter } from '../../../wallet/registry/appRpcRouter'
import { getTronResources, TRON_TX_RPC } from '../../../wallet/tron/tx'
import type { AssetView } from '../../../wallet/assets'
import type { WalletAddresses } from '../../../wallet/derive'
import type { RegistryChain } from '../../../wallet/registry/types'
import { refreshHistoryAfterSend, WALLET_BALANCES_KEY } from './walletQueries'
import { broadcastSigned, prepareSend, signPrepared } from './walletSendActions'
import type { FeeTier, PreparedSend, SignedSend } from './walletSendActions'

export type SendPhase = 'preparing' | 'ready' | 'waitingEnergy' | 'signing' | 'broadcasting' | 'error'

/** Cuánto se espera a que un nodo vea la energía recién delegada antes de rendirse. */
const ENERGY_WAIT_DEADLINE_MS = 45_000
const ENERGY_WAIT_INTERVAL_MS = 2_000

type Args = {
	asset: AssetView | undefined
	chain: RegistryChain | undefined
	addresses: WalletAddresses | null | undefined
	to: string
	amount: string
	assetId: string
	/** La tx llegó a la red: la pantalla navega al éxito. */
	onSent: (txid: string) => void
	describeError: (err: unknown) => string
}

export const useWalletSendTx = ({ asset, chain, addresses, to, amount, assetId, onSent, describeError }: Args) => {

	const { t } = useTranslation()
	const queryClient = useQueryClient()

	const [phase, setPhase] = useState<SendPhase>('preparing')
	const [prepared, setPrepared] = useState<PreparedSend | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [authVisible, setAuthVisible] = useState(false)
	// Nivel de comisión elegido: cambiarlo reconstruye la tx (nuevo gas/tasa, misma intención)
	const [feeTier, setFeeTier] = useState<FeeTier>('normal')
	const signedRef = useRef<SignedSend | null>(null)
	const inFlightRef = useRef(false)
	// Latch del alquiler de energía: una vez comprada para ESTE envío, el aviso
	// no vuelve a ofrecerla aunque el nodo tarde en ver la delegación. Es la
	// defensa contra el doble cobro que no depende de la red.
	const [energyRented, setEnergyRented] = useState(false)
	/** La delegación no se vio a tiempo: la energía está, pero la red va lenta. */
	const [energySlow, setEnergySlow] = useState(false)
	const mountedRef = useRef(true)
	useEffect(() => () => { mountedRef.current = false }, [])

	const prepare = useCallback(async () => {
		if (!asset || !addresses || !chain) return
		setPhase('preparing'); setError(null); signedRef.current = null
		try {
			const intent = { chainKey: asset.chainKey, from: addressForKind(addresses, asset.kind), fromPublicKey: addresses.stxPublicKey, to, amount: parseUnits(amount, asset.decimals), contract: asset.contract }
			setPrepared(await prepareSend(chain, intent, feeTier))
			setPhase('ready')
		} catch (err) {
			setPhase('error')
			setError(describeError(err))
		}
	}, [asset, addresses, chain, to, amount, feeTier, describeError])

	useEffect(() => { prepare() }, [prepare])

	const isExpired = useCallback((current: PreparedSend) => current.summary.expiresAt !== null && current.summary.expiresAt <= Date.now(), [])

	const finish = useCallback((txid: string) => {
		queryClient.invalidateQueries({ queryKey: WALLET_BALANCES_KEY })
		// Solo el historial del activo enviado, diferido y saltando la caché del proxy
		refreshHistoryAfterSend(queryClient, assetId)
		onSent(txid)
	}, [queryClient, assetId, onSent])

	const broadcast = useCallback(async (current: PreparedSend, signed: SignedSend) => {
		setPhase('broadcasting')
		try {
			const result = await broadcastSigned(current, signed)
			if (result.duplicate) toast(t('crypto.wallet.send.alreadySent'))
			finish(result.txid)
		} catch (err) {
			setPhase('error')
			setError(describeError(err))
		}
	}, [finish, t, describeError])

	const onAuthorized = useCallback(async () => {
		setAuthVisible(false)
		if (!prepared || inFlightRef.current) return
		inFlightRef.current = true
		try {
			if (isExpired(prepared)) { await prepare(); return }
			setPhase('signing')
			// Un tick para que el spinner pinte antes del PBKDF2 (síncrono, ~1-2s en Hermes)
			await new Promise<void>(resolve => setTimeout(resolve, 30))
			const signed = signedRef.current ?? await signPrepared(prepared)
			signedRef.current = signed
			await broadcast(prepared, signed)
		} catch (err) {
			setPhase('error')
			setError(describeError(err))
		} finally {
			inFlightRef.current = false
		}
	}, [prepared, prepare, broadcast, isExpired, describeError])

	/**
	 * Reconstruye la tx SIEMPRE, tirando la firma retenida. `retry()` no vale
	 * para esto: con una firma viva y la tx aún vigente re-difunde la MISMA
	 * transacción sin pasar por el gate de autenticación, que es lo correcto
	 * para el botón de reintentar pero no para "he comprado energía, recalcula".
	 */
	const refresh = useCallback(() => { signedRef.current = null; return prepare() }, [prepare])

	/**
	 * La energía ya se compró. No se reconstruye la tx en el acto: la
	 * delegación tarda unos segundos en verse, y cada nodo va a una altura
	 * distinta, así que reconstruir demasiado pronto devolvería el mismo
	 * quemado de antes y el aviso invitaría a comprar otra vez.
	 */
	const onEnergyRented = useCallback(async () => {
		setEnergyRented(true)
		setEnergySlow(false)
		const current = prepared
		if (!current || current.kind !== 'tron') { refresh(); return }
		const needed = current.inner.fee.energyNeeded
		const from = current.intent.from
		setPhase('waitingEnergy')
		const deadline = Date.now() + ENERGY_WAIT_DEADLINE_MS
		while (Date.now() < deadline && mountedRef.current) {
			try {
				const resources = await getAppRpcRouter().call('tron', (rpc, signal) => getTronResources(rpc, from, { signal }), { accept: TRON_TX_RPC })
				if (resources.energy >= needed) { await refresh(); return }
			} catch { /* nodo caído o rezagado: se vuelve a preguntar */ }
			await new Promise<void>(resolve => setTimeout(resolve, ENERGY_WAIT_INTERVAL_MS))
		}
		if (!mountedRef.current) { return }
		setEnergySlow(true)
		await refresh()
	}, [prepared, refresh])

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
		prepared,
		error,
		feeTier,
		setFeeTier,
		authVisible,
		openAuth: useCallback(() => setAuthVisible(true), []),
		closeAuth: useCallback(() => setAuthVisible(false), []),
		onAuthorized,
		retry,
		refresh,
		onEnergyRented,
		energyRented,
		energySlow,
		busy: phase === 'signing' || phase === 'broadcasting' || phase === 'waitingEnergy',
	}
}

export default useWalletSendTx
