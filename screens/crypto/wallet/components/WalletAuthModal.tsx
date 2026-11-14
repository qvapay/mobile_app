import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import QPModalCard from '../../../../ui/QPModalCard'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Seguridad: PIN de bloqueo y credenciales biométricas (Keychain)
import { useSettings } from '../../../../settings/SettingsContext'
import { useAuth } from '../../../../auth/AuthContext'
import { appLockPinStatus, getSupportedBiometryType } from '../../../../api/client'
import { authenticateWalletBiometrics, enableWalletBiometrics, hasWalletBiometrics } from '../../../../wallet/keystore'
import { useAppLock } from '../../../../lock/AppLockContext'
import { usePinGate } from '../../../../lock/usePinGate'
import { pinGateMessage } from '../../../../lock/pinGateMessage'

// UI
import QPButton from '../../../../ui/particles/QPButton'
import QPCodeInput from '../../../../ui/particles/QPCodeInput'
import type { QPCodeInputHandle } from '../../../../ui/particles/QPCodeInput'
import FaceIDIcon from '../../../../ui/particles/FaceIDIcon'
import WalletPinSetup from './WalletPinSetup'

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

/**
 * Gate de identidad antes de leer la seed (regla dura 2 del plan: el
 * Keychain de la wallet no lleva access control; la protección es de capa de
 * app). Reutiliza el PIN de Ajustes → Bloqueo (mismo teclado que el
 * LockScreen) con Face ID/Touch ID como atajo. La biometría es PROPIA de la
 * wallet (marcador en Keychain, `wallet/keystore`), independiente de cómo se
 * inició sesión; se arma sola tras el primer PIN correcto si el ajuste
 * `crypto.walletBiometrics` está encendido. Con biometría disponible el
 * prompt sale primero y el PIN queda de respaldo (sin autofocus: el teclado
 * y el prompt se pelean por el foco). Sin PIN de bloqueo no hay gate
 * posible: se pide crearlo antes del primer envío — con cuenta en Ajustes →
 * Bloqueo; sin cuenta (modo wallet) aquí mismo, porque Ajustes cuelga del
 * usuario y crearlo ya autoriza la firma. Crearlo NO es gratis: con la wallet
 * ya en el teléfono, `enableAppLock` exige la prueba de dueño del dispositivo
 * (huella/cara o su código), así que quien solo tenga el teléfono
 * desbloqueado no puede ponerle su PIN y firmar.
 *
 * El PIN NO se compara aquí: pasa por `verifyAppLockPin` del bloqueo, que lleva
 * el límite de intentos compartido con la pantalla de bloqueo (lock/pinAttempts).
 * Son 4 dígitos entre quien tiene el teléfono y la frase: antes cinco fallos solo
 * cerraban este modal y se podía volver a abrir sin fin. Ahora, desde el quinto
 * hay una espera con cuenta atrás y al décimo se pide la huella, la cara o el
 * código del teléfono; mientras tanto el campo del PIN ni se pinta. La
 * biometría de la wallet sigue disponible en esos estados (es el dueño) y, si
 * pasa, devuelve los intentos.
 */
const WalletAuthModal = ({ visible, subtitle, onClose, onAuthorized }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const navigation = useNavigation<NavigationProp<RootStackParamList>>()
	const { getSetting } = useSettings()
	const { isAuthenticated } = useAuth()
	const { verifyAppLockPin, proveDeviceOwner, forgivePinAttempts } = useAppLock()
	const pinLimit = usePinGate()
	const biometricsWanted = getSetting('crypto', 'walletBiometrics', true) as boolean

	const [hasPin, setHasPin] = useState<boolean | null>(null)
	/** Tipo soportado por el dispositivo (null = sin biometría). */
	const [biometryType, setBiometryType] = useState<string | null>(null)
	/** Marcador propio de la wallet presente: se puede pedir biometría. */
	const [bioArmed, setBioArmed] = useState(false)
	/** true mientras el prompt del sistema está en pantalla: el PIN no se enfoca. */
	const [prompting, setPrompting] = useState(false)
	const [pin, setPin] = useState('')
	const [error, setError] = useState('')
	const [proving, setProving] = useState(false)
	const busyRef = useRef(false)
	const codeInputRef = useRef<QPCodeInputHandle | null>(null)

	// Al abrir: ¿hay PIN de bloqueo? ¿biometría soportada y armada para la wallet?
	useEffect(() => {
		if (!visible) return
		let cancelled = false
		setPin(''); setError(''); setProving(false); setPrompting(false); busyRef.current = false
		const detect = async () => {
			// Solo cuenta un PIN que se deje LEER: uno ilegible (viajó cifrado a otro teléfono,
			// sin su clave) no lo acierta nadie, y se trata como «sin PIN»: se crea otro, que
			// con la wallet ya aquí exige la prueba de dueño del dispositivo
			const [status, type, armed] = await Promise.all([appLockPinStatus(), getSupportedBiometryType(), hasWalletBiometrics()])
			if (cancelled) return
			const pinExists = status === 'set'
			setHasPin(pinExists)
			setBiometryType(pinExists ? type : null)
			setBioArmed(pinExists && !!type && biometricsWanted && armed)
		}
		detect()
		return () => { cancelled = true }
	}, [visible, biometricsWanted])

	const authorizeWithBiometrics = useCallback(async () => {
		if (busyRef.current) return
		busyRef.current = true
		setPrompting(true)
		try {
			if (await authenticateWalletBiometrics(t('crypto.wallet.auth.bioPrompt'))) {
				// La huella o la cara de siempre: es el dueño, y recupera sus intentos de PIN
				forgivePinAttempts().catch(() => {})
				onAuthorized()
				return
			}
			// Cancelado, fallido o marcador invalidado: al PIN
			setBioArmed(await hasWalletBiometrics())
			setTimeout(() => codeInputRef.current?.focus(0), 150)
		} finally {
			setPrompting(false)
			busyRef.current = false
		}
	}, [onAuthorized, forgivePinAttempts, t])

	// Con biometría armada el prompt sale primero; el PIN no se enfoca hasta que falle o se cancele
	useEffect(() => {
		if (!visible || !bioArmed) return
		const timer = setTimeout(() => { authorizeWithBiometrics() }, 350)
		return () => clearTimeout(timer)
		// Solo al armarse: re-armar con cada render relanzaría el prompt
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible, bioArmed])

	const verifyPin = async (code: string) => {
		if (busyRef.current) return
		busyRef.current = true
		try {
			const check = await verifyAppLockPin(code)
			if (check.ok) {
				// Primer PIN correcto con biometría soportada y deseada: armar el marcador (best-effort)
				if (biometryType && biometricsWanted && !bioArmed) enableWalletBiometrics().catch(() => {})
				onAuthorized()
				return
			}
			setPin('')
			// Con el límite ya cerrado el campo desaparece y manda su aviso (lo pinta `pinLimit`)
			if (check.gate.kind !== 'open') { setError(''); return }
			setError(t(check.reason === 'wrong' ? 'misc.lock.errors.wrongPin' : 'misc.lock.errors.verifyPin'))
			setTimeout(() => codeInputRef.current?.focus(0), 250)
		} catch {
			setError(t('misc.lock.errors.verifyPin'))
			setPin('')
		} finally {
			busyRef.current = false
		}
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

	const goToAppLock = () => {
		onClose()
		navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.APP_LOCK, initial: false })
	}

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			{/* accessible={false}: un Pressable accesible funde a sus hijos en UN
			    elemento (iOS) y VoiceOver/E2E no llegarían al PIN ni a los botones */}
			<Pressable style={styles.overlay} onPress={onClose} accessible={false}>
				<QPModalCard testID="wallet-auth-modal" style={styles.card} accessible={false}>
					<View style={styles.header}>
						<View style={[styles.icon, { backgroundColor: theme.colors.primary + '15' }]}>
							<FontAwesome6 name="lock" size={18} color={theme.colors.primary} iconStyle="solid" />
						</View>
						<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{t('crypto.wallet.auth.title')}</Text>
						<Text style={[textStyles.h5, styles.subtitle, { color: theme.colors.secondaryText }]}>{subtitle}</Text>
					</View>

					{hasPin === false && !isAuthenticated ? (
						<WalletPinSetup onDone={onAuthorized} ownerProof />
					) : hasPin === false ? (
						<View style={styles.noPin}>
							<Text style={[textStyles.h5, styles.subtitle, { color: theme.colors.primaryText }]}>{t('crypto.wallet.auth.noPin')}</Text>
							<QPButton title={t('crypto.wallet.auth.createPin')} onPress={goToAppLock} />
						</View>
					) : hasPin === true ? (
						<>
							{pinLimit.kind === 'open' ? (
								<>
									{/* Sin biometría armada el PIN se enfoca solo; con ella, el prompt va primero y el foco llega si falla */}
									<QPCodeInput ref={codeInputRef} testID="wallet-auth-pin" length={4} code={pin} onChangeCode={code => { setPin(code); setError('') }} onFilled={verifyPin} secure autoFocus={!bioArmed} />
									<Text style={[textStyles.h6, styles.error, { color: theme.colors.dangerText }]}>{error || ' '}</Text>
								</>
							) : (
								<View style={styles.limit}>
									{/* La espera va viva; en la prueba de dueño, un fallo del diálogo va antes */}
									<Text testID="wallet-auth-limit" style={[textStyles.h5, styles.subtitle, { color: theme.colors.dangerText }]}>
										{pinLimit.kind === 'wait' ? pinGateMessage(pinLimit, t) : error || pinGateMessage(pinLimit, t)}
									</Text>
									{pinLimit.kind === 'ownerProof' && (
										<QPButton testID="wallet-auth-owner-proof" title={t('misc.lock.tooMany.confirm')} onPress={handleOwnerProof} loading={proving} />
									)}
								</View>
							)}
							{biometryType && bioArmed && !prompting && (
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
				</QPModalCard>
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
	limit: { alignSelf: 'stretch', gap: 14, paddingVertical: 6 },
	error: { textAlign: 'center', marginTop: 8, minHeight: 16 },
	biometric: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
	cancel: { paddingVertical: 10, marginTop: 4 },
})

export default WalletAuthModal
