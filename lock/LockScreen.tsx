import { useState, useEffect, useEffectEvent, useMemo, useRef, useCallback, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import LinearGradient from 'react-native-linear-gradient'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence } from 'react-native-reanimated'

// RN
import { View, Text, Modal, StyleSheet } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles, hexToRgba } from '../theme/themeUtils'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'
import { useAppLock } from './AppLockContext'
import { getSupportedBiometryType, hasBiometricCredentials } from '../api/client'

// Helpers
import { displayName } from '../helpers/displayName'

// Icons
import FaceIDIcon from '../ui/particles/FaceIDIcon'

// UI
import QPAvatar from '../ui/particles/QPAvatar'
import QPPinDots from '../ui/particles/QPPinDots'
import QPPinPad from '../ui/particles/QPPinPad'

const PIN_LENGTH = 4

// El PIN fallido se queda un instante en rojo antes de vaciarse: sin esa pausa
// los puntos se borran antes de que al ojo le dé tiempo a registrar el error
const WRONG_PIN_HOLD = 420

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
 *
 * El PIN se teclea con el pad propio de la app (`QPPinPad` + `QPPinDots`), NO con
 * cajas de texto: el teclado del sistema tapaba el campo sin dejar scroll y podía
 * perder dígitos al teclear rápido (issue #47). Sin campo de texto no hay teclado
 * que tape nada, y cada pulsación es un evento suelto que no se pisa con el anterior.
 * Un PIN incorrecto tiñe los puntos, sacude la fila y la vacía.
 */
const LockScreen = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { user } = useAuth()
	const { security } = useSettings()
	const { isLocked, unlockWithBiometrics, unlockWithPin } = useAppLock()

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [biometrics, dispatchBiometrics] = useReducer(biometricsReducer, initialBiometrics)
	const { type: biometryType, available: biometricsAvailable } = biometrics

	// Espejo del PIN: las pulsaciones pueden llegar más rápido de lo que React
	// re-renderiza, así que la siguiente parte del valor real y no del estado viejo
	const pinRef = useRef('')
	// Mientras se comprueba un PIN se ignoran pulsaciones (ref, no estado: se lee
	// dentro de callbacks que no deben recrearse por ello)
	const verifyingRef = useRef(false)
	const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const shake = useSharedValue(0)
	const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

	const name = displayName(user)

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
		if (!isLocked) return
		pinRef.current = ''
		setPin('')
		setError('')
	}, [isLocked])

	// El borrado diferido del PIN fallido no puede sobrevivir al desmontaje
	useEffect(() => () => { if (clearTimerRef.current) { clearTimeout(clearTimerRef.current) } }, [])

	const triggerShake = useCallback(() => {
		shake.value = withSequence(
			withTiming(-9, { duration: 45 }),
			withTiming(9, { duration: 45 }),
			withTiming(-7, { duration: 45 }),
			withTiming(7, { duration: 45 }),
			withSpring(0, { mass: 0.5, damping: 12, stiffness: 260 }),
		)
	}, [shake])

	// Verify the entered PIN — se dispara solo, al caer el último dígito
	const verifyPin = useCallback(async (code: string) => {
		verifyingRef.current = true
		const result = await unlockWithPin(code)
		verifyingRef.current = false
		if (result.success) return
		setError(t('misc.lock.errors.wrongPin'))
		triggerShake()
		clearTimerRef.current = setTimeout(() => {
			pinRef.current = ''
			setPin('')
		}, WRONG_PIN_HOLD)
	}, [unlockWithPin, t, triggerShake])

	const handleDigit = useCallback((digit: string) => {
		if (verifyingRef.current) return
		const next = (pinRef.current + digit).slice(0, PIN_LENGTH)
		pinRef.current = next
		setPin(next)
		setError('')
		if (next.length === PIN_LENGTH) { verifyPin(next) }
	}, [verifyPin])

	const handleBackspace = useCallback(() => {
		if (verifyingRef.current) return
		const next = pinRef.current.slice(0, -1)
		pinRef.current = next
		setPin(next)
		setError('')
	}, [])

	const biometryLabel = useMemo(() => {
		switch (biometryType) {
			case 'FaceID': return t('misc.lock.unlock.faceId')
			case 'TouchID': return t('misc.lock.unlock.touchId')
			case 'Fingerprint': return t('misc.lock.unlock.fingerprint')
			default: return t('misc.lock.unlock.biometrics')
		}
	}, [biometryType, t])

	// Memoizado a propósito: un elemento nuevo en cada render anularía el memo
	// del pad y volvería a pintar las doce teclas con cada dígito
	const biometryIcon = useMemo(() => (
		biometryType === 'FaceID'
			? <FaceIDIcon size={26} color={theme.colors.primary} />
			: <FontAwesome6 name="fingerprint" size={26} color={theme.colors.primary} iconStyle="solid" />
	), [biometryType, theme.colors.primary])

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
			<View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: (insets.bottom || 16) + 8 }]}>

				{/* Luz de acento cayendo desde arriba. La parada intermedia mantiene el
				    tinte a la altura del avatar y lo apaga antes de los puntos; el extremo
				    transparente se escribe como rgba del acento porque 'transparent'
				    degrada hacia gris en Android */}
				<LinearGradient
					pointerEvents="none"
					colors={[
						hexToRgba(theme.colors.primary, theme.isDark ? 0.30 : 0.16),
						hexToRgba(theme.colors.primary, theme.isDark ? 0.16 : 0.09),
						hexToRgba(theme.colors.primary, 0),
					]}
					locations={[0, 0.55, 1]}
					style={styles.wash}
				/>

				{/* Identidad y progreso van juntos: centrados como UN bloque sobre el pad,
				    para que el PIN no quede a un vacío de distancia de a quién pertenece */}
				<View style={styles.top}>

					{/* Quién está bloqueado: el avatar evita el "¿de qué cuenta es este PIN?" */}
					<View style={styles.identity}>
						<QPAvatar user={user} size={84} />
						{name ? (
							<Text style={[textStyles.h3, styles.greeting]} numberOfLines={1}>
								{t('misc.lock.greeting', { name })}
							</Text>
						) : (<></>)}
						<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
							{t('misc.lock.enterPin')}
						</Text>
					</View>

					{/* Progreso del PIN + hueco de error de alto fijo (evita el salto de layout) */}
					<View style={styles.entry}>
						<Animated.View
							style={shakeStyle}
							accessible
							accessibilityLabel={t('misc.lock.a11y.pinProgress', { entered: pin.length, total: PIN_LENGTH })}
						>
							<QPPinDots length={PIN_LENGTH} filled={pin.length} error={!!error} />
						</Animated.View>
						<View style={styles.errorSlot}>
							{error ? (
								<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{error}</Text>
							) : (<></>)}
						</View>
					</View>

				</View>

				<QPPinPad
					onDigit={handleDigit}
					onBackspace={handleBackspace}
					onBiometric={biometricsAvailable ? handleBiometricUnlock : undefined}
					biometricIcon={biometryIcon}
					biometricLabel={biometryLabel}
				/>

			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		paddingHorizontal: 24,
	},
	wash: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: '62%',
	},
	top: {
		flex: 1,
		alignSelf: 'stretch',
		alignItems: 'center',
		justifyContent: 'center',
	},
	identity: {
		alignItems: 'center',
		gap: 10,
	},
	greeting: {
		textAlign: 'center',
	},
	entry: {
		alignItems: 'center',
		paddingTop: 36,
	},
	errorSlot: {
		height: 24,
		justifyContent: 'center',
	},
})

export default LockScreen
