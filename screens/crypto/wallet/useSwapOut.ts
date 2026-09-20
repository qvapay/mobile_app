/**
 * Swap saldo → QUSD en la wallet (`POST /swap` direction out): confirmación con PIN por
 * email u OTP, misma mecánica que el retiro (`useWithdrawSubmit`) — de hecho el backend
 * lo trata con los mismos gates. La clave de idempotencia es ESTABLE en todo reintento y
 * solo rota tras un 2xx; ante el 409 "en proceso" `callWithDuplicateRetry` espera y
 * reintenta UNA vez con la misma clave.
 */

import { useEffect, useEffectEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

import usePinEntry from '../../../hooks/usePinEntry'
import { withdrawApi } from '../../../api/withdrawApi'
import { swapApi } from '../../../api/swapApi'
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, safeRetryHint } from '../../../helpers/idempotency'
import { useIdempotencyKey } from '../../../hooks/useIdempotencyKey'
import { useAuth } from '../../../auth/AuthContext'
import type { Swap } from '../../../types/domain'

type Args = {
	pairId: string | null
	/** USD con dos decimales ya validado por la pantalla ('' si no hay importe). */
	amount: string
	/** La `stx` registrada del usuario (el backend exige que coincida). */
	toAddress: string | null
	onCreated: (swap: Swap) => void
}

export default function useSwapOut({ pairId, amount, toAddress, onCreated }: Args) {

	const { t } = useTranslation()
	const { user, updateUser } = useAuth()

	const idempotencyKeyRef = useIdempotencyKey()
	const [showPinStep, setShowPinStep] = useState(false)
	const [sendingPin, setSendingPin] = useState(false)
	const [submitting, setSubmitting] = useState(false)

	const { pin, setPin, twoFactorMethod, codeLength, codeInputRef, handleMethodToggle } = usePinEntry()
	const hasOTP = !!user?.two_factor_secret

	const handleRequestPin = async () => {
		try {
			setSendingPin(true)
			const result = await withdrawApi.requestPin()
			if (result.success) toast.success(t('withdraw.index.toasts.pinSent.title'), { description: t('withdraw.index.toasts.pinSent.description') })
			else toast.error(result.error || t('withdraw.index.toasts.pinSendFailed'))
		} catch {
			toast.error(t('withdraw.index.toasts.pinRequestError'))
		} finally { setSendingPin(false) }
	}

	const submit = async () => {
		if (!pairId || !toAddress || !amount) return
		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? t('withdraw.index.toasts.enterPin') : t('withdraw.index.toasts.enterOtp'))
			return
		}
		try {
			setSubmitting(true)
			const result = await callWithDuplicateRetry(() => swapApi.create({ direction: 'out', pair: pairId, amount, toAddress, pin, idempotencyKey: idempotencyKeyRef.current }))
			if (result.success && result.data?.data) {
				idempotencyKeyRef.current = makeIdempotencyKey()
				// El backend devuelve el saldo ya debitado; si es un replay (duplicate) no viene
				if (typeof result.data.balance === 'number') updateUser({ balance: result.data.balance })
				else if (!result.data.duplicate) updateUser({ balance: Number(user?.balance || 0) - Number(amount) })
				setShowPinStep(false)
				setPin('')
				onCreated(result.data.data)
			} else {
				const failure = result.success ? null : result
				if (isNetworkFailure(result)) {
					toast.error(t('withdraw.index.toasts.networkErrorTitle'), { description: `${failure?.error || t('errors.network')}. ${safeRetryHint()}` })
				} else {
					toast.error(failure?.error || t('crypto.wallet.swap.errors.createFailed'))
					const code = (failure?.details as { code?: string } | undefined)?.code
					if (code === 'CODE_INVALID' || code === 'CODE_FORMAT' || code === 'OTP_REQUIRED') setPin('')
				}
			}
		} catch {
			toast.error(t('crypto.wallet.swap.errors.createFailed'))
		} finally { setSubmitting(false) }
	}

	// Auto-submit al completar el código (lee handler/flags frescos sin re-suscribir el efecto)
	const onPinComplete = useEffectEvent(() => { if (pin.length === codeLength && !submitting) submit() })
	useEffect(() => { onPinComplete() }, [pin])

	useEffect(() => {
		if (!showPinStep) return
		const timer = setTimeout(() => codeInputRef.current?.focus(0), 120)
		return () => clearTimeout(timer)
	}, [showPinStep, codeInputRef])

	return { pin, setPin, codeLength, twoFactorMethod, codeInputRef, handleMethodToggle, hasOTP, showPinStep, setShowPinStep, sendingPin, submitting, handleRequestPin, submit }
}
