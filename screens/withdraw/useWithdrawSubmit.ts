/**
 * Segundo paso del retiro: confirmación con PIN por email u OTP y envío de
 * `POST /withdraw`. Extraído de `Withdraw.tsx` para que la pantalla se quede
 * con la composición.
 *
 * La clave de idempotencia se mantiene ESTABLE en todo reintento (timeout,
 * 5xx, doble toque) y solo rota tras un éxito confirmado — igual que antes;
 * ante un 409 "en proceso" `callWithDuplicateRetry` espera y reintenta UNA vez
 * con la MISMA clave.
 */

import { useEffect, useEffectEvent, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import usePinEntry from '../../hooks/usePinEntry'
import { keyFromFieldName } from './withdrawFees'
import type { WorkingForm } from './withdrawFees'

// API
import { withdrawApi } from '../../api/withdrawApi'

// Idempotencia: clave estable por intento — un reintento tras timeout no duplica el débito
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, safeRetryHint } from '../../helpers/idempotency'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Toast
import { toast } from 'sonner-native'

// Types
import type { ScrollView } from 'react-native'
import type { Coin, CoinWorkingField } from '../../types/domain'

/** Acción del reducer genérico: `field` y `value` correlacionados por clave. */
type SetFieldAction<S> = { [K in keyof S]: { type: 'set', field: K, value: S[K] } }[keyof S]

/** Banderas del paso de PIN/OTP. */
type PinFlowState = { showPinStep: boolean, sendingPin: boolean, sendingWithdraw: boolean }

// Generic field setter for the related-state slice below
function setFieldReducer<S extends object>(state: S, action: SetFieldAction<S>): S {
	switch (action.type) {
		case 'set':
			// La clave computada ensancha el tipo del literal: se reafirma S
			return { ...state, [action.field]: action.value } as S
		default:
			return state
	}
}
const initialPinFlow: PinFlowState = { showPinStep: false, sendingPin: false, sendingWithdraw: false }

/** Lo que el paso de confirmación necesita saber del formulario. */
type WithdrawSubmitArgs = {
	amountQUSD: string
	amountSats: string
	sourceSats: boolean
	selectedCoin: Coin | null
	workingFields: CoinWorkingField[]
	workingForm: WorkingForm
	/** Scroll del form: el paso de PIN aparece bajo el fold y hay que llevarlo a la vista. */
	scrollViewRef: React.RefObject<ScrollView | null>
	/** Limpieza del formulario + navegación tras un retiro confirmado. */
	onSuccess: () => void
}

/**
 * Paso de confirmación del retiro (PIN/OTP + envío).
 *
 * @param args - Datos del formulario ya validado y callback de éxito.
 * @returns Estado del paso de PIN y sus handlers.
 */
export default function useWithdrawSubmit({ amountQUSD, amountSats, sourceSats, selectedCoin, workingFields, workingForm, scrollViewRef, onSuccess }: WithdrawSubmitArgs) {

	const { t } = useTranslation()
	const { user, updateUser } = useAuth()

	// Clave de idempotencia del intento: sobrevive a timeouts, 5xx y toques
	// repetidos — solo rota tras éxito confirmado. Si un intento falla por
	// validación (PIN malo, saldo), el servidor libera la clave y reintentar
	// con datos corregidos procede normal.
	const idempotencyKeyRef = useRef(makeIdempotencyKey())

	// PIN/OTP step flags
	const [pinFlow, dispatchPin] = useReducer(setFieldReducer<PinFlowState>, initialPinFlow)
	const { showPinStep, sendingPin, sendingWithdraw } = pinFlow
	const setShowPinStep = (value: boolean) => dispatchPin({ type: 'set', field: 'showPinStep', value })
	const setSendingPin = (value: boolean) => dispatchPin({ type: 'set', field: 'sendingPin', value })
	const setSendingWithdraw = (value: boolean) => dispatchPin({ type: 'set', field: 'sendingWithdraw', value })

	// PIN/OTP state (entered code, method toggle, code length) — box mechanics live in QPCodeInput
	const { pin, setPin, twoFactorMethod, codeLength, codeInputRef, handleMethodToggle } = usePinEntry()

	const hasOTP = !!user?.two_factor_secret

	// Request PIN via email
	const handleRequestPin = async () => {
		try {
			setSendingPin(true)
			const result = await withdrawApi.requestPin()
			if (result.success) {
				toast.success(t('withdraw.index.toasts.pinSent.title'), { description: t('withdraw.index.toasts.pinSent.description') })
			} else {
				toast.error(result.error || t('withdraw.index.toasts.pinSendFailed'))
			}
		} catch (err) {
			toast.error(t('withdraw.index.toasts.pinRequestError'))
		} finally { setSendingPin(false) }
	}

	// Submit withdraw with PIN
	const handleWithdraw = async () => {
		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? t('withdraw.index.toasts.enterPin') : t('withdraw.index.toasts.enterOtp'))
			return
		}

		try {
			setSendingWithdraw(true)
			// Build details with original field names from working_data
			const details: Record<string, string> = {}
			for (const field of workingFields) {
				const key = keyFromFieldName(field.name)
				details[field.name] = workingForm[key] || ''
			}
			// Ante el 409 "en proceso" se espera y reintenta una vez con la MISMA clave
			const result = await callWithDuplicateRetry(() => withdrawApi.withdraw({
				amount: amountQUSD,
				// El botón que abre el paso de PIN exige isFormValid ⇒ hay moneda
				coin: selectedCoin!.tick,
				details,
				pin,
				...(sourceSats && { source: 'satoshis', amountSats: Number(amountSats) }),
				idempotencyKey: idempotencyKeyRef.current,
			}))

			if (result.success) {
				idempotencyKeyRef.current = makeIdempotencyKey()
				if (sourceSats) {
					toast.success(t('withdraw.index.toasts.redeemed.title'), { description: t('withdraw.index.toasts.redeemed.description', { sats: Number(amountSats).toLocaleString() }) })
					// El backend devuelve los sats restantes fresh — reflejarlos sin refetch
					// (`data` del ApiResult es `unknown`: se estrecha a la forma que se lee)
					const satoshisLeft = (result.data as { data?: { satoshis?: number } } | undefined)?.data?.satoshis
					if (typeof satoshisLeft === 'number') { updateUser({ satoshis: satoshisLeft }) }
				} else {
					toast.success(t('withdraw.index.toasts.withdrawn.title'), { description: t('withdraw.index.toasts.withdrawn.description', { amount: amountQUSD }) })
					updateUser({ balance: Number(user?.balance || 0) - Number(amountQUSD) })
				}
				setShowPinStep(false)
				setPin('')
				onSuccess()
			} else if (isNetworkFailure(result)) {
				toast.error(t('withdraw.index.toasts.networkErrorTitle'), { description: `${result.error || t('errors.network')}. ${safeRetryHint()}` })
			} else {
				toast.error(result.error || t('withdraw.index.toasts.withdrawFailed'))
			}
		} catch (err) {
			toast.error(t('withdraw.index.toasts.processError'))
		} finally { setSendingWithdraw(false) }
	}

	// Auto-submit when all digits entered (Effect Event: reads the latest
	// handler/flags without re-running the effect on every state change)
	const onPinComplete = useEffectEvent(() => { if (pin.length === codeLength && !sendingWithdraw) { handleWithdraw() } })
	useEffect(() => { onPinComplete() }, [pin])

	// Auto-scroll to PIN section when it appears (mismo patrón que SendConfirm —
	// sin esto el paso de PIN queda bajo el fold y el usuario no sabe que existe)
	useEffect(() => {
		if (!showPinStep) return
		const timer = setTimeout(() => {
			scrollViewRef.current?.scrollToEnd({ animated: true })
			codeInputRef.current?.focus(0)
		}, 100)
		return () => clearTimeout(timer)
	}, [showPinStep, codeInputRef, scrollViewRef])

	// Re-scroll al enfocar una cajita: el teclado encoge el viewport y taparía el input
	const handlePinBoxFocus = () => {
		setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
	}

	return {
		pin, setPin, codeLength, twoFactorMethod, codeInputRef, handleMethodToggle, hasOTP,
		showPinStep, setShowPinStep, sendingPin, sendingWithdraw,
		handleRequestPin, handleWithdraw, handlePinBoxFocus,
	}
}
