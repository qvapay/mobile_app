import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// RN
import { View, Text, Image, Modal, StyleSheet, AccessibilityInfo, useWindowDimensions } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useAuth } from '../auth/AuthContext'
import { useAppLock } from './AppLockContext'
import { useLockBiometrics, getBiometryLabelKey } from './useLockBiometrics'

// Helpers
import { displayName } from '../helpers/displayName'
import i18n from '../i18n'

// UI
import LockHeroIcon from './LockHeroIcon'
import PinDots from './PinDots'
import type { PinDotsHandle } from './PinDots'
import QPAvatar from '../ui/particles/QPAvatar'
import QPKeypad from '../ui/QPKeypad'
import type { KeypadExtraKey } from '../ui/QPKeypad'

const PIN_LENGTH = 4

// Alto útil por debajo del cual el héroe y el teclado de 60 px no caben juntos
// (Android de 360×640 con botones de navegación, iPhone de 4"): modo compacto
const COMPACT_BELOW = 640

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
 * que quien mira sepa de qué cuenta es el PIN (sin foto, el candado: el avatar
 * de reserva es el logo, que ya está arriba); en el modo wallet sin cuenta, el
 * candado. Nunca el glifo biométrico: ya no se toca, la biometría es su tecla.
 *
 * Con la app en segundo plano y el bloqueo activo, el mismo Modal hace de
 * cortina (`isCovered`): solo el fondo y la marca, sin teclado ni biometría. Al
 * volver, la app no se ve ni recibe toques hasta que AppLockContext decide; si
 * toca bloquear, la cortina se convierte en el bloqueo sin cerrar el Modal.
 */
const LockScreen = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { height } = useWindowDimensions()
	const compact = height - insets.top - insets.bottom < COMPACT_BELOW
	const { user } = useAuth()
	const { isLocked, isCovered, unlockWithPin } = useAppLock()

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
			// Bien o mal, el PIN no se queda en memoria (ni pintado al volver a bloquear)
			resetPin()
			if (!result.success) {
				setError(t('misc.lock.errors.wrongPin'))
				dotsRef.current?.shake()
				AccessibilityInfo.announceForAccessibility(t('misc.lock.errors.wrongPin'))
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
		// Los puntos no se releen solos: con VoiceOver/TalkBack se anuncia el progreso
		// (i18n.t en el momento: este callback es estable a propósito)
		AccessibilityInfo.announceForAccessibility(i18n.t('misc.lock.a11y.pinProgress', { entered: next.length, total: PIN_LENGTH }))
		if (next.length === PIN_LENGTH) { verifyRef.current(next) }
	}, [])

	const biometryLabel = t(getBiometryLabelKey(biometryType))
	const biometricKey = useMemo<KeypadExtraKey>(() => biometricsAvailable
		? { icon: <LockHeroIcon biometryType={biometryType} biometricsAvailable color={theme.colors.primary} size={26} />, label: biometryLabel, onPress: handleBiometricUnlock }
		: null, [biometricsAvailable, biometryType, biometryLabel, handleBiometricUnlock, theme.colors.primary])

	if (!isLocked && !isCovered) return null

	const name = user ? displayName(user) : ''

	return (
		<Modal
			visible
			animationType="fade"
			transparent={false}
			statusBarTranslucent
			onRequestClose={() => { }}
		>
			<SystemBars style={theme.isDark ? 'light' : 'dark'} />
			<View testID={isLocked ? 'lock-screen' : 'lock-cover'} style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>

				{/* La marca, en voz baja: recuerda dónde estás sin competir con el héroe */}
				<View style={[styles.brand, compact && styles.brandCompact]}>
					<Image
						source={theme.isDark
							? require('../assets/images/ui/qvapay-logo-white.png')
							: require('../assets/images/ui/logo-qvapay.png')}
						style={styles.brandLogo}
						resizeMode="contain"
					/>
					<Text style={[styles.brandName, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}>QvaPay</Text>
				</View>

				{/* Cortina: hasta aquí. El resto vive centrado en el espacio que deja el teclado */}
				{isLocked && <>
					<View style={styles.stage}>

						{/* Con foto, de quién es el PIN; si no, el candado */}
						{user?.image
							? <QPAvatar user={user} size={compact ? 56 : 76} />
							: <LockHeroIcon biometryType={null} biometricsAvailable={false} color={theme.colors.primary} size={compact ? 40 : 48} />}

						{/* Una sola línea de texto */}
						<Text style={[styles.hint, compact && styles.hintCompact, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.light }]} numberOfLines={1}>
							{name ? t('misc.lock.greeting', { name }) : t('misc.lock.enterPin')}
						</Text>

						<View style={[styles.dots, compact && styles.dotsCompact]}>
							<PinDots ref={dotsRef} testID="lock-pin" length={PIN_LENGTH} code={pin} tone={error ? theme.colors.dangerText : undefined} />
						</View>

						{/* Altura reservada: sin ella, el error empuja los puntos al aparecer */}
						<View style={[styles.errorSlot, compact && styles.errorSlotCompact]}>
							{!!error && (
								<Text style={[textStyles.h6, styles.error, { color: theme.colors.dangerText }]}>{error}</Text>
							)}
						</View>

					</View>

					<View style={styles.keypad}>
						<QPKeypad onKey={handleKey} extraKey={biometricKey} compact={compact} testIDPrefix="lock-key" />
					</View>
				</>}
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
	brandCompact: { marginTop: 16 },
	brandName: { fontSize: 14, letterSpacing: 0.2 },
	stage: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
	hint: { textAlign: 'center', marginTop: 24, fontSize: 16, letterSpacing: 0.2 },
	hintCompact: { marginTop: 14 },
	dots: { marginTop: 28 },
	dotsCompact: { marginTop: 18 },
	errorSlot: { height: 40, justifyContent: 'center' },
	errorSlotCompact: { height: 32 },
	error: { textAlign: 'center' },
	// En una tablet el teclado no se estira a todo el ancho
	keypad: { width: '100%', maxWidth: 360 },
})

export default LockScreen
