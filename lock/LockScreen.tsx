import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// RN
import { View, Text, Image, Modal, StyleSheet } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useAuth } from '../auth/AuthContext'
import { useAppLock } from './AppLockContext'
import { useLockBiometrics, getBiometryLabelKey } from './useLockBiometrics'

// Helpers
import { displayName } from '../helpers/displayName'

// UI
import LockHeroIcon from './LockHeroIcon'
import PinDots from './PinDots'
import type { PinDotsHandle } from './PinDots'
import QPAvatar from '../ui/particles/QPAvatar'
import QPKeypad from '../ui/QPKeypad'
import type { KeypadExtraKey } from '../ui/QPKeypad'

const PIN_LENGTH = 4

/**
 * Full-screen app-lock overlay: 4-digit PIN entry with optional biometric unlock.
 * Rendered by AppLockProvider above the NavigationContainer whenever the app is
 * locked — it is not a navigation route and takes no props.
 * The PIN verifies against the Keychain (`com.qvapay.applock`) via `unlockWithPin`;
 * biometrics auto-prompt ~500ms after the screen appears when enabled in settings.
 *
 * El PIN se teclea con el teclado de la app (`QPKeypad`, el mismo del tab Keypad),
 * no con el del sistema: en este Modal edge-to-edge el teclado nativo tapaba los
 * puntos (issue #47) y había que seguir su altura a mano. La biometría es la tecla
 * de abajo a la izquierda. Con cuenta, el héroe es el avatar con un saludo, para
 * que quien mira sepa de qué cuenta es el PIN; en el modo wallet sin cuenta, el
 * glifo de siempre.
 */
const LockScreen = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { user } = useAuth()
	const { isLocked, unlockWithPin } = useAppLock()

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const dotsRef = useRef<PinDotsHandle | null>(null)
	// El PIN vive también en un ref: dos toques rápidos llegan antes de que React
	// vuelva a pintar, y leyendo el estado el segundo pisaría al primero
	const pinRef = useRef('')
	const verifyingRef = useRef(false)

	const clearError = useCallback(() => setError(''), [])
	const { biometryType, available: biometricsAvailable, unlock: handleBiometricUnlock } = useLockBiometrics(isLocked, clearError)

	const resetPin = () => { pinRef.current = ''; setPin('') }

	// Reset state when lock screen is shown/hidden
	useEffect(() => {
		if (isLocked) {
			pinRef.current = ''
			setPin('')
			setError('')
		}
	}, [isLocked])

	// El PIN se verifica en cuanto cae el cuarto dígito; mientras tanto el teclado no escribe
	const verifyPin = async (code: string) => {
		verifyingRef.current = true
		try {
			const result = await unlockWithPin(code)
			if (!result.success) {
				setError(t('misc.lock.errors.wrongPin'))
				resetPin()
				dotsRef.current?.shake()
			}
		} finally { verifyingRef.current = false }
	}
	// El teclado recibe un `onKey` estable (va en memo): la verificación se lee de un ref
	const verifyRef = useRef(verifyPin)
	useEffect(() => { verifyRef.current = verifyPin })

	const handleKey = useCallback((key: string) => {
		if (verifyingRef.current) return
		const current = pinRef.current
		const next = key === 'backspace' ? current.slice(0, -1) : current.length < PIN_LENGTH ? current + key : current
		if (next === current) return
		pinRef.current = next
		setPin(next)
		setError('')
		if (next.length === PIN_LENGTH) { verifyRef.current(next) }
	}, [])

	const biometryLabel = t(getBiometryLabelKey(biometryType))
	const biometricKey = useMemo<KeypadExtraKey>(() => biometricsAvailable
		? { icon: <LockHeroIcon biometryType={biometryType} biometricsAvailable color={theme.colors.primary} size={26} />, label: biometryLabel, onPress: handleBiometricUnlock }
		: null, [biometricsAvailable, biometryType, biometryLabel, handleBiometricUnlock, theme.colors.primary])

	if (!isLocked) return null

	const name = user ? displayName(user) : ''

	return (
		<Modal
			visible={isLocked}
			animationType="fade"
			transparent={false}
			statusBarTranslucent
			onRequestClose={() => { }}
		>
			<SystemBars style={theme.isDark ? 'light' : 'dark'} />
			<View testID="lock-screen" style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>

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

				{/* El resto vive centrado en el espacio que deja el teclado */}
				<View style={styles.stage}>

					{/* Con cuenta, de quién es el PIN; sin ella (modo wallet), el glifo del bloqueo */}
					{user
						? <QPAvatar user={user} size={76} />
						: <LockHeroIcon biometryType={biometryType} biometricsAvailable={biometricsAvailable} color={theme.colors.primary} />}

					{/* Una sola línea de texto */}
					<Text style={[styles.hint, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.light }]} numberOfLines={1}>
						{name ? t('misc.lock.greeting', { name }) : t('misc.lock.enterPin')}
					</Text>

					<View style={styles.dots}>
						<PinDots ref={dotsRef} testID="lock-pin" length={PIN_LENGTH} code={pin} tone={error ? theme.colors.dangerText : undefined} />
					</View>

					{/* Altura reservada: sin ella, el error empuja los puntos al aparecer */}
					<View style={styles.errorSlot}>
						{!!error && (
							<Text style={[textStyles.h6, styles.error, { color: theme.colors.dangerText }]}>{error}</Text>
						)}
					</View>

				</View>

				<View style={styles.keypad}>
					<QPKeypad onKey={handleKey} extraKey={biometricKey} testIDPrefix="lock-key" />
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
	},
	// 55%: presente sin disputarle la atención al héroe
	brand: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.55, marginTop: 40 },
	brandLogo: { width: 16, height: 16 },
	brandName: { fontSize: 14, letterSpacing: 0.2 },
	stage: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
	hint: { textAlign: 'center', marginTop: 24, fontSize: 16, letterSpacing: 0.2 },
	dots: { marginTop: 28 },
	errorSlot: { height: 40, justifyContent: 'center' },
	error: { textAlign: 'center' },
	// En una tablet el teclado no se estira a todo el ancho
	keypad: { width: '100%', maxWidth: 360 },
})

export default LockScreen
