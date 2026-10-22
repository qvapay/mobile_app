import { useState, useCallback, useMemo, useRef } from 'react'
import {
	StyleSheet,
	Text,
	View,
	Pressable,
	AccessibilityInfo,
	Platform
} from 'react-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPBalance from '../../ui/particles/QPBalance'
import QPKeypad from '../../ui/QPKeypad'

// Routes
import { ROUTES } from '../../routes'

// Toast
import { toast } from 'sonner-native'

// Amount input logic (pure, unit-tested in keypadAmount.test.js)
import { applyKeypadKey } from './keypadAmount'

// Tipos
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MainTabParamList, RootStackParamList } from '../../types/navigation'

/** Keypad es un tab de MainStack que navega a rutas del stack raíz (Send/Receive/NearbyPay). */
type KeypadProps = CompositeScreenProps<
	BottomTabScreenProps<MainTabParamList, 'Keypad'>,
	NativeStackScreenProps<RootStackParamList>
>

// Constants
const MIN_FONT_SIZE = 40
const MAX_FONT_SIZE = 80
const FONT_SIZE_DECREASE_FACTOR = 4

/**
 * Calculator-style amount pad (center bottom tab) used to start a payment.
 * Pure key handling lives in `keypadAmount.ts` (unit-tested); this screen only
 * validates the amount against the user's balance and routes to Send
 * (`ROUTES.SEND`, param `send_amount`) or Receive (`ROUTES.RECEIVE`, param
 * `receive_amount`) — it performs no API calls itself.
 * The amount font shrinks as digits grow; every key press fires the same `impactLight`
 * haptic as the tab bar (Taptic Engine on iOS, vibrator fallback on Android).
 */
export default function Keypad({ navigation }: KeypadProps) {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const insets = useSafeAreaInsets()
	const { t } = useTranslation()

	// State
	const [amount, setAmount] = useState('0')
	// El monto vive también en un ref: dos toques antes de repintar leían el mismo
	// `amount` y el segundo pisaba al primero. Además deja `handleKeyPress` estable,
	// que es lo que necesita el memo de QPKeypad para no repintar las doce teclas
	const amountRef = useRef('0')
	const [isProcessing, setIsProcessing] = useState(false)

	// Refs
	const [fontSize, setFontSize] = useState(MAX_FONT_SIZE)

	// Memoized values
	const containerStyles = useMemo(() => createContainerStyles(theme), [theme])

	// Haptic feedback — mismo tic que el cambio de pestaña del BottomBar (MainStack)
	const triggerHapticFeedback = useCallback(() => {
		ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
	}, [])

	// Calculate font size based on amount length
	const calculateFontSize = useCallback((currentAmount: string) => {
		const baseSize = MAX_FONT_SIZE
		const decreaseFactor = FONT_SIZE_DECREASE_FACTOR
		// Count only numeric characters for font size calculation
		const numericLength = currentAmount.replace('.', '').length
		const newSize = baseSize - ((numericLength - 1) * decreaseFactor)
		return Math.max(newSize, MIN_FONT_SIZE)
	}, [])

	// Update font size
	const animateFontSize = useCallback((newSize: number) => {
		setFontSize(newSize)
	}, [])

	// Handle key press
	// El tic háptico de cada tecla lo da QPKeypad
	const handleKeyPress = useCallback((key: string) => {

		const newAmount = applyKeypadKey(amountRef.current, key)

		// Key was rejected (invalid / no-op) — nothing changed.
		if (newAmount === amountRef.current) { return }

		// Update amount and animate font size
		amountRef.current = newAmount
		setAmount(newAmount)
		const newFontSize = calculateFontSize(newAmount)
		animateFontSize(newFontSize)

		// Announce to screen reader
		AccessibilityInfo.announceForAccessibility(t('keypad.a11y.amountAnnouncement', { amount: newAmount }))

	}, [calculateFontSize, animateFontSize, t])

	// Set maximum balance
	const setMaxBalance = useCallback(() => {

		if (!user?.balance) return
		const maxAmount = user.balance.toString()
		amountRef.current = maxAmount
		setAmount(maxAmount)
		const newFontSize = calculateFontSize(maxAmount)
		animateFontSize(newFontSize)
		triggerHapticFeedback()

		// Announce to screen reader
		AccessibilityInfo.announceForAccessibility(t('keypad.a11y.maxBalanceAnnouncement', { amount: maxAmount }))

	}, [user?.balance, calculateFontSize, animateFontSize, triggerHapticFeedback, t])

	// Send amount
	const handleSendAmount = useCallback(async () => {

		if (isProcessing) return
		triggerHapticFeedback()
		const numericAmount = parseFloat(amount)

		if (numericAmount <= 0) {
			toast.error(t('keypad.toasts.invalidAmount.title'), { description: t('keypad.toasts.invalidAmount.description') })
			return
		}

		// `balance` es Decimal (string | number según endpoint): la comparación
		// se deja EXACTA — JS coacciona el string — y solo se tipa el operando
		if (user?.balance && numericAmount > (user.balance as number)) {
			toast.error(t('keypad.toasts.insufficientBalance.title'), { description: t('keypad.toasts.insufficientBalance.description') })
			return
		}

		setIsProcessing(true)

		try {
			navigation.navigate(ROUTES.SEND, { send_amount: numericAmount.toString() })
		} catch (err) {
			toast.error(t('keypad.toasts.sendError.title'), { description: t('keypad.toasts.sendError.description') })
		} finally { setIsProcessing(false) }

	}, [amount, user?.balance, isProcessing, navigation, triggerHapticFeedback, t])

	// Receive amount
	const handleReceiveAmount = useCallback(() => {
		triggerHapticFeedback()
		const numericAmount = parseFloat(amount)
		navigation.navigate(ROUTES.RECEIVE, { receive_amount: numericAmount.toString() })
	}, [amount, navigation, triggerHapticFeedback])

	// Nearby radar — any typed amount travels along as prefill
	const handleNearby = useCallback(() => {
		triggerHapticFeedback()
		const numericAmount = parseFloat(amount)
		navigation.navigate(ROUTES.NEARBY_PAY, numericAmount > 0 ? { prefill_amount: numericAmount.toString() } : {})
	}, [amount, navigation, triggerHapticFeedback])

	// Format amount for display
	const formattedAmount = useMemo(() => {
		const numericAmount = parseFloat(amount)
		return isNaN(numericAmount) ? '0' : amount
	}, [amount])

	return (
		<View style={[containerStyles.container, styles.container, Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 && { paddingBottom: insets.bottom + 60 }]}>
			{/* Amount Display Section */}
			<View style={styles.amountSection}>

				<QPBalance formattedAmount={formattedAmount} fontSize={fontSize} theme={theme} />

				{/* Balance Display */}
				<Pressable
					style={[styles.balanceContainer, { backgroundColor: theme.colors.elevation }]}
					onPress={setMaxBalance}
					accessibilityRole="button"
					accessibilityLabel={t('keypad.a11y.balanceLabel', { balance: user?.balance || 0 })}
					accessibilityHint={t('keypad.a11y.balanceHint')}
				>
					<Text style={[styles.balanceText, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]}>
						${user?.balance || 0}
					</Text>
				</Pressable>
			</View>

			{/* Keypad Section */}
			<QPKeypad
				onKey={handleKeyPress}
				extraKey="decimal"
				disabled={isProcessing}
				numberHint={t('keypad.a11y.numberKeyHint')}
				deleteHint={t('keypad.a11y.deleteKeyHint')}
			/>

			{/* Action Buttons */}
			<View style={styles.actionSection}>
				<QPButton
					title={t('keypad.actions.receive')}
					onPress={handleReceiveAmount}
					disabled={isProcessing}
					icon="arrow-down"
					style={[styles.actionButton, { backgroundColor: theme.colors.elevation }, isProcessing && styles.actionButtonDisabled]}
					iconColor={theme.colors.contrast}
					textStyle={{ color: theme.colors.contrast }}
					iconStyle="solid"
				/>
				{/* Nearby radar — iOS only until BleTransport (phase 2) lands on Android */}
				{Platform.OS === 'ios' && (
					<QPButton
						title=""
						onPress={handleNearby}
						disabled={isProcessing}
						icon="tower-broadcast"
						style={[styles.nearbyButton, { backgroundColor: theme.colors.elevation }, isProcessing && styles.actionButtonDisabled]}
						iconColor={theme.colors.contrast}
						iconStyle="solid"
					/>
				)}
				<QPButton
					title={t('keypad.actions.send')}
					onPress={handleSendAmount}
					disabled={isProcessing}
					icon="arrow-up"
					style={[styles.actionButton, { backgroundColor: theme.colors.primary }, isProcessing && styles.actionButtonDisabled]}
					iconColor={theme.colors.almostWhite}
					textStyle={{ color: theme.colors.almostWhite }}
					iconStyle="solid"
				/>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingHorizontal: 20,
	},
	amountSection: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 20,
	},
	balanceContainer: {
		paddingHorizontal: 16,
		paddingTop: 4,
		paddingBottom: 3,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: 'rgba(255, 255, 255, 0.1)',
	},
	balanceText: {},
	actionSection: {
		flexDirection: 'row',
		gap: 12,
		paddingBottom: 8,
	},
	actionButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 16,
		minHeight: 56,
	},
	actionButtonDisabled: {
		opacity: 0.6,
	},
	nearbyButton: {
		width: 56,
		minHeight: 56,
		alignItems: 'center',
		justifyContent: 'center',
	},
})