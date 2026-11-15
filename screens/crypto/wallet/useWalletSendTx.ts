/**
 * Motor de "enviar" de la wallet sobre el núcleo común `useWalletTx`
 * (construir → VERIFICAR → firmar → difundir, reintentos, vigencia, doble
 * tap). Aquí vive solo lo propio de un envío: la intención (destino +
 * importe), el nivel de comisión, el patrocinio (Solana y BSC) y la espera de la
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
import { broadcastSigned, lookupSend, prepareSend, sentRefOf, signedTxid, signPrepared } from './walletSendActions'
import type { FeeTier, PreparedSend, SignedSend } from './walletSendActions'
import type { SentRef } from './sentRef'
import type { SponsorBridge } from './useGaslessSend'
import useWalletTx from './useWalletTx'
import type { DropReason, SubmitResult, TxLookup, TxPhase } from './useWalletTx'

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
	 * Patrocinio: la tx se construye con el pagador de QvaPay en el hueco 0
	 * (Solana) o con gasPrice 0 (BSC) y la difunde el backend. `null` = envío
	 * normal, el usuario paga su gas.
	 */
	sponsor?: SponsorBridge | null
	/**
	 * Cómo aclarar un envío patrocinado del que no hubo respuesta (`useGaslessSend.resolver`):
	 * `lookup` pregunta al backend (solo vale como prueba de que SÍ entró) y `dropped` avisa
	 * de que la cadena confirmó que no entró, para soltar el permiso y pasar a pagar.
	 */
	sponsorResolver?: { lookup: () => Promise<TxLookup>, dropped: () => void } | null
	/**
	 * El envío firmado está a punto de salir hacia la red, con su hash calculado en el
	 * teléfono (null: patrocinado en Solana, aún sin él) y con qué preguntar después a la
	 * cadena por él (`ref`; null si no hay con qué). Se espera antes de difundir.
	 */
	onAttempt?: (txid: string | null, ref: SentRef | null) => void | Promise<void>
	/** Consta que ese envío NO entró ni entrará. */
	onDropped?: () => void
}

/** ¿Esta tx la paga QvaPay? (Solana y BSC; el resto nunca se patrocina desde Enviar). */
const isSponsoredTx = (prepared: PreparedSend): boolean => (prepared.kind === 'solana' || prepared.kind === 'evm') && prepared.inner.sponsored === true

export const useWalletSendTx = ({ asset, chain, addresses, to, amount, assetId, onSent, describeError, sponsor = null, sponsorResolver = null, onAttempt, onDropped }: Args) => {

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
		// Con patrocinio en Solana el hueco 0 es de QvaPay: el usuario firma solo el suyo.
		// En BSC no hay hueco de pagador: la tx va con gasPrice 0 y la paga el paymaster
		return prepareSend(chain!, intent, feeTier, { feePayer: sponsor?.feePayer ?? null, zeroGas: sponsor?.chain === 'bsc' })
	}, [asset, addresses, chain, to, amount, feeTier, sponsor?.feePayer, sponsor?.chain])

	const submit = useCallback(async (current: PreparedSend, signed: SignedSend): Promise<SubmitResult> => {
		// Una tx patrocinada NUNCA sale a la red desde aquí: va a medio firmar al
		// backend, que la co-firma y la emite (`broadcastSigned` lo impide además)
		const sponsoredTx = !sponsor ? null
			: current.kind === 'solana' && signed.kind === 'solana' && current.inner.sponsored ? signed.signed.base64
				: current.kind === 'evm' && signed.kind === 'evm' && current.inner.sponsored ? signed.signed.raw
					: null
		if (sponsor && sponsoredTx) {
			const outcome = await sponsor.submit(sponsoredTx)
			// No se gastó nada y el permiso sigue vivo (Solana: caducó el blockhash; BSC:
			// el nonce ya se usó), así que se reconstruye y se vuelve a firmar
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

	const handleAttempt = useCallback((current: PreparedSend, signed: SignedSend) => onAttempt?.(signedTxid(current, signed), sentRefOf(current, signed)), [onAttempt])

	// Primero la cadena, que es la que puede decir tanto que entró como que ya no entrará.
	// Si no lo sabe y el envío era patrocinado, el backend puede aportar la prueba positiva
	const lookup = useCallback(async (current: PreparedSend, signed: SignedSend): Promise<TxLookup> => {
		const onChain = await lookupSend(current, signed)
		if (onChain.status !== 'unknown' || !sponsorResolver || !isSponsoredTx(current)) return onChain
		return sponsorResolver.lookup().catch((): TxLookup => ({ status: 'unknown' }))
	}, [sponsorResolver])

	const handleDropped = useCallback((current: PreparedSend, _signed: SignedSend, why: DropReason) => {
		// Solo cuando lo dice la CADENA: en `rebuild` el permiso sigue vivo y en `rejected` ya lo gestionó el patrocinio
		if (why === 'chain' && isSponsoredTx(current)) sponsorResolver?.dropped()
		onDropped?.()
	}, [sponsorResolver, onDropped])

	const core = useWalletTx<PreparedSend, SignedSend>({
		ready: !!asset && !!addresses && !!chain,
		build,
		sign: signPrepared,
		submit,
		onSent: handleSent,
		describeError,
		// Antes de firmar otra tx tras una difusión sin respuesta: ¿entró la anterior?
		lookup,
		onAttempt: handleAttempt,
		onDropped: handleDropped,
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
