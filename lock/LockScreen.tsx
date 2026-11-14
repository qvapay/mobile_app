import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SystemBars } from 'react-native-edge-to-edge'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// RN
import { View, Text, Image, Modal, Pressable, StyleSheet, AccessibilityInfo, useWindowDimensions } from 'react-native'

// Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { useAuth } from '../auth/AuthContext'
import { useAppLock } from './AppLockContext'
import { useLockBiometrics, getBiometryLabelKey } from './useLockBiometrics'
import { usePinGate } from './usePinGate'
import { pinGateMessage } from './pinGateMessage'

// Helpers
import { displayName } from '../helpers/displayName'
import i18n from '../i18n'

// UI
import LockHeroIcon from './LockHeroIcon'
import PinDots from './PinDots'
import type { PinDotsHandle } from './PinDots'
import QPAvatar from '../ui/particles/QPAvatar'
import QPButton from '../ui/particles/QPButton'
import QPKeypad from '../ui/QPKeypad'
import type { KeypadExtraKey } from '../ui/QPKeypad'
import { useModalGate } from '../ui/useModalGate'

const PIN_LENGTH = 4

// Alto útil por debajo del cual el héroe y el teclado de 60 px no caben juntos
// (Android de 360×640 con botones de navegación, iPhone de 4"): modo compacto
const COMPACT_BELOW = 640

// Teclas más juntas que esto son el mismo PIN, tecleado de corrido
const SAME_PIN_GAP_MS = 1000

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
 *
 * El Modal pasa por `useModalGate`: en iOS NUNCA se oculta antes de que termine
 * de presentarse. Face ID desbloquea más rápido que el fade de entrada (y la
 * cortina se presenta con la app yéndose al fondo), y un dismiss a medio
 * present deja el controlador presentado para siempre e invisible: desde ahí
 * ningún otro `<Modal>` de la app vuelve a salir hasta reiniciar (2026-11-02).
 *
 * Límite de intentos (`usePinGate`, reglas en lock/pinAttempts): desde el quinto
 * fallo el teclado deja de escribir durante una espera con cuenta atrás (la tecla
 * biométrica sigue viva: es el dueño), y al décimo el teclado se cambia por un
 * botón que pide la huella, la cara o el código del teléfono para devolver los
 * intentos. Esa prueba NO desbloquea: después se sigue pidiendo el PIN.
 *
 * Un PIN se admite entero o no se admite: una tecla rechazada (hay espera, o se
 * está comprobando otro PIN) se lleva con ella a las que vienen de corrido. Quien
 * teclea su PIN justo cuando la espera termina veía descartados los primeros
 * dígitos y admitidos los últimos; el PIN siguiente salía corrido («34» + «12») y
 * contaba como un fallo más, con su espera más larga, a alguien que tecleó bien.
 *
 * PIN ilegible: si el Keychain no deja leer el PIN guardado (en Android, tras
 * pasar de un teléfono a otro, viaja cifrado y sin su clave) nadie puede
 * acertarlo y esta pantalla no se abriría nunca. El aviso es entonces el
 * control: tocarlo pide la prueba de dueño del dispositivo y retira ese PIN.
 */
const LockScreen = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { height } = useWindowDimensions()
	const compact = height - insets.top - insets.bottom < COMPACT_BELOW
	const { user } = useAuth()
	const { isLocked, isCovered, unlockWithPin, proveDeviceOwner, resetUnreadablePin } = useAppLock()
	const pinLimit = usePinGate()
	// El teclado recibe un `onKey` estable: el límite se lee de un ref
	const pinLimitRef = useRef(pinLimit)
	useEffect(() => { pinLimitRef.current = pinLimit })

	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [proving, setProving] = useState(false)
	/** El PIN guardado no se deja leer: el aviso pasa a ser el botón para restablecerlo. */
	const [pinUnreadable, setPinUnreadable] = useState(false)
	const dotsRef = useRef<PinDotsHandle | null>(null)
	// El PIN vive también en un ref: dos toques rápidos llegan antes de que React
	// vuelva a pintar, y leyendo el estado el segundo pisaría al primero
	const pinRef = useRef('')
	const verifyingRef = useRef(false)
	/** Cuándo se rechazó la última tecla (ms): las que la siguen de corrido son el mismo PIN. */
	const refusedAtRef = useRef(0)

	const clearError = useCallback(() => setError(''), [])
	const { biometryType, available: biometricsAvailable, unlock: handleBiometricUnlock } = useLockBiometrics(isLocked, clearError)

	const resetPin = () => { pinRef.current = ''; setPin('') }

	// Reset state when lock screen is shown/hidden
	useEffect(() => {
		if (isLocked) {
			pinRef.current = ''
			setPin('')
			setError('')
			setPinUnreadable(false)
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
				// Con el límite ya cerrado manda su aviso (lo pinta `pinLimit`), no «PIN incorrecto»
				const message = result.error || t('misc.lock.errors.wrongPin')
				setError(result.locked ? '' : message)
				setPinUnreadable(result.unreadable === true)
				dotsRef.current?.shake()
				AccessibilityInfo.announceForAccessibility(message)
			}
		} finally { verifyingRef.current = false }
	}

	// Demasiados fallos: la huella, la cara o el código del teléfono devuelven los intentos
	const handleOwnerProof = async () => {
		if (proving) return
		setProving(true)
		setError('')
		try {
			// Cancelar no es un error; que el diálogo no pueda salir, sí
			if (await proveDeviceOwner() === 'error') setError(t('misc.lock.errors.ownerProofFailed'))
		} finally { setProving(false) }
	}
	// El teclado recibe un `onKey` estable (va en memo): la verificación se lee de un ref
	const verifyRef = useRef(verifyPin)
	useEffect(() => { verifyRef.current = verifyPin })

	// PIN ilegible: la prueba de dueño lo retira (y con él este bloqueo)
	const handleResetPin = async () => {
		if (proving) return
		setProving(true)
		try {
			const result = await resetUnreadablePin()
			if (!result.success) { setPinUnreadable(false); setError(result.error ?? '') }
		} finally { setProving(false) }
	}

	const handleKey = useCallback((key: string) => {
		const now = Date.now()
		const verifying = verifyingRef.current
		// Mientras se comprueba un PIN y durante la espera el teclado no escribe (su tecla
		// biométrica sí funciona). Tampoco lo que llega de corrido justo después: es el
		// resto de ese mismo PIN, y admitirlo a medias descuadraría el siguiente
		if (verifying || pinLimitRef.current.kind !== 'open' || Math.abs(now - refusedAtRef.current) < SAME_PIN_GAP_MS) {
			refusedAtRef.current = now
			if (!verifying) dotsRef.current?.shake()
			return
		}
		const current = pinRef.current
		const next = key === 'backspace' ? current.slice(0, -1) : current.length < PIN_LENGTH ? current + key : current
		if (next === current) return
		pinRef.current = next
		setPin(next)
		setError('')
		setPinUnreadable(false)
		// Los puntos no se releen solos: con VoiceOver/TalkBack se anuncia el progreso
		// (i18n.t en el momento: este callback es estable a propósito)
		AccessibilityInfo.announceForAccessibility(i18n.t('misc.lock.a11y.pinProgress', { entered: next.length, total: PIN_LENGTH }))
		if (next.length === PIN_LENGTH) { verifyRef.current(next) }
	}, [])

	const biometryLabel = t(getBiometryLabelKey(biometryType))
	const biometricKey = useMemo<KeypadExtraKey>(() => biometricsAvailable
		? { icon: <LockHeroIcon biometryType={biometryType} biometricsAvailable color={theme.colors.primary} size={26} />, label: biometryLabel, onPress: handleBiometricUnlock }
		: null, [biometricsAvailable, biometryType, biometryLabel, handleBiometricUnlock, theme.colors.primary])

	const gate = useModalGate(isLocked || isCovered)

	if (!gate.mounted) return null

	const name = user ? displayName(user) : ''
	// La espera se pinta siempre (su cuenta atrás va viva); en la prueba de dueño, un fallo del diálogo va antes
	const notice = pinUnreadable ? t('misc.lock.unreadable.notice') : pinLimit.kind === 'wait' ? pinGateMessage(pinLimit, t) : error || pinGateMessage(pinLimit, t)

	return (
		<Modal
			visible={gate.visible}
			onShow={gate.onShow}
			onDismiss={gate.onDismiss}
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
						<Text style={[styles.hint, compact && styles.hintCompact, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.light, fontSize: theme.typography.fontSize.md }]} numberOfLines={1}>
							{name ? t('misc.lock.greeting', { name }) : t('misc.lock.enterPin')}
						</Text>

						<View style={[styles.dots, compact && styles.dotsCompact]}>
							<PinDots ref={dotsRef} testID="lock-pin" length={PIN_LENGTH} code={pin} tone={notice ? theme.colors.dangerText : undefined} />
						</View>

						{/* Altura reservada: sin ella, el error empuja los puntos al aparecer */}
						<View style={[styles.errorSlot, compact && styles.errorSlotCompact]}>
							{pinUnreadable ? (
								<Pressable testID="lock-reset-pin" onPress={handleResetPin} hitSlop={8} accessibilityRole="button">
									<Text testID="lock-notice" style={[textStyles.h6, styles.error, { color: theme.colors.dangerText }]}>{notice}</Text>
								</Pressable>
							) : !!notice && (
								<Text testID="lock-notice" style={[textStyles.h6, styles.error, { color: theme.colors.dangerText }]}>{notice}</Text>
							)}
						</View>

					</View>

					<View style={styles.keypad}>
						{pinLimit.kind === 'ownerProof'
							? <QPButton testID="lock-owner-proof" title={t('misc.lock.tooMany.confirm')} onPress={handleOwnerProof} loading={proving} />
							: <QPKeypad onKey={handleKey} extraKey={biometricKey} compact={compact} testIDPrefix="lock-key" />}
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
	hint: { textAlign: 'center', marginTop: 24, letterSpacing: 0.2 },
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
