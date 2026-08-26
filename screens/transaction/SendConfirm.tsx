import { useState, useRef, useEffect, useEffectEvent, useReducer } from 'react'
import { View, Text } from 'react-native'
import type { ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// i18n en call time para los toasts disparados dentro de efectos (usar el `t`
// del hook ahí obligaría a re-correr el fetch del destinatario al cambiar idioma)
import i18n from '../../i18n'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import PinConfirmStep from './PinConfirmStep'
import QPButton from '../../ui/particles/QPButton'
import QPKeyboardView from '../../ui/QPKeyboardView'
import TransferSummaryCards from './TransferSummaryCards'
import usePinEntry from '../../hooks/usePinEntry'

// Gate de KYC (envíos >= $500)
import useKycGate, { KYC_TRANSFER_THRESHOLD } from '../../hooks/useKycGate'
import KycGateModal from '../../ui/KycGateModal'

// API
import { userApi } from '../../api/userApi'
import { transferApi } from '../../api/transferApi'
import { withdrawApi } from '../../api/withdrawApi'

// Routes
import { ROUTES } from '../../routes'

// Toast
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Online Status
import { useOnlineStatus } from '../../hooks/OnlineStatusContext'

// Nearby session — payment ack to the chargee's radar (no-op outside NearbyPay)
import { getActiveSession } from '../../nearby/session'

// Idempotencia: clave estable por intento — un reintento tras timeout no duplica el envío
import { makeIdempotencyKey, callWithDuplicateRetry, isNetworkFailure, safeRetryHint } from '../../helpers/idempotency'

// Tipos
import type { SendCarouselUser } from './sendQueries'
import type { RootStackParamList } from '../../types/navigation'

/** Flags del sub-flujo de PIN/OTP. */
type PinFlowState = { showPinStep: boolean, sendingPin: boolean }

/** Acción del setter genérico: escribe `value` en `field` del slice. */
type FieldAction<S> = { type: 'set', field: keyof S, value: S[keyof S] }

// PIN/OTP entry sub-flow state — one cohesive unit
function pinFlowReducer(state: PinFlowState, action: FieldAction<PinFlowState>): PinFlowState {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}
const initialPinFlow: PinFlowState = { showPinStep: false, sendingPin: false }

type Props = NativeStackScreenProps<RootStackParamList, 'SendConfirm'>

/**
 * Transfer confirmation: shows recipient + amount, then a PIN/OTP step before sending.
 * Route params: `send_amount`, `user_uuid` and optional `description` (may be a sticker).
 * Resolves the recipient via `userApi.searchUser`, requests the emailed 4-digit PIN
 * through `withdrawApi.requestPin` (or accepts a 6-digit TOTP when 2FA is enrolled),
 * and executes the transfer with `POST /transaction/transfer`.
 * On success it navigates to SendSuccess with the transfer summary.
 */
const SendConfirm = ({ navigation, route }: Props) => {

	// Contexts
	const { t } = useTranslation()
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// Params from route
	const { send_amount, user_uuid, description = '' } = route.params || {}

	// Gate de KYC — intercepta antes del paso de PIN
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// States
	const [recipientUser, setRecipientUser] = useState<SendCarouselUser | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingUser, setIsLoadingUser] = useState(true)

	// PIN/OTP flow flags (same-named setters keep every call site unchanged)
	const [pinFlow, dispatchPin] = useReducer(pinFlowReducer, initialPinFlow)
	const { showPinStep, sendingPin } = pinFlow
	const setShowPinStep = (value: boolean) => dispatchPin({ type: 'set', field: 'showPinStep', value })
	const setSendingPin = (value: boolean) => dispatchPin({ type: 'set', field: 'sendingPin', value })

	// PIN/OTP state (entered code, method toggle, code length) — box mechanics live in QPCodeInput
	const { pin, setPin, twoFactorMethod, codeLength, codeInputRef, handleMethodToggle } = usePinEntry()

	const hasOTP = !!user?.two_factor_secret
	const scrollViewRef = useRef<ScrollView | null>(null)

	// Clave de idempotencia del intento: nace con la pantalla de confirmación y
	// sobrevive a timeouts, 5xx y toques repetidos — solo rota tras éxito confirmado
	const idempotencyKeyRef = useRef(makeIdempotencyKey())

	// Track recipient for online status
	useEffect(() => {
		const id = recipientUser?.uuid
		if (id) trackUsers(id)
		return () => { if (id) untrackUsers(id) }
	}, [recipientUser?.uuid, trackUsers, untrackUsers])

	// Fetch recipient user data
	useEffect(() => {
		let cancelled = false
		const fetchRecipientUser = async () => {
			if (!user_uuid) {
				setIsLoadingUser(false)
				return
			}
			try {
				setIsLoadingUser(true)
				const result = await userApi.searchUser(user_uuid)
				if (cancelled) return
				// `searchUser` tipa el cuerpo como unknown: el endpoint devuelve la lista de perfiles
				if (result.success && (result.data as SendCarouselUser[]).length > 0) {
					setRecipientUser((result.data as SendCarouselUser[])[0])
				} else {
					toast.error(i18n.t('transactions.common.errorTitle'), { description: i18n.t('transactions.sendConfirm.recipientNotFound') })
					navigation.goBack()
				}
			} catch (error) {
				if (cancelled) return
				toast.error(i18n.t('transactions.common.errorTitle'), { description: i18n.t('transactions.sendConfirm.toasts.recipientLoadFailed') })
				navigation.goBack()
			} finally { if (!cancelled) setIsLoadingUser(false) }
		}
		fetchRecipientUser()
		return () => { cancelled = true }
	}, [user_uuid, navigation])

	// Request PIN via email
	const handleRequestPin = async () => {
		try {
			setSendingPin(true)
			const result = await withdrawApi.requestPin()
			if (result.success) {
				toast.success(t('transactions.sendConfirm.toasts.pinSentTitle'), { description: t('transactions.sendConfirm.toasts.pinSentBody') })
			} else {
				toast.error(result.error || t('transactions.sendConfirm.toasts.pinSendFailed'))
			}
		} catch (error) {
			toast.error(t('transactions.sendConfirm.toasts.pinRequestFailed'))
		} finally { setSendingPin(false) }
	}

	// Auto-submit when all digits entered (Effect Event: reads the latest
	// handler/flags without re-running the effect on every state change)
	const onPinComplete = useEffectEvent(() => {
		if (pin.length === codeLength && !isLoading) {
			executeTransaction()
		}
	})
	useEffect(() => { onPinComplete() }, [pin])

	// Auto-scroll to PIN section when it appears
	useEffect(() => {
		if (!showPinStep) return
		const timer = setTimeout(() => {
			scrollViewRef.current?.scrollToEnd({ animated: true })
			codeInputRef.current?.focus(0)
		}, 100)
		return () => clearTimeout(timer)
	}, [showPinStep, codeInputRef])

	// Re-scroll al enfocar una cajita: el teclado encoge el viewport y taparía el input
	const handlePinBoxFocus = () => {
		setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
	}

	// Execute the actual transaction
	const executeTransaction = async () => {

		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? t('transactions.sendConfirm.toasts.enterPin4') : t('transactions.sendConfirm.toasts.enterOtp6'))
			return
		}

		try {
			setIsLoading(true)
			// Ante el 409 "en proceso" se espera y reintenta una vez con la MISMA clave
			const result = await callWithDuplicateRetry(() => transferApi.transferMoney({
				amount: send_amount,
				description: description,
				// El render corta antes con `if (!recipientUser)`, pero el estrechamiento
				// no alcanza a este handler (se define arriba del guard)
				to: recipientUser!.uuid,
				pin: pin,
				idempotencyKey: idempotencyKeyRef.current
			}))

			if (result.success) {
				idempotencyKeyRef.current = makeIdempotencyKey()
				getActiveSession()?.notifyPaymentSent({ toUuid: recipientUser!.uuid, amount: send_amount, txUuid: result.data?.uuid })
				// `amount`/`recipient` son params muertos (SendSuccess solo lee `description`),
				// modelados en navigation.ts tal cual viajan — el cast solo los acomoda
				navigation.navigate(ROUTES.SEND_SUCCESS, { amount: send_amount, recipient: recipientUser as Record<string, unknown>, description: description })
			} else if (isNetworkFailure(result)) {
				toast.error(t('transactions.sendConfirm.toasts.networkErrorTitle'), { description: `${result.error || t('errors.network')}. ${safeRetryHint()}` })
			} else {
				toast.error(t('transactions.sendConfirm.toasts.transactionErrorTitle'), { description: result.error || t('transactions.sendConfirm.toasts.transactionFailed') })
			}
		} catch (error) {
			toast.error(t('transactions.common.errorTitle'), { description: (error as Error).message || t('transactions.sendConfirm.toasts.unexpectedError') })
		} finally { setIsLoading(false) }
	}

	// Loading state — global loading bar handles the indicator
	if (isLoadingUser) { return <View style={containerStyles.subContainer} /> }

	// Show error if no recipient user found
	if (!recipientUser) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'center', alignItems: 'center' }]}>
				<FontAwesome6 name="user-slash" size={64} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginTop: 20, textAlign: 'center' }]}>
					{t('transactions.sendConfirm.userNotFound')}
				</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 10, textAlign: 'center' }]}>
					{t('transactions.sendConfirm.recipientNotFound')}
				</Text>
				<QPButton
					title={t('common.actions.back')}
					onPress={() => navigation.goBack()}
					style={{ marginTop: 30, width: '80%' }}
					textStyle={{ color: theme.colors.buttonText }}
				/>
			</View>
		)
	}

	return (
		<QPKeyboardView
			scrollViewRef={scrollViewRef}
			actionsContainerStyle={{ flexDirection: 'row', gap: 8 }}
			actions={
				<>
					<QPButton
						title=""
						onPress={() => navigation.goBack()}
						disabled={isLoading}
						style={{ width: 56, minHeight: 56, borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 0, backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.primaryText }}
						icon="xmark"
						iconColor={theme.colors.primaryText}
						iconStyle="solid"
					/>

					{showPinStep ? (
						<QPButton
							title={t('transactions.sendConfirm.confirmSend')}
							onPress={executeTransaction}
							loading={isLoading}
							disabled={isLoading || !pin || pin.length < codeLength}
							style={{ flex: 1, minHeight: 56 }}
							textStyle={{ color: theme.colors.buttonText }}
							icon="check"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
						/>
					) : (
						<QPButton
							title={t('common.actions.continue')}
							onPress={() => {
								// Gate preventivo: el backend rechaza envíos >= $500 sin KYC
								if (!requireKyc({
									gated: Number(send_amount) >= KYC_TRANSFER_THRESHOLD,
									message: t('transactions.sendConfirm.kycGateMessage', { amount: KYC_TRANSFER_THRESHOLD }),
								})) return
								setShowPinStep(true); setPin('')
							}}
							style={{ flex: 1, minHeight: 56 }}
							textStyle={{ color: theme.colors.buttonText }}
							icon="arrow-right"
							iconColor={theme.colors.buttonText}
							iconStyle="solid"
						/>
					)}
				</>
			}
		>

			<View>

				<TransferSummaryCards
					recipientUser={recipientUser}
					sendAmount={send_amount}
					description={description}
					isUserOnline={isUserOnline}
					theme={theme}
					textStyles={textStyles}
					containerStyles={containerStyles}
				/>

				{/* PIN/OTP Step */}
				{showPinStep && (
					<PinConfirmStep
						pin={pin}
						onChangePin={setPin}
						codeLength={codeLength}
						twoFactorMethod={twoFactorMethod}
						hasOTP={hasOTP}
						sendingPin={sendingPin}
						onMethodToggle={handleMethodToggle}
						onRequestPin={handleRequestPin}
						onBoxFocus={handlePinBoxFocus}
						codeInputRef={codeInputRef}
						theme={theme}
						textStyles={textStyles}
						containerStyles={containerStyles}
					/>
				)}

			</View>

			{/* useKycGate expone `string | null` y el modal declara `string | undefined`
			    (mismo cast que ui/ActionButtons) */}
			<KycGateModal visible={gateVisible} message={gateMessage as string | undefined} onClose={closeGate} />

		</QPKeyboardView>
	)
}

export default SendConfirm
