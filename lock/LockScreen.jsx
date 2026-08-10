import { useState, useEffect, useEffectEvent, useRef, useCallback, useReducer } from 'react'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// RN
import { View, Text, Pressable, Modal, StyleSheet, Animated } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useSettings } from '../settings/SettingsContext'
import { useAppLock } from './AppLockContext'
import { getSupportedBiometryType, hasBiometricCredentials } from '../api/client'

// Icons
import FaceIDIcon from '../ui/particles/FaceIDIcon'

// UI
import QPCodeInput from '../ui/particles/QPCodeInput'

// Biometric type + availability are detected together in one effect
const initialBiometrics = { type: null, available: false }

function biometricsReducer(state, action) {
	switch (action.type) {
		case 'detected':
			return { type: action.biometryType, available: action.available }
		default:
			return state
	}
}

/**
 * Full-screen app-lock overlay: 4-digit PIN entry with optional biometric unlock.
 * Rendered by AppLockProvider above the NavigationContainer whenever the app is
 * locked — it is not a navigation route and takes no props.
 * The PIN verifies against the Keychain (`com.qvapay.applock`) via `unlockWithPin`;
 * biometrics auto-prompt ~500ms after the screen appears when enabled in settings.
 * A wrong PIN shakes the input boxes, clears them and refocuses the first one.
 */
const LockScreen = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { security } = useSettings()
	const { isLocked, unlockWithBiometrics, unlockWithPin } = useAppLock()

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)
	const { type: biometryType, available: biometricsAvailable } = biometrics
	const codeInputRef = useRef(null)
	const shakeAnim = useRef(new Animated.Value(0)).current

	// Check biometric availability when lock screen appears
	useEffect(() => {
		if (!isLocked) return
		let cancelled = false
		const checkBiometrics = async () => {
			const type = await getSupportedBiometryType()
			const hasCredentials = await hasBiometricCredentials()
			if (cancelled) return
			dispatchBiometrics({ type: 'detected', biometryType: type, available: !!type && hasCredentials && security.biometricsEnabled })
		}
		checkBiometrics()
		return () => { cancelled = true }
	}, [isLocked, security.biometricsEnabled])

	const handleBiometricUnlock = useCallback(async () => {
		setError('')
		await unlockWithBiometrics()
	}, [unlockWithBiometrics])

	// Effect Event: reads the latest unlock callback without re-arming the timer
	const onBiometricAutoPrompt = useEffectEvent(() => { handleBiometricUnlock() })

	// Auto-prompt biometrics when lock screen appears
	useEffect(() => {
		if (!isLocked || !biometricsAvailable) return
		const timer = setTimeout(() => {
			onBiometricAutoPrompt()
		}, 500)
		return () => clearTimeout(timer)
	}, [isLocked, biometricsAvailable])

	// Reset state when lock screen is shown/hidden
	useEffect(() => {
		if (isLocked) {
			setPin('')
			setError('')
		}
	}, [isLocked])

	const triggerShake = useCallback(() => {
		Animated.sequence([
			Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
		]).start()
	}, [shakeAnim])

	// Verify the entered PIN — QPCodeInput's onFilled fires the moment the 4th digit
	// lands (no state round-trip through an effect).
	const verifyPin = async (code) => {
		const result = await unlockWithPin(code)
		if (!result.success) {
			setError('PIN incorrecto')
			setPin('')
			triggerShake()
			setTimeout(() => codeInputRef.current?.focus(0), 300)
		}
	}

	const handleChangePin = (code) => {
		setPin(code)
		setError('')
	}

	const getBiometryLabel = () => {
		switch (biometryType) {
			case 'FaceID': return 'Desbloquear con Face ID'
			case 'TouchID': return 'Desbloquear con Touch ID'
			case 'Fingerprint': return 'Desbloquear con huella'
			default: return 'Desbloquear con biometr\u00eda'
		}
	}

	const getBiometryIcon = () => {
		if (biometryType === 'FaceID') {
			return <FaceIDIcon size={48} color={theme.colors.primary} />
		}
		return <FontAwesome6 name="fingerprint" size={48} color={theme.colors.primary} iconStyle="solid" />
	}

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
			<View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>

				{/* Title */}
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8 }]}>
					Ingresa tu PIN de seguridad
				</Text>

				{/* Biometric button */}
				{biometricsAvailable && (
					<View style={styles.biometricSection}>
						<Pressable style={[styles.biometricButton, { backgroundColor: theme.colors.surface }]} onPress={handleBiometricUnlock} >
							{getBiometryIcon()}
						</Pressable>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 12 }]}>
							{getBiometryLabel()}
						</Text>

						{/* Separator */}
						<View style={styles.separatorRow}>
							<View style={[styles.separatorLine, { backgroundColor: theme.colors.border }]} />
							<Text style={[textStyles.h7, { color: theme.colors.tertiaryText, marginHorizontal: 12 }]}>
								o ingresa tu PIN
							</Text>
							<View style={[styles.separatorLine, { backgroundColor: theme.colors.border }]} />
						</View>
					</View>
				)}

				{/* PIN input — QPCodeInput verifies vía onFilled al caer el 4to dígito */}
				<Animated.View style={[styles.pinContainer, { transform: [{ translateX: shakeAnim }] }]}>
					<QPCodeInput
						ref={codeInputRef}
						length={4}
						code={pin}
						onChangeCode={handleChangePin}
						onFilled={verifyPin}
						secure
					/>
				</Animated.View>

				{/* Error message */}
				{error ? (
					<Text style={[textStyles.h6, { color: theme.colors.danger, textAlign: 'center', marginTop: 12 }]}>
						{error}
					</Text>
				) : (<></>)}

			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 16,
	},
	biometricSection: {
		alignItems: 'center',
		marginTop: 32,
	},
	biometricButton: {
		width: 80,
		height: 80,
		borderRadius: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	separatorRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 24,
	},
	separatorLine: {
		flex: 1,
		height: 1,
	},
	pinContainer: {
		marginTop: 24,
	},
})

export default LockScreen
