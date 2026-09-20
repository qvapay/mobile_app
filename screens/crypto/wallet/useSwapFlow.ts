/**
 * Orquesta la EJECUCIÓN de un swap: la hoja de revisión y los dos caminos que salen de
 * ella, que no se parecen en nada.
 *
 * - saldo → wallet (`useSwapOut`): confirmar pide el PIN/OTP de la cuenta dentro de la
 *   misma hoja, y el segundo toque envía.
 * - wallet → saldo (`useSwapIn`): confirmar cierra la hoja y, un instante después, abre el
 *   gate de la wallet para firmar (dos `Modal` a la vez no conviven en iOS).
 *
 * Vive aparte de la pantalla porque este vaivén —cuándo se abre la hoja, cuándo aparece el
 * PIN, qué invalida una tx ya preparada— es la parte delicada del swap, y la pantalla no
 * tiene por qué contarla otra vez entre el JSX.
 */
import { useEffect, useState } from 'react'

import { parseUnits } from '../../../wallet/chains/units'
import type { AssetView } from '../../../wallet/assets'
import type { SwapDirection, SwapForm } from './swapModel'
import useSwapOut from './useSwapOut'
import useSwapIn from './useSwapIn'
import type { Swap, SwapPair } from '../../../types/domain'

/** Espera entre cerrar la hoja de revisión y abrir el gate de la wallet (dos Modal a la vez fallan en iOS). */
const SHEET_HANDOFF_MS = 350

type Args = {
	direction: SwapDirection
	form: SwapForm
	pair: SwapPair | null
	asset: AssetView | undefined
	/** Dirección de la wallet registrada en el backend (el sentido OUT paga ahí). */
	registered: string | null
	/** El sentido IN no está soportado en esta red: la hoja no debe abrirse. */
	inUnsupported: boolean
	/** El swap quedó creado: la pantalla navega al estado. */
	onCreated: (swap: Swap) => void
}

export const useSwapFlow = ({ direction, form, pair, asset, registered, inUnsupported, onCreated }: Args) => {

	const [review, setReview] = useState(false)

	const created = (swap: Swap) => { setReview(false); onCreated(swap) }
	const amountUnits = form.canReview && form.amount && asset ? parseUnits(form.amount, asset.decimals) : null

	const out = useSwapOut({ pairId: pair?.id ?? null, amount: form.amount ?? '', toAddress: registered, onCreated: created })
	const inn = useSwapIn({ pair, asset, amountUnits, amount: form.amount ?? '', onCreated: created })

	// Cambiar sentido, importe o par invalida la tx preparada y el paso de PIN
	useEffect(() => { inn.reset(); out.setShowPinStep(false); out.setPin('') }, [direction, form.amount, pair?.id]) // eslint-disable-line react-hooks/exhaustive-deps

	const busy = out.submitting || inn.phase === 'preparing' || inn.phase === 'signing' || inn.phase === 'submitting'
	const retrying = direction === 'in' && inn.phase === 'error'
	const showPinStep = direction === 'out' && out.showPinStep

	const clearPin = () => { out.setShowPinStep(false); out.setPin('') }

	/** Botón principal: en error del sentido IN reintenta; si no, abre la revisión. */
	const onCta = () => {
		if (retrying) { inn.retry(); return }
		if (!form.canReview || inUnsupported) return
		setReview(true)
	}

	const closeReview = () => { if (busy) return; setReview(false); clearPin() }

	const onConfirm = () => {
		if (direction === 'out') {
			if (!out.showPinStep) { out.setShowPinStep(true); return }
			out.submit()
			return
		}
		setReview(false)
		setTimeout(() => { inn.start() }, SHEET_HANDOFF_MS)
	}

	return {
		out,
		review,
		busy,
		retrying,
		inError: inn.error,
		showPinStep,
		confirmDisabled: showPinStep && out.pin.length !== out.codeLength,
		onCta,
		closeReview,
		onConfirm,
		// El gate de la wallet solo tiene sentido con un activo que firmar
		authVisible: inn.authVisible && !!asset,
		closeAuth: inn.closeAuth,
		onAuthorized: inn.onAuthorized,
	}
}

export default useSwapFlow
