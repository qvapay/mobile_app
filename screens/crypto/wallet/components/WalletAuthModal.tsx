import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Seguridad: PIN de bloqueo y credenciales biométricas (Keychain)
import { useSettings } from '../../../../settings/SettingsContext'
import { getAppLockPin, getBiometricCredentials, getSupportedBiometryType, hasAppLockPin, hasBiometricCredentials } from '../../../../api/client'

// UI
import QPButton from '../../../../ui/particles/QPButton'
import QPCodeInput from '../../../../ui/particles/QPCodeInput'
import type { QPCodeInputHandle } from '../../../../ui/particles/QPCodeInput'
import FaceIDIcon from '../../../../ui/particles/FaceIDIcon'

// Navigation
import { ROUTES } from '../../../../routes'
import type { RootStackParamList } from '../../../../types/navigation'

type Props = {
	visible: boolean
	/** Qué se va a autorizar ("Enviar 1 USDT"): el usuario ve qué firma. */
	subtitle: string
	onClose: () => void
	/** Identidad verificada: el caller lee la seed y firma. */
	onAuthorized: () => void
}

const MAX_ATTEMPTS = 5

/**
 * Gate de identidad antes de leer la seed (regla dura 2 del plan: el
 * Keychain de la wallet no lleva access control; la protección es de capa de
 * app). Reutiliza el PIN de Ajustes → Bloqueo (mismo teclado que el
 * LockScreen) con Face ID/Touch ID como atajo cuando está activo. Sin PIN de
 * bloqueo no hay gate posible: se pide crearlo antes del primer envío.
 * Cinco fallos cierran el modal — no hay lockout persistente porque el PIN
 * solo desbloquea una firma local, no una cuenta.
 */
const WalletAuthModal = ({ visible, subtitle, onClose, onAuthorized }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const navigation = useNavigation<NavigationProp<RootStackParamList>>()
	const { security } = useSettings()

	const [hasPin, setHasPin] = useState<boolean | null>(null)
	const [biometryType, setBiometryType] = useState<string | null>(null)
	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [attempts, setAttempts] = useState(0)
	const [busy, setBusy] = useState(false)
	const codeInputRef = useRef<QPCodeInputHandle | null>(null)

	// Al abrir: ¿hay PIN de bloqueo? ¿biometría disponible y activada?
	useEffect(() => {
		if (!visible) return
		let cancelled = false
		setPin(''); setError(''); setAttempts(0); setBusy(false)
		const detect = async () => {
			const [pinExists, type, credentials] = await Promise.all([hasAppLockPin(), getSupportedBiometryType(), hasBiometricCredentials()])
			if (cancelled) return
			setHasPin(pinExists)
			setBiometryType(pinExists && type && credentials && security.biometricsEnabled ? type : null)
		}
		detect()
		return () => { cancelled = true }
	}, [visible, security.biometricsEnabled])

	const authorizeWithBiometrics = useCallback(async () => {
		if (busy) return
		setBusy(true)
		try {
			// El prompt del sistema ES la autenticación: leer la entrada protegida solo funciona si pasó
			const credentials = await getBiometricCredentials()
			if (credentials) { onAuthorized(); return }
		} catch { /* cancelado o fallido: queda el PIN */ }
		finally { setBusy(false) }
	}, [busy, onAuthorized])

	// Atajo biométrico automático al abrir, como el LockScreen
	useEffect(() => {
		if (!visible || !biometryType) return
		const timer = setTimeout(() => { authorizeWithBiometrics() }, 400)
		return () => clearTimeout(timer)
		// Solo al detectar biometría: re-armar con cada cambio de `busy` relanzaría el prompt
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible, biometryType])

	const verifyPin = async (code: string) => {
		if (busy) return
		setBusy(true)
		try {
			const stored = await getAppLockPin()
			if (stored && code === stored) { onAuthorized(); return }
			const next = attempts + 1
			setAttempts(next)
			setPin('')
			if (next >= MAX_ATTEMPTS) { onClose(); return }
			setError(t('misc.lock.errors.wrongPin'))
			setTimeout(() => codeInputRef.current?.focus(0), 250)
		} catch {
			setError(t('misc.lock.errors.verifyPin'))
			setPin('')
		} finally {
			setBusy(false)
		}
	}

	const goToAppLock = () => {
		onClose()
		navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.APP_LOCK, initial: false })
	}

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={styles.overlay} onPress={onClose}>
				<Pressable style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => {}}>
					<View style={styles.header}>
						<View style={[styles.icon, { backgroundColor: theme.colors.primary + '15' }]}>
							<FontAwesome6 name="lock" size={18} color={theme.colors.primary} iconStyle="solid" />
						</View>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{t('crypto.wallet.auth.title')}</Text>
						<Text style={[textStyles.h5, styles.subtitle, { color: theme.colors.secondaryText }]}>{subtitle}</Text>
					</View>

					{hasPin === false ? (
						<View style={styles.noPin}>
							<Text style={[textStyles.h5, styles.subtitle, { color: theme.colors.primaryText }]}>{t('crypto.wallet.auth.noPin')}</Text>
							<QPButton title={t('crypto.wallet.auth.createPin')} onPress={goToAppLock} />
						</View>
					) : hasPin === true ? (
						<>
							<QPCodeInput ref={codeInputRef} length={4} code={pin} onChangeCode={code => { setPin(code); setError('') }} onFilled={verifyPin} secure autoFocus disabled={busy} boxColor={theme.colors.background} />
							<Text style={[textStyles.h6, styles.error, { color: theme.colors.danger }]}>{error || ' '}</Text>
							{biometryType && (
								<Pressable onPress={authorizeWithBiometrics} style={styles.biometric} hitSlop={8} accessibilityRole="button">
									{biometryType === 'FaceID'
										? <FaceIDIcon size={22} color={theme.colors.primary} />
										: <FontAwesome6 name="fingerprint" size={22} color={theme.colors.primary} iconStyle="solid" />}
									<Text style={[textStyles.h5, { color: theme.colors.primary }]}>
										{t(biometryType === 'FaceID' ? 'misc.lock.unlock.faceId' : biometryType === 'TouchID' ? 'misc.lock.unlock.touchId' : 'misc.lock.unlock.fingerprint')}
									</Text>
								</Pressable>
							)}
						</>
					) : null}

					<Pressable onPress={onClose} style={styles.cancel} hitSlop={8} accessibilityRole="button">
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.auth.cancel')}</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
	card: { width: '100%', borderRadius: 16, padding: 24, alignItems: 'center', gap: 6 },
	header: { alignItems: 'center', gap: 8, marginBottom: 14 },
	icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
	subtitle: { textAlign: 'center' },
	noPin: { alignSelf: 'stretch', gap: 14 },
	error: { textAlign: 'center', marginTop: 8, minHeight: 16 },
	biometric: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
	cancel: { paddingVertical: 10, marginTop: 4 },
})

export default WalletAuthModal
