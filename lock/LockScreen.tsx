import { useState, useEffect, useEffectEvent, useRef, useCallback, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// RN
import { View, Text, Modal, StyleSheet } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useSettings } from '../settings/SettingsContext'
import { useAppLock, APP_LOCK_BIO_SERVICE } from './AppLockContext'
import { hasBiometricMarker } from '../helpers/biometricMarker'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { getSupportedBiometryType, hasBiometricCredentials } from '../api/client'

// Icons
import FaceIDIcon from '../ui/particles/FaceIDIcon'

// UI
import PinDots from './PinDots'
import type { PinDotsHandle } from './PinDots'
import UnlockHalo from './UnlockHalo'

// Biometric type + availability are detected together in one effect
type BiometricsState = {
	type: string | null
	available: boolean
}

type BiometricsAction = { type: 'detected', biometryType: string | null, available: boolean }

const initialBiometrics: BiometricsState = { type: null, available: false }

function biometricsReducer(state: BiometricsState, action: BiometricsAction): BiometricsState {
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

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { security } = useSettings()
	const { isLocked, unlockWithBiometrics, unlockWithPin } = useAppLock()
	// Este Modal lleva `statusBarTranslucent` y el manifest usa `adjustNothing`: en Android
	// el teclado NO redimensiona la ventana y tapaba las cajas del PIN (issue #47). Se sigue
	// la altura a mano, como QPKeyboardView, y se cede ese espacio abajo
	const { keyboardHeight, keyboardVisible } = useKeyboardHeight()

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)
	const { type: biometryType, available: biometricsAvailable } = biometrics
	const dotsRef = useRef<PinDotsHandle | null>(null)

	// Check biometric availability when lock screen appears
	useEffect(() => {
		if (!isLocked) return
		let cancelled = false
		const checkBiometrics = async () => {
			const [type, hasCredentials, hasMarker] = await Promise.all([getSupportedBiometryType(), hasBiometricCredentials(), hasBiometricMarker(APP_LOCK_BIO_SERVICE)])
			if (cancelled) return
			// Marcador propio del bloqueo (cualquier login) o, como antes, credenciales del login + ajuste
			const viaMarker = hasMarker && security.appLockBiometrics !== false
			dispatchBiometrics({ type: 'detected', biometryType: type, available: !!type && (viaMarker || (hasCredentials && security.biometricsEnabled)) })
		}
		checkBiometrics()
		return () => { cancelled = true }
	}, [isLocked, security.biometricsEnabled, security.appLockBiometrics])

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

	const biometryLabel = biometryType === 'FaceID' ? t('misc.lock.unlock.faceId')
		: biometryType === 'TouchID' ? t('misc.lock.unlock.touchId')
			: biometryType === 'Fingerprint' ? t('misc.lock.unlock.fingerprint')
				: t('misc.lock.unlock.biometrics')

	// El glifo del héroe: el que desbloquea si hay biometría, un candado si no
	const heroIcon = !biometricsAvailable
		? <FontAwesome6 name="lock" size={44} color={theme.colors.primary} iconStyle="solid" />
		: biometryType === 'FaceID'
			? <FaceIDIcon size={56} color={theme.colors.primary} />
			: <FontAwesome6 name="fingerprint" size={56} color={theme.colors.primary} iconStyle="solid" />

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
			<View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: keyboardVisible ? keyboardHeight : insets.bottom }]}>

				{/* El héroe: el glifo que desbloquea, respirando sobre su halo. Con biometría
				    disponible es el botón —tocarlo la pide—; sin ella, solo acompaña. */}
				<UnlockHalo
					size={72}
					onPress={biometricsAvailable ? handleBiometricUnlock : undefined}
					accessibilityLabel={biometryLabel}
				>
					{heroIcon}
				</UnlockHalo>

				{/* Una sola línea de texto. Antes eran tres —título, etiqueta del icono y
				    "o introduce tu PIN"— diciendo casi lo mismo alrededor de una raya. */}
				<Text style={[textStyles.h5, styles.hint, { color: theme.colors.secondaryText }]}>
					{biometricsAvailable ? t('misc.lock.tapToUnlock', { method: biometryLabel }) : t('misc.lock.enterPin')}
				</Text>

				<View style={styles.dots}>
					<PinDots
						ref={dotsRef}
						length={4}
						code={pin}
						onChangeCode={handleChangePin}
						onFilled={verifyPin}
					/>
				</View>

				{/* Altura reservada: sin ella, el error empuja los puntos al aparecer */}
				<View style={styles.errorSlot}>
					{!!error && (
						<Text style={[textStyles.h6, styles.error, { color: theme.colors.danger }]}>{error}</Text>
					)}
				</View>

			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 24,
	},
	// El halo ocupa 200 px y se sale de su caja: el aire de debajo lo cuenta el hint
	hint: { textAlign: 'center', marginTop: 44 },
	dots: { marginTop: 36 },
	errorSlot: { height: 40, justifyContent: 'center' },
	error: { textAlign: 'center' },
})

export default LockScreen
