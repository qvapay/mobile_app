/**
 * Orquesta la parte de intercambio de la pantalla: cotizar mientras se teclea, revisar y
 * abrir la operación.
 *
 * Hermano de `useSwapFlow` (el motor QUSD): la pantalla es una sola y elige entre los dos
 * según el par que el usuario haya escogido. Lo que sigue después de abrir la operación NO
 * está aquí — es un envío normal de la wallet, y de eso se encarga `WalletSendConfirm`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

// Wallet
import { addressForKind } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import type { WalletAddresses } from '../../../wallet/derive'

// Local
import { checkAmount } from './exchangeModel'
import { useExchangeQuoteQuery } from './exchangeQueries'
import useExchangeOrder from './useExchangeOrder'

// Tipos
import type { ExchangeOrder } from '../../../types/domain'

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
}

const useExchangeFlow = ({ from, to, amountText, addresses, balances, unsupportedReason, onOpened }: ExchangeFlowInput) => {

	const [review, setReview] = useState(false)
	const { open, busy, error, clearError } = useExchangeOrder({ onOpened })

	// El importe tecleado se valida contra el saldo en unidades mínimas; el mínimo del par lo
	// aporta la cotización anterior, así que la primera vuelta valida sin él y la segunda ya
	// con el que el proveedor haya dicho.
	const [minAmount, setMinAmount] = useState<number | null>(null)
	const check = useMemo(() => checkAmount({
		input: amountText,
		balance: from ? safeBigInt(from.amount, from.decimals) : 0n,
		decimals: from?.decimals ?? 0,
		minAmount,
	}), [amountText, from, minAmount])

	// Solo se cotiza lo que puede llegar a ejecutarse: teclear no debe gastar el bucket
	const debounced = useDebounced(check.ok ? check.amount : 0, QUOTE_DEBOUNCE_MS)
	const quoteQuery = useExchangeQuoteQuery({
		fromAssetId: from?.id ?? null,
		toAssetId: to?.id ?? null,
		amount: debounced,
		balances,
		enabled: !!from && !!to && !unsupportedReason && debounced > 0,
	})

	// El mínimo viaja tanto en el éxito como en el 400 de "por debajo del mínimo": de ahí se
	// aprende para que el siguiente intento se valide en local sin ir al servidor.
	const payload = quoteQuery.data ?? null
	const learnedMin = payload?.min_amount ?? minAmountFromError(quoteQuery.error)
	useEffect(() => {
		if (learnedMin && learnedMin !== minAmount) { setMinAmount(learnedMin) }
	}, [learnedMin, minAmount])

	const confirm = useCallback(async () => {
		if (!from || !to || !payload?.quote_id || !check.ok || !addresses) { return }

		const payoutAddress = addressForKind(addresses, to.kind)
		const refundAddress = addressForKind(addresses, from.kind)
		// Sin dirección de devolución no se abre nada: es adonde vuelve el dinero si falla
		if (!payoutAddress || !refundAddress) { return }

		const result = await open({
			quoteId: payload.quote_id,
			fromAssetId: from.id,
			toAssetId: to.id,
			amount: check.amount,
			payoutAddress,
			refundAddress,
		})
		if (result.ok) { setReview(false) }
	}, [from, to, payload?.quote_id, check, addresses, open])

	return {
		check,
		quote: payload?.quote ?? null,
		advice: payload?.advice ?? null,
		cheaper: payload?.cheaper_origin ?? null,
		minAmount,
		quoting: quoteQuery.isFetching,
		// Una cotización caducada no es un fallo que enseñar: la query la renueva sola
		quoteFailed: quoteQuery.isError && !payload,
		review,
		openReview: useCallback(() => { clearError(); setReview(true) }, [clearError]),
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
