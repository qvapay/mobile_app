import { useEffect, useEffectEvent, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { useQueryClient } from '@tanstack/react-query'

import QPSheet from '../../ui/QPSheet'
import QPButton from '../../ui/particles/QPButton'
import QPFitText from '../../ui/particles/QPFitText'
import PinConfirmStep from '../transaction/PinConfirmStep'
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, useContainerStyles } from '../../theme/themeUtils'
import { useAuth } from '../../auth/AuthContext'
import usePinEntry from '../../hooks/usePinEntry'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'

import { transferApi } from '../../api/transferApi'
import { withdrawApi } from '../../api/withdrawApi'
import { miniappsApi } from '../../api/miniappsApi'
import { callWithDuplicateRetry, isNetworkFailure, makeIdempotencyKey, safeRetryHint } from '../../helpers/idempotency'
import { payInvoiceState } from '../transaction/payModel'
import { invoiceBelongsToApp, isSecondFactorFailure, payFailureCode, requiresOtp } from '../../miniapps/miniAppPayModel'
import { BRIDGE_ERRORS, type BridgeError } from '../../miniapps/protocol'
import MiniAppIcon from './MiniAppIcon'
import type { MiniApp, MiniAppPayment, Transaction } from '../../types/domain'

type Props = {
	app: MiniApp
	invoiceUuid: string
	onPaid: (result: MiniAppPayment) => void
	onCancel: (error?: BridgeError) => void
}

/**
 * Hoja nativa de cobro de una mini-app. La mini-app solo aporta el uuid de
 * una factura que su servidor creó con la API de comercios; todo lo que ve el
 * usuario (comercio, importe, concepto) sale de QvaPay, no de la mini-app.
 *
 * - La factura debe ser del comercio de ESTA mini-app; si no, se rechaza sin
 *   llegar a pedir el PIN (el backend lo vuelve a comprobar).
 * - Confirmación con PIN/OTP, como cualquier salida de dinero.
 * - Clave de idempotencia estable en todo reintento del intento: un timeout
 *   reintentado nunca cobra dos veces.
 */
const MiniAppPaySheet = ({ app, invoiceUuid, onPaid, onCancel }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { user } = useAuth()
	const queryClient = useQueryClient()

	const [invoice, setInvoice] = useState<Transaction | null>(null)
	const [loadFailed, setLoadFailed] = useState(false)
	const [paying, setPaying] = useState(false)
	const [sendingPin, setSendingPin] = useState(false)

	const { pin, setPin, twoFactorMethod, codeLength, codeInputRef, handleMethodToggle } = usePinEntry()
	const idempotencyKeyRef = useIdempotencyKey()
	const hasOTP = !!user?.two_factor_secret

	// Carga + comprobación de pertenencia antes de enseñar nada pagable
	const onInvoiceLoaded = useEffectEvent((tx: Transaction) => {
		if (!invoiceBelongsToApp(tx, app.app_uuid)) {
			toast.error(t('miniapps.pay.mismatchTitle'), { description: t('miniapps.pay.mismatchBody', { name: app.name }) })
			onCancel({ code: BRIDGE_ERRORS.INVOICE_APP_MISMATCH, message: 'Invoice does not belong to this mini-app' })
			return
		}
		setInvoice(tx)
	})
	useEffect(() => {
		let cancelled = false
		transferApi.getTransactionDetails(invoiceUuid).then(result => {
			if (cancelled) return
			// El detalle viene envuelto en otro `data` (ver Pay.tsx)
			const tx = result.success ? (result.data as unknown as { data?: Transaction })?.data : null
			if (tx) onInvoiceLoaded(tx)
			else setLoadFailed(true)
		})
		return () => { cancelled = true }
	}, [invoiceUuid])

	const { amountFixed, balanceFixed, hasEnough, isOwn, alreadyPaid, canPay } = payInvoiceState(invoice, user)

	const handleRequestPin = async () => {
		setSendingPin(true)
		const result = await withdrawApi.requestPin()
		setSendingPin(false)
		if (result.success) toast.success(t('transactions.sendConfirm.toasts.pinSentTitle'), { description: t('transactions.sendConfirm.toasts.pinSentBody') })
		else toast.error(result.error || t('transactions.sendConfirm.toasts.pinSendFailed'))
	}

	const pay = async () => {
		if (!canPay || paying || pin.length !== codeLength) return
		setPaying(true)
		const result = await callWithDuplicateRetry(() => miniappsApi.pay(app.slug, { invoiceUuid, pin, idempotencyKey: idempotencyKeyRef.current }))
		setPaying(false)

		if (result.success) {
			if (!result.data) { onCancel({ code: BRIDGE_ERRORS.FAILED, message: 'Payment failed' }); return }
			idempotencyKeyRef.current = makeIdempotencyKey()
			ReactNativeHapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
			queryClient.invalidateQueries({ queryKey: ['home'] })
			queryClient.invalidateQueries({ queryKey: ['transactions'] })
			toast.success(t('miniapps.pay.paidTitle'), { description: t('miniapps.pay.paidBody', { amount: amountFixed, name: app.merchant.name || app.name }) })
			onPaid({ status: 'paid', transaction_uuid: result.data.transaction_uuid })
			return
		}

		const code = (result.details as { code?: unknown } | undefined)?.code
		if (isSecondFactorFailure(code)) {
			// PIN/OTP mal: la hoja sigue abierta para reintentar con la MISMA clave
			setPin('')
			if (requiresOtp(code) && twoFactorMethod === 'pin') handleMethodToggle('right')
			toast.error(t('transactions.common.errorTitle'), { description: result.error })
			return
		}
		if (isNetworkFailure(result)) {
			// Sin respuesta: reintentar es seguro con la clave estable, así que no se cierra
			toast.error(t('transactions.sendConfirm.toasts.networkErrorTitle'), { description: `${result.error || t('errors.network')}. ${safeRetryHint()}` })
			return
		}
		toast.error(t('miniapps.pay.failedTitle'), { description: result.error || t('miniapps.pay.failedBody') })
		onCancel({ code: payFailureCode(result.status, code), message: 'Payment failed' })
	}

	// Auto-envío al completar las cajitas (como SendConfirm)
	const onPinComplete = useEffectEvent(() => { if (pin.length === codeLength) pay() })
	useEffect(() => { onPinComplete() }, [pin])

	const cancel = () => onCancel()

	return (
		<QPSheet visible onClose={cancel} dismissable={!paying} avoidKeyboard>
			{!invoice ? (
				<View style={styles.loading}>
					{loadFailed ? (
						<>
							<FontAwesome6 name="circle-exclamation" size={32} color={theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.h5, styles.center, { marginTop: 12 }]}>{t('transactions.pay.invoiceUnavailable')}</Text>
							<QPButton title={t('common.actions.close')} onPress={() => onCancel({ code: BRIDGE_ERRORS.FAILED, message: 'Invoice not found' })} style={{ marginTop: 16, alignSelf: 'stretch' }} textStyle={{ color: theme.colors.buttonText }} />
						</>
					) : (
						<ActivityIndicator color={theme.colors.primary} />
					)}
				</View>
			) : (
				<View>
					<View style={styles.merchant}>
						<MiniAppIcon app={app} size={40} />
						<View style={{ marginLeft: 12, flex: 1 }}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1}>{app.merchant.name || app.name}</Text>
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]} numberOfLines={1}>{t('miniapps.pay.via', { name: app.name })}</Text>
						</View>
					</View>

					<QPFitText style={[textStyles.amount, styles.amount, { fontSize: theme.typography.fontSize.display }]}>${amountFixed}</QPFitText>
					{invoice.description ? (
						<Text style={[textStyles.h6, styles.center, { color: theme.colors.secondaryText }]} numberOfLines={3}>{invoice.description}</Text>
					) : null}

					{!canPay ? (
						<View style={[styles.notice, { backgroundColor: theme.colors.danger + '20' }]}>
							<FontAwesome6 name="triangle-exclamation" size={14} color={theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.danger, marginLeft: 8, flex: 1 }]}>
								{alreadyPaid ? t('miniapps.pay.alreadyPaid') : isOwn ? t('miniapps.pay.ownInvoice') : t('transactions.pay.insufficientBalance', { amount: balanceFixed })}
							</Text>
						</View>
					) : (
						<>
							<Text style={[textStyles.h7, styles.center, { color: hasEnough ? theme.colors.secondaryText : theme.colors.danger, marginVertical: 12 }]}>
								{t('transactions.pay.balanceAvailable', { amount: balanceFixed })}
							</Text>
							<PinConfirmStep
								pin={pin}
								onChangePin={setPin}
								codeLength={codeLength}
								twoFactorMethod={twoFactorMethod}
								hasOTP={hasOTP}
								sendingPin={sendingPin}
								onMethodToggle={handleMethodToggle}
								onRequestPin={handleRequestPin}
								codeInputRef={codeInputRef}
								theme={theme}
								textStyles={textStyles}
								containerStyles={containerStyles}
							/>
						</>
					)}

					<View style={styles.actions}>
						{canPay ? (
							<QPButton
								title={t('transactions.pay.payButton', { amount: amountFixed })}
								icon="lock"
								iconColor={theme.colors.buttonText}
								onPress={pay}
								loading={paying}
								disabled={paying || pin.length !== codeLength}
								textStyle={{ color: theme.colors.buttonText }}
							/>
						) : null}
						<QPButton title={t('common.actions.cancel')} onPress={cancel} disabled={paying} style={{ backgroundColor: 'transparent' }} textStyle={{ color: theme.colors.secondaryText }} />
					</View>
				</View>
			)}
		</QPSheet>
	)
}

const styles = StyleSheet.create({
	loading: { paddingVertical: 36, alignItems: 'center' },
	center: { textAlign: 'center' },
	merchant: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
	amount: { textAlign: 'center', marginTop: 18, marginBottom: 6 },
	notice: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginTop: 16 },
	actions: { marginTop: 14, gap: 4 },
})

export default MiniAppPaySheet
