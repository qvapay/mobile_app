/**
 * Abrir una operación de intercambio y acompañarla hasta que el usuario haya depositado.
 *
 * Es la única pieza del flujo que MUTA algo en el backend, así que sigue las reglas de toda
 * operación de dinero de la app: llamada directa al módulo de `api/`, clave de idempotencia
 * estable durante todo el intento y rotada solo tras éxito confirmado.
 *
 * LO QUE ESTE HOOK NO HACE, A PROPÓSITO: enviar. El envío al depósito es un envío normal de
 * la wallet, con el motor `useWalletSendTx` intacto y su verificación de firma sin tocar —
 * esa es justamente la razón por la que el modelo de dirección de depósito no exigió abrir
 * la capa de firma a transacciones arbitrarias. Aquí solo se abre la operación y se entrega
 * a la pantalla lo que el envío necesita: dirección y CANTIDAD EXACTA.
 */
import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// API
import { exchangeApi } from '../../../api/exchangeApi'
import { callWithDuplicateRetry, isNetworkFailure, makeIdempotencyKey, safeRetryHint } from '../../../helpers/idempotency'
import i18n from '../../../i18n'

// Local
import { EXCHANGE_ORDERS_KEY, EXCHANGE_ORDER_KEY } from './exchangeQueries'

// Tipos
import type { ExchangeOrder } from '../../../types/domain'

export type OpenExchangeInput = {
	quoteId: string
	fromAssetId: string
	toAssetId: string
	amount: number
	/** Wallet del usuario en la cadena de DESTINO. */
	payoutAddress: string
	/** Wallet del usuario en la cadena de ORIGEN. Obligatoria: adonde vuelve si falla. */
	refundAddress: string
}

export type OpenExchangeResult =
	| { ok: true, order: ExchangeOrder }
	| { ok: false, code: string | null, message: string, canRetry: boolean }

const codeOf = (details: unknown): string | null => (details as { code?: string } | null)?.code ?? null

/**
 * @param onOpened - Se llama con la operación recién abierta (la pantalla navega al envío).
 */
const useExchangeOrder = ({ onOpened }: { onOpened?: (order: ExchangeOrder) => void } = {}) => {

	const queryClient = useQueryClient()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	/**
	 * La clave vive en un ref y se ata a los parámetros del pedido. El backend la namespacea
	 * por usuario y endpoint, NO por payload: reusarla con otro par o importe devolvería
	 * `200 duplicate` con la operación VIEJA — y el usuario acabaría enviando al depósito
	 * equivocado. Por eso cambiar cualquier parámetro la rota.
	 */
	const keyRef = useRef<{ signature: string, key: string } | null>(null)

	const keyFor = useCallback((input: OpenExchangeInput): string => {
		const signature = `${input.quoteId}|${input.fromAssetId}|${input.toAssetId}|${input.amount}|${input.payoutAddress}`
		if (keyRef.current?.signature !== signature) {
			keyRef.current = { signature, key: makeIdempotencyKey() }
		}
		return keyRef.current.key
	}, [])

	const open = useCallback(async (input: OpenExchangeInput): Promise<OpenExchangeResult> => {
		setBusy(true)
		setError(null)
		try {
			const idempotencyKey = keyFor(input)
			const result = await callWithDuplicateRetry(() => exchangeApi.create({ ...input, idempotencyKey }))

			if (!result.success) {
				const code = codeOf(result.details)
				// Sin respuesta HTTP la operación pudo abrirse igual; con clave estable,
				// reintentar es seguro y el copy puede prometerlo.
				const network = isNetworkFailure(result)
				const message = network ? safeRetryHint() : (result.error || i18n.t('api.exchange.createFailed'))
				setError(message)
				return { ok: false, code, message, canRetry: network || code === 'PROVIDER_UNAVAILABLE' }
			}

			// Un replay (`duplicate: true`) trae la operación ORIGINAL y se trata como éxito:
			// es exactamente la que el usuario quería, ya abierta.
			const order = result.data?.data
			if (!order) {
				// Éxito sin cuerpo: no hay dirección de depósito que enseñar, y enseñarla a
				// medias sería invitar a mandar fondos a ninguna parte.
				const message = i18n.t('api.exchange.createFailed')
				setError(message)
				return { ok: false, code: 'EMPTY_RESPONSE', message, canRetry: true }
			}
			// La clave se rota solo aquí, con el éxito confirmado
			keyRef.current = null

			queryClient.setQueryData([...EXCHANGE_ORDER_KEY, order.uuid], order)
			queryClient.invalidateQueries({ queryKey: EXCHANGE_ORDERS_KEY })

			onOpened?.(order)
			return { ok: true, order }
		} finally {
			setBusy(false)
		}
	}, [keyFor, onOpened, queryClient])

	return { open, busy, error, clearError: useCallback(() => setError(null), []) }
}

export default useExchangeOrder
