import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// RN
import { View, Text, Image, Modal, StyleSheet } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useAppLock } from './AppLockContext'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { useLockBiometrics, getBiometryLabelKey } from './useLockBiometrics'

// Icons
import LockHeroIcon from './LockHeroIcon'
import QPPressable from '../ui/particles/QPPressable'

// UI
import PinDots from './PinDots'
import type { PinDotsHandle } from './PinDots'

/**
 * Full-screen app-lock overlay: 4-digit PIN entry with optional biometric unlock.
 * Rendered by AppLockProvider above the NavigationContainer whenever the app is
 * locked — it is not a navigation route and takes no props.
 * The PIN verifies against the Keychain (`com.qvapay.applock`) via `unlockWithPin`;
 * biometrics auto-prompt ~500ms after the screen appears when enabled in settings.
 * A wrong PIN shakes the input boxes, clears them and refocuses the first one.
 */
const LockScreen = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { isLocked, unlockWithPin } = useAppLock()
	// Este Modal lleva `statusBarTranslucent` y el manifest usa `adjustNothing`: en Android
	// el teclado NO redimensiona la ventana y tapaba las cajas del PIN (issue #47). Se sigue
	// la altura a mano, como QPKeyboardView, y se cede ese espacio abajo
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const dotsRef = useRef<PinDotsHandle | null>(null)

	const clearError = useCallback(() => setError(''), [])
	const { biometryType, available: biometricsAvailable, unlock: handleBiometricUnlock } = useLockBiometrics(isLocked, clearError)

	// Reset state when lock screen is shown/hidden
	useEffect(() => {
		if (isLocked) {
			setPin('')
			setError('')
		}
	}, [isLocked])

	// El PIN se verifica en cuanto cae el cuarto dígito, sin pasar por un efecto
	const verifyPin = async (code: string) => {
		const result = await unlockWithPin(code)
		if (!result.success) {
			setError(t('misc.lock.errors.wrongPin'))
			setPin('')
			dotsRef.current?.shake()
			setTimeout(() => dotsRef.current?.focus(), 300)
		}
	}

	const handleChangePin = (code: string) => {
		setPin(code)
		setError('')
	}

	const biometryLabel = t(getBiometryLabelKey(biometryType))
	const heroIcon = <LockHeroIcon biometryType={biometryType} biometricsAvailable={biometricsAvailable} color={theme.colors.primary} />

	if (!isLocked) return null

	return (
		<Modal
			visible={isLocked}
			animationType="fade"
			transparent={false}
			statusBarTranslucent
			onRequestClose={() => { }}
		>
			<SystemBars style={theme.isDark ? 'light' : 'dark'} />
			<View testID="lock-screen" style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: keyboardVisible ? keyboardHeight : insets.bottom }]}>

				{/* La marca, en voz baja: recuerda dónde estás sin competir con el héroe */}
				<View style={styles.brand}>
					<Image
						source={theme.isDark
							? require('../assets/images/ui/qvapay-logo-white.png')
							: require('../assets/images/ui/logo-qvapay.png')}
						style={styles.brandLogo}
						resizeMode="contain"
					/>
					<Text style={[styles.brandName, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}>QvaPay</Text>
				</View>

				{/* El resto vive centrado en el espacio que queda */}
				<View style={styles.stage}>

					{/* El héroe: el glifo que desbloquea, solo, sin adornos. Con biometría
					    disponible es el botón —tocarlo la pide—; sin ella, solo acompaña. */}
					{biometricsAvailable
						? <QPPressable onPress={handleBiometricUnlock} accessibilityRole="button" accessibilityLabel={biometryLabel} hitSlop={24}>{heroIcon}</QPPressable>
						: heroIcon}

					{/* Una sola línea de texto. Antes eran tres —título, etiqueta del icono y
					    "o introduce tu PIN"— diciendo casi lo mismo alrededor de una raya. */}
					<Text style={[styles.hint, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.light }]}>
						{biometricsAvailable ? t('misc.lock.tapToUnlock', { method: biometryLabel }) : t('misc.lock.enterPin')}
					</Text>

					<View style={styles.dots}>
						<PinDots
							ref={dotsRef}
							length={4}
							code={pin}
							onChangeCode={handleChangePin}
							onFilled={verifyPin}
							tone={error ? theme.colors.dangerText : undefined}
						/>
					</View>

					{/* Altura reservada: sin ella, el error empuja los puntos al aparecer */}
					<View style={styles.errorSlot}>
						{!!error && (
							<Text style={[textStyles.h6, styles.error, { color: theme.colors.dangerText }]}>{error}</Text>
						)}
					</View>

				</View>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		paddingHorizontal: 24,
		paddingTop: 24,
	},
	// 55%: presente sin disputarle la atención al héroe
	brand: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.55, marginTop: 40 },
	brandLogo: { width: 16, height: 16 },
	brandName: { fontSize: 14, letterSpacing: 0.2 },
	stage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
	hint: { textAlign: 'center', marginTop: 28, fontSize: 16, letterSpacing: 0.2 },
	dots: { marginTop: 32 },
	errorSlot: { height: 40, justifyContent: 'center' },
	error: { textAlign: 'center' },
})

export default LockScreen
