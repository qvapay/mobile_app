import { useState, useRef, useEffect, useReducer } from 'react'
import { View, Text } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import PinConfirmStep from './PinConfirmStep'
import QPButton from '../../ui/particles/QPButton'
import QPKeyboardView from '../../ui/QPKeyboardView'
import TransferSummaryCards from './TransferSummaryCards'

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

// PIN/OTP entry sub-flow state — one cohesive unit
function pinFlowReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		default:
			return state
	}
}
const initialPinFlow = { showPinStep: false, sendingPin: false, twoFactorMethod: 'pin', pin: '', focusedInputIndex: null }

/**
 * Transfer confirmation: shows recipient + amount, then a PIN/OTP step before sending.
 * Route params: `send_amount`, `user_uuid` and optional `description` (may be a sticker).
 * Resolves the recipient via `userApi.searchUser`, requests the emailed 4-digit PIN
 * through `withdrawApi.requestPin` (or accepts a 6-digit TOTP when 2FA is enrolled),
 * and executes the transfer with `POST /transaction/transfer`.
 * On success it navigates to SendSuccess with the transfer summary.
 */
const SendConfirm = ({ navigation, route }) => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	// Params from route
	const { send_amount, user_uuid, description = '' } = route.params || {}

	// Online status
	const { trackUsers, untrackUsers, isUserOnline } = useOnlineStatus()

	// States
	const [recipientUser, setRecipientUser] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingUser, setIsLoadingUser] = useState(true)

	// PIN/OTP flow (same-named setters keep every call site unchanged)
	const [pinFlow, dispatchPin] = useReducer(pinFlowReducer, initialPinFlow)
	const { showPinStep, sendingPin, twoFactorMethod, pin, focusedInputIndex } = pinFlow
	const setShowPinStep = (value) => dispatchPin({ type: 'set', field: 'showPinStep', value })
	const setSendingPin = (value) => dispatchPin({ type: 'set', field: 'sendingPin', value })
	const setTwoFactorMethod = (value) => dispatchPin({ type: 'set', field: 'twoFactorMethod', value })
	const setPin = (value) => dispatchPin({ type: 'set', field: 'pin', value })
	const setFocusedInputIndex = (value) => dispatchPin({ type: 'set', field: 'focusedInputIndex', value })

	const hasOTP = !!user?.two_factor_secret
	const codeLength = twoFactorMethod === 'pin' ? 4 : 6
	const pinInputsRef = useRef([])
	const scrollViewRef = useRef(null)

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
				if (result.success && result.data.length > 0) {
					setRecipientUser(result.data[0])
				} else {
					toast.error('Error', { description: 'No se pudo encontrar el usuario destinatario' })
					navigation.goBack()
				}
			} catch (error) {
				if (cancelled) return
				toast.error('Error', { description: 'Error al cargar los datos del destinatario' })
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
				toast.success('PIN enviado', { description: 'Revisa tu correo electrónico' })
			} else {
				toast.error(result.error || 'No se pudo enviar el PIN')
			}
		} catch (error) {
			toast.error('Error al solicitar el PIN')
		} finally { setSendingPin(false) }
	}

	// Switch between PIN and OTP
	const handleMethodToggle = (side) => {
		const method = side === 'left' ? 'pin' : 'otp'
		if (method !== twoFactorMethod) {
			setTwoFactorMethod(method)
			setPin('')
			pinInputsRef.current = new Array(method === 'pin' ? 4 : 6).fill(null)
			setTimeout(() => { pinInputsRef.current[0]?.focus() }, 0)
		}
	}

	// Handle PIN input change
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')
		if (numericText.length > 1) {
			const digits = numericText.slice(0, codeLength).split('')
			const newPin = pin.split('')
			digits.forEach((d, i) => { if (index + i < codeLength) newPin[index + i] = d })
			setPin(newPin.join(''))
			const focusIdx = Math.min(index + digits.length, codeLength - 1)
			pinInputsRef.current[focusIdx]?.focus()
			return
		}
		const newPin = pin.split('')
		newPin[index] = numericText
		setPin(newPin.join(''))
		if (numericText && index < codeLength - 1) { pinInputsRef.current[index + 1]?.focus() }
	}

	// Auto-submit when all digits entered
	useEffect(() => {
		if (pin.length === codeLength && !isLoading) {
			executeTransaction()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin])

	// Auto-scroll to PIN section when it appears
	useEffect(() => {
		if (!showPinStep) return
		const timer = setTimeout(() => {
			scrollViewRef.current?.scrollToEnd({ animated: true })
			pinInputsRef.current[0]?.focus()
		}, 100)
		return () => clearTimeout(timer)
	}, [showPinStep])

	// Handle PIN input focus/blur
	const handlePinFocus = (index) => {
		setFocusedInputIndex(index)
		setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
	}
	const handlePinBlur = () => { setFocusedInputIndex(null) }

	// Handle PIN backspace
	const handlePinKeyPress = (e, index) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (pin[index]) {
				const newPin = pin.split('')
				newPin[index] = ''
				setPin(newPin.join(''))
			} else if (index > 0) {
				const newPin = pin.split('')
				newPin[index - 1] = ''
				setPin(newPin.join(''))
				pinInputsRef.current[index - 1]?.focus()
			}
		}
	}

	// Execute the actual transaction
	const executeTransaction = async () => {

		if (!pin || pin.length !== codeLength) {
			toast.error(twoFactorMethod === 'pin' ? 'Ingresa un PIN de 4 dígitos' : 'Ingresa un código OTP de 6 dígitos')
			return
		}

		try {
			setIsLoading(true)
			const result = await transferApi.transferMoney({
				amount: send_amount,
				description: description,
				to: recipientUser.uuid,
				pin: pin
			})

			if (result.success) {
				getActiveSession()?.notifyPaymentSent({ toUuid: recipientUser.uuid, amount: send_amount, txUuid: result.data?.uuid })
				navigation.navigate(ROUTES.SEND_SUCCESS, { amount: send_amount, recipient: recipientUser, description: description })
			} else {
				toast.error('Error en la transacción', { description: result.error || 'No se pudo completar la transacción' })
			}
		} catch (error) {
			toast.error('Error', { description: error.message || 'Error inesperado al procesar la transacción' })
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
					Usuario no encontrado
				</Text>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 10, textAlign: 'center' }]}>
					No se pudo encontrar el usuario destinatario
				</Text>
				<QPButton
					title="Volver"
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
						style={{ width: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 0, backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.primaryText }}
						icon="xmark"
						iconColor={theme.colors.primaryText}
						iconStyle="solid"
					/>

					{showPinStep ? (
						<QPButton
							title="Confirmar Envío"
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
							title="Continuar"
							onPress={() => { setShowPinStep(true); setPin('') }}
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
						codeLength={codeLength}
						twoFactorMethod={twoFactorMethod}
						hasOTP={hasOTP}
						sendingPin={sendingPin}
						focusedInputIndex={focusedInputIndex}
						pinInputsRef={pinInputsRef}
						onPinChange={handlePinChange}
						onKeyPress={handlePinKeyPress}
						onFocus={handlePinFocus}
						onBlur={handlePinBlur}
						onMethodToggle={handleMethodToggle}
						onRequestPin={handleRequestPin}
						theme={theme}
						textStyles={textStyles}
						containerStyles={containerStyles}
					/>
				)}

			</View>

		</QPKeyboardView>
	)
}

export default SendConfirm
