/**
 * Orquesta la parte de intercambio de la pantalla: cotizar mientras se teclea, revisar y
 * abrir la operación.
 *
 * Hermano de `useSwapFlow` (el motor QUSD): la pantalla es una sola y elige entre los dos
 * según el par que el usuario haya escogido. Lo que sigue después de abrir la operación NO
 * está aquí — es un envío normal de la wallet, y de eso se encarga `WalletSendConfirm`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner-native'
import i18n from '../../../i18n'

// Wallet
import { addressForKind } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import type { WalletAddresses } from '../../../wallet/derive'

// Local
import { checkAmount, quoteOfRoute, routesFrom, selectRoute } from './exchangeModel'
import { onchainQuoteParams } from './onchainSwapModel'
import { useExchangeQuoteQuery } from './exchangeQueries'
import useExchangeOrder from './useExchangeOrder'

// Tipos
import type { ExchangeOrder, ExchangeRoute } from '../../../types/domain'

/** Se espera a que el usuario pare de teclear antes de gastar el bucket de cotización. */
export const QUOTE_DEBOUNCE_MS = 500

export type ExchangeFlowInput = {
	from: AssetView | null
	to: AssetView | null
	amountText: string
	addresses: WalletAddresses | null
	/** Saldos por assetId, para el aviso de origen más barato. */
	balances?: Record<string, string | number>
	/** Motivo del backend si alguno de los dos activos no se puede intercambiar. */
	unsupportedReason?: string | null
	onOpened: (order: ExchangeOrder) => void
	/**
	 * La ruta elegida es ON-CHAIN (LI.FI, Jupiter): no hay operación que abrir ni depósito,
	 * se firma desde la wallet en su propia pantalla. `amount` es el importe COTIZADO.
	 */
	onOnchainRoute?: (route: ExchangeRoute, amount: number) => void
}

const useExchangeFlow = ({ from, to, amountText, addresses, balances, unsupportedReason, onOpened, onOnchainRoute }: ExchangeFlowInput) => {

	const [review, setReview] = useState(false)
	const { open, busy, error, clearError } = useExchangeOrder({ onOpened })

	/**
	 * Proveedor que el usuario eligió en la hoja de rutas, o null = "la mejor".
	 *
	 * Se recuerda el PROVEEDOR y no el `quote_id`: cada recotización trae ids nuevos. Si ese
	 * proveedor deja de cotizar, `selectRoute` vuelve a la mejor (ver exchangeModel).
	 */
	const [chosenProvider, setChosenProvider] = useState<string | null>(null)
	/** La ruta que se estaba mirando al abrir la revisión: es la única que se puede confirmar. */
	const [reviewedProvider, setReviewedProvider] = useState<string | null>(null)

	/**
	 * El mínimo es DEL PAR, no del usuario, y varía muchísimo entre pares: USDT en TRON pide
	 * 12,36 y USDC en Base 0,455 — veintisiete veces menos. Guardarlo en una sola variable
	 * hacía que el de un par bloqueara al siguiente: quien empezaba por USDT-TRON (el primer
	 * activo de la wallet) arrastraba 12,36 a todo lo demás, y como el mínimo apaga la query,
	 * el efecto no era un aviso sino que el importe a recibir dejaba de cargar.
	 *
	 * Por eso va indexado por par, y volver a uno ya visto no cuesta otra ida al servidor.
	 */
	const pairKey = `${from?.id ?? ''}|${to?.id ?? ''}`
	const [minByPair, setMinByPair] = useState<Record<string, number>>({})
	const minAmount = minByPair[pairKey] ?? null

	// El importe tecleado se valida contra el saldo en unidades mínimas; el mínimo del par lo
	// aporta la cotización anterior, así que la primera vuelta valida sin él y la segunda ya
	// con el que el proveedor haya dicho.
	const check = useMemo(() => checkAmount({
		input: amountText,
		balance: from ? safeBigInt(from.amount, from.decimals) : 0n,
		decimals: from?.decimals ?? 0,
		minAmount,
	}), [amountText, from, minAmount])

	// Solo se cotiza lo que puede llegar a ejecutarse: teclear no debe gastar el bucket
	const quotedAmount = useDebounced(check.ok ? check.amount : 0, QUOTE_DEBOUNCE_MS)
	const quoteQuery = useExchangeQuoteQuery({
		fromAssetId: from?.id ?? null,
		toAssetId: to?.id ?? null,
		amount: quotedAmount,
		balances,
		onchain: useMemo(() => onchainQuoteParams(addresses), [addresses]),
		enabled: !!from && !!to && !unsupportedReason && quotedAmount > 0,
	})

	// El mínimo viaja tanto en el éxito como en el 400 de "por debajo del mínimo": de ahí se
	// aprende para que el siguiente intento se valide en local sin ir al servidor.
	const payload = quoteQuery.data ?? null
	const learnedMin = payload?.min_amount ?? minAmountFromError(quoteQuery.error)
	useEffect(() => {
		// `placeholderData` sirve la cotización del par ANTERIOR mientras llega la nueva, para
		// no vaciar la pantalla al cambiar de activo. Aprender de ella guardaría el mínimo de
		// un par bajo la clave de otro, que es el mismo veneno con otro nombre
		if (quoteQuery.isPlaceholderData) { return }
		if (learnedMin && minByPair[pairKey] !== learnedMin) {
			setMinByPair(previous => ({ ...previous, [pairKey]: learnedMin }))
		}
	}, [learnedMin, pairKey, minByPair, quoteQuery.isPlaceholderData])

	/**
	 * La cotización en pantalla es EXACTAMENTE la del importe tecleado: pasó el debounce
	 * (`quotedAmount` alcanzó al campo) y no es la del importe o par anterior que
	 * `placeholderData` mantiene visible mientras llega la nueva. Sin esto, cambiar el
	 * importe y pulsar Revisar dentro del debounce dejaba confirmar la orden VIEJA: la hoja
	 * enseñaba lo tecleado y se mandaba lo cotizado antes, con su `quote_id`, y el backend
	 * lo aceptaba porque ambos cuadraban entre sí.
	 *
	 * NO se mira `isFetching`: el refresco periódico (refetchInterval) es del MISMO par e
	 * importe, y la cotización en pantalla sigue valiendo mientras llega la siguiente;
	 * bloquear ahí apagaba Confirmar cada 45 s sin enseñar ninguna carga.
	 */
	const routes = useMemo(() => routesFrom(payload), [payload])
	const selectedRoute = useMemo(() => selectRoute(routes, chosenProvider), [routes, chosenProvider])

	/**
	 * Además, la ruta en uso tiene que ser la que se REVISÓ. Si mientras la hoja de revisión
	 * está abierta el proveedor elegido deja de cotizar, `selectRoute` cae a otra ruta: con
	 * otro nombre, otra tasa y otro custodio. Confirmar ahí abriría una operación que el
	 * usuario no ha visto, así que se bloquea hasta que revise de nuevo.
	 */
	const ready = !!selectedRoute?.quote_id && check.ok && quotedAmount === check.amount
		&& !quoteQuery.isPlaceholderData
		&& (!review || selectedRoute.provider === reviewedProvider)

	/**
	 * Abre la operación. Ningún camino de salida es mudo: un botón de confirmar que no hace
	 * nada y no dice nada es indistinguible de la app colgada, y aquí hay cuatro motivos
	 * distintos por los que no se puede seguir.
	 */
	const confirm = useCallback(async () => {
		if (!from || !to || !check.ok) { return }

		// Sin cotización congelada no hay nada que confirmar: es la que fija el precio y el
		// importe que el proveedor va a esperar
		if (!selectedRoute?.quote_id) {
			toast.error(i18n.t('crypto.wallet.exchange.quoteMissing'))
			return
		}
		// Segunda red: la hoja ya deshabilita Confirmar hasta `ready`, pero una cotización
		// que no es la del importe del campo nunca debe abrir una orden
		if (!ready) {
			toast.error(i18n.t('crypto.wallet.exchange.quoteUpdating'))
			return
		}

		const payoutAddress = addresses ? addressForKind(addresses, to.kind) : null
		const refundAddress = addresses ? addressForKind(addresses, from.kind) : null
		// La de devolución es tan obligatoria como la de destino: es adonde vuelve si falla
		if (!payoutAddress || !refundAddress) {
			toast.error(i18n.t('crypto.wallet.swap.notRegistered'))
			return
		}

		const result = await open({
			// El de la ruta ELEGIDA: cada una trae su propia cotización congelada
			quoteId: selectedRoute.quote_id,
			fromAssetId: from.id,
			toAssetId: to.id,
			// El importe QUE SE COTIZÓ, no el que hay ahora en el campo. El backend exige que
			// coincida con la cotización congelada, y entre teclear y confirmar cabe el
			// debounce: mandar lo tecleado rechazaba la operación por descuadre
			amount: quotedAmount,
			payoutAddress,
			refundAddress,
		})
		if (result.ok) { setReview(false) }
	}, [from, to, selectedRoute?.quote_id, check.ok, ready, quotedAmount, addresses, open])

	return {
		check,
		// La cotización que pinta la pantalla es la de la ruta EN USO, no siempre la mejor
		quote: quoteOfRoute(selectedRoute) ?? payload?.quote ?? null,
		routes,
		selectedRoute,
		selectRoute: setChosenProvider,
		advice: payload?.advice ?? null,
		cheaper: payload?.cheaper_origin ?? null,
		minAmount,
		quoting: quoteQuery.isFetching,
		/** Se puede confirmar: la cotización es la del importe tecleado (ver `ready`). */
		ready,
		// Una cotización caducada no es un fallo que enseñar: la query la renueva sola
		quoteFailed: quoteQuery.isError && !payload,
		/**
		 * Lo que dijo el servidor cuando no se pudo cotizar. La pantalla enseñaba un "Swap no
		 * disponible" genérico para CUALQUIER fallo —límite de tasa, par sin liquidez,
		 * proveedor caído—, que no distingue entre esperar un minuto y no poder nunca.
		 */
		quoteError: quoteQuery.isError && !payload ? ((quoteQuery.error as Error | null)?.message ?? null) : null,
		review,
		openReview: useCallback(() => {
			clearError()
			// On-chain: la revisión ES la pantalla de firma, que verifica la tx real antes de
			// enseñar nada. La hoja custodial (depósito, custodia del proveedor) no aplica
			if (selectedRoute?.custody === 'onchain' && selectedRoute.quote_id && onOnchainRoute) {
				if (ready) { onOnchainRoute(selectedRoute, quotedAmount) } else { toast.error(i18n.t('crypto.wallet.exchange.quoteUpdating')) }
				return
			}
			setReviewedProvider(selectedRoute?.provider ?? null)
			setReview(true)
		}, [clearError, selectedRoute, onOnchainRoute, ready, quotedAmount]),
		closeReview: useCallback(() => setReview(false), []),
		confirm,
		busy,
		error,
	}
}

/** El saldo viene como decimal humano; a unidades mínimas sin pasar por float. */
const safeBigInt = (amount: string, decimals: number): bigint => {
	try {
		const [whole, frac = ''] = String(amount).split('.')
		return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
	} catch { return 0n }
}

/** El 400 de "por debajo del mínimo" trae el mínimo real: es información, no solo un error. */
const minAmountFromError = (error: unknown): number | null => {
	const details = (error as { details?: { min_amount?: number } } | null)?.details
	const min = Number(details?.min_amount)
	return Number.isFinite(min) && min > 0 ? min : null
}

/**
 * Debounce simple para el campo de importe.
 *
 * El temporizador se arma en un efecto y se limpia al desmontar: armarlo en render dejaba un
 * `setTimeout` vivo después de salir de la pantalla, que es un setState sobre un componente
 * desmontado (y lo que impedía a jest cerrar el proceso).
 */
const useDebounced = <T,>(value: T, delay: number): T => {
	const [debounced, setDebounced] = useState(value)
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay)
		return () => clearTimeout(timer)
	}, [value, delay])
	return debounced
}

export default useExchangeFlow
