/**
 * Motor de "enviar" de la wallet sobre el núcleo común `useWalletTx`
 * (construir → VERIFICAR → firmar → difundir, reintentos, vigencia, doble
 * tap). Aquí vive solo lo propio de un envío: la intención (destino +
 * importe), el nivel de comisión, el patrocinio de Solana y la espera de la
 * energía TRON recién alquilada.
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
import type { SponsorBridge } from './useGaslessSend'
import useWalletTx from './useWalletTx'
import type { SubmitResult, TxPhase } from './useWalletTx'

export type SendPhase = TxPhase

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
	/**
	 * Patrocinio: la tx se construye con el pagador de QvaPay en el hueco 0 y la
	 * difunde el backend. `null` = envío normal, el usuario paga su gas.
	 */
	sponsor?: SponsorBridge | null
}

export const useWalletSendTx = ({ asset, chain, addresses, to, amount, assetId, onSent, describeError, sponsor = null }: Args) => {

	const { t } = useTranslation()
	const queryClient = useQueryClient()

	// Nivel de comisión elegido: cambiarlo reconstruye la tx (nuevo gas/tasa, misma intención)
	const [feeTier, setFeeTier] = useState<FeeTier>('normal')
	// Latch del alquiler de energía: una vez comprada para ESTE envío, el aviso
	// no vuelve a ofrecerla aunque el nodo tarde en ver la delegación. Es la
	// defensa contra el doble cobro que no depende de la red.
	const [energyRented, setEnergyRented] = useState(false)
	/** La delegación no se vio a tiempo: la energía está, pero la red va lenta. */
	const [energySlow, setEnergySlow] = useState(false)
	const mountedRef = useRef(true)
	useEffect(() => () => { mountedRef.current = false }, [])

	const build = useCallback(() => {
		const intent = { chainKey: asset!.chainKey, from: addressForKind(addresses!, asset!.kind), fromPublicKey: addresses!.stxPublicKey, to, amount: parseUnits(amount, asset!.decimals), contract: asset!.contract }
		// Con patrocinio el hueco 0 es de QvaPay: el usuario firma solo el suyo
		return prepareSend(chain!, intent, feeTier, { feePayer: sponsor?.feePayer ?? null })
	}, [asset, addresses, chain, to, amount, feeTier, sponsor?.feePayer])

	const submit = useCallback(async (current: PreparedSend, signed: SignedSend): Promise<SubmitResult> => {
		// Una tx patrocinada NUNCA sale a la red desde aquí: va a medio firmar al
		// backend, que la co-firma y la emite (`broadcastSigned` lo impide además)
		if (sponsor && current.kind === 'solana' && signed.kind === 'solana' && current.inner.sponsored) {
			const outcome = await sponsor.submit(signed.signed.base64)
			// El blockhash caducó antes de llegar: no se gastó nada y el permiso
			// sigue vivo, así que se reconstruye y se vuelve a firmar
			if ('rebuild' in outcome) return { rebuild: true }
			return { txid: outcome.txid, duplicate: false }
		}
		return broadcastSigned(current, signed)
	}, [sponsor])

	const handleSent = useCallback((txid: string, _prepared: PreparedSend, duplicate: boolean) => {
		if (duplicate) toast(t('crypto.wallet.send.alreadySent'))
		queryClient.invalidateQueries({ queryKey: WALLET_BALANCES_KEY })
		// Solo el historial del activo enviado, diferido y saltando la caché del proxy
		refreshHistoryAfterSend(queryClient, assetId)
		onSent(txid)
	}, [queryClient, assetId, onSent, t])

	const core = useWalletTx<PreparedSend, SignedSend>({
		ready: !!asset && !!addresses && !!chain,
		build,
		sign: signPrepared,
		submit,
		onSent: handleSent,
		describeError,
	})
	const { prepared, refresh, setPhase } = core

	/**
	 * La energía ya se compró. No se reconstruye la tx en el acto: la
	 * delegación tarda unos segundos en verse, y cada nodo va a una altura
	 * distinta, así que reconstruir demasiado pronto devolvería el mismo
	 * quemado de antes y el aviso invitaría a comprar otra vez.
	 */
	/**
	 * Se cobró una compra de energía para este envío. Arma el latch y punto: la
	 * entrega puede tardar, fallar o quedarse en revisión, y en cualquiera de
	 * esos casos volver a ofrecer la compra sería un segundo cargo real.
	 */
	const markEnergyRented = useCallback(() => { setEnergyRented(true) }, [])

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
	}, [prepared, refresh, setPhase])

	return {
		...core,
		feeTier,
		setFeeTier,
		markEnergyRented,
		onEnergyRented,
		energyRented,
		energySlow,
	}
}

export default useWalletSendTx
