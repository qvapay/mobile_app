import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, TextInput, Pressable, Modal, StyleSheet, Animated, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LottieView from 'lottie-react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useSettings } from '../settings/SettingsContext'
import { useAppLock } from './AppLockContext'
import { getSupportedBiometryType, hasBiometricCredentials } from '../api/client'
import FaceIDIcon from '../ui/particles/FaceIDIcon'

const LockScreen = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { security } = useSettings()
	const { isLocked, unlockWithBiometrics, unlockWithPin } = useAppLock()

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [biometryType, setBiometryType] = useState(null)
	const [biometricsAvailable, setBiometricsAvailable] = useState(false)
	const pinInputsRef = useRef([])
	const [focusedInputIndex, setFocusedInputIndex] = useState(null)
	const shakeAnim = useRef(new Animated.Value(0)).current

	// Check biometric availability when lock screen appears
	useEffect(() => {
		if (!isLocked) return
		const checkBiometrics = async () => {
			const type = await getSupportedBiometryType()
			const hasCredentials = await hasBiometricCredentials()
			setBiometryType(type)
			setBiometricsAvailable(!!type && hasCredentials && security.biometricsEnabled)
		}
		checkBiometrics()
	}, [isLocked, security.biometricsEnabled])

	// Auto-prompt biometrics when lock screen appears
	useEffect(() => {
		if (!isLocked || !biometricsAvailable) return
		const timer = setTimeout(() => {
			handleBiometricUnlock()
		}, 500)
		return () => clearTimeout(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLocked, biometricsAvailable])

	// Reset state when lock screen is shown/hidden
	useEffect(() => {
		if (isLocked) {
			setPin('')
			setError('')
			setFocusedInputIndex(null)
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

	// Auto-submit when 4 digits entered
	useEffect(() => {
		if (pin.length === 4) {
			const verify = async () => {
				const result = await unlockWithPin(pin)
				if (!result.success) {
					setError('PIN incorrecto')
					setPin('')
					triggerShake()
					setTimeout(() => pinInputsRef.current[0]?.focus(), 300)
				}
			}
			verify()
		}
	}, [pin, unlockWithPin, triggerShake])

	const handleBiometricUnlock = useCallback(async () => {
		setError('')
		await unlockWithBiometrics()
	}, [unlockWithBiometrics])

	// PIN input handlers (same pattern as SendConfirm.jsx)
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')
		const newPin = pin.split('')
		newPin[index] = numericText
		const updatedPin = newPin.join('')
		setPin(updatedPin)
		setError('')
		if (numericText && index < 3) { pinInputsRef.current[index + 1]?.focus() }
	}

	const handlePinFocus = (index) => { setFocusedInputIndex(index) }
	const handlePinBlur = () => { setFocusedInputIndex(null) }

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
			<StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
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

				{/* PIN input */}
				<Animated.View style={[styles.pinContainer, { transform: [{ translateX: shakeAnim }] }]}>
					{Array.from({ length: 4 }, (_, index) => (
						<TextInput
							key={`lock-pin-${index}`}
							ref={(ref) => pinInputsRef.current[index] = ref}
							style={[styles.pinInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.bold }]}
							value={pin[index] || ''}
							onChangeText={(text) => handlePinChange(text, index)}
							onFocus={() => handlePinFocus(index)}
							onBlur={handlePinBlur}
							onKeyPress={(e) => handlePinKeyPress(e, index)}
							keyboardType="numeric"
							secureTextEntry
							textAlign="center"
							selectTextOnFocus
							textContentType="oneTimeCode"
							autoComplete="sms-otp"
							placeholder={focusedInputIndex === index ? '' : '0'}
							placeholderTextColor={theme.colors.tertiaryText}
						/>
					))}
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
	animationContainer: {
		width: 150,
		height: 150,
		alignItems: 'center',
		justifyContent: 'center',
	},
	lottie: {
		width: 150,
		height: 150,
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
		flexDirection: 'row',
		gap: 8,
		marginTop: 24,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		fontWeight: 'bold',
		textAlign: 'center',
	},
})

export default LockScreen
