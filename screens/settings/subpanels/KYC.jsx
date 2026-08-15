import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Linking, AppState } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// Nudge de KYC (gracia post-sesión para el banner del Home)
import { markKycSessionStarted } from '../../../hooks/useKycPrompt'

// Lottie
import LottieView from 'lottie-react-native'

// Auth
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Mientras la verificación está en revisión se re-consulta cada 12s (mismo
// ritmo que el StepKyc de la web) — el webhook de Didit puede aprobar en
// segundos si el flujo fue automático
const PENDING_POLL_MS = 12000

/**
 * Verificación de identidad (KYC vía Didit). Cuatro estados según
 * `GET /user/kyc` → `{ kyc, kyc_status: none|pending|approved|declined }`:
 *
 * - `verified`  — kyc true: Lottie de verificado.
 * - `pending`   — Didit en revisión: sin CTA, polling cada 12s.
 * - `declined`  — rechazada: caso de soporte, sin re-intento self-service
 *                 (el backend responde 403 a nuevas sesiones).
 * - `idle`      — sin verificar: beneficios + CTA que abre la URL hospedada
 *                 de Didit en el navegador (`POST /user/kyc`).
 *
 * Al volver del navegador (AppState → active tras abrir la sesión) se
 * re-consulta el estado — espejo del recheck por `visibilitychange` de la web.
 * Los códigos del POST se mapean: 409 → pending, 403 → declined/max intentos,
 * 400 → ya verificado (refresca).
 */
const KYC = () => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Auth
	const { user, updateUser } = useAuth()

	// States: 'loading' | 'verified' | 'pending' | 'declined' | 'idle'
	const [status, setStatus] = useState('loading')
	const [requesting, setRequesting] = useState(false)
	const sessionOpenedRef = useRef(false)

	const checkStatus = useCallback(async () => {
		try {
			const resp = await userApi.getKYCStatus()
			if (resp.success && resp.data) {
				if (resp.data.kyc) {
					setStatus('verified')
					// Refresca el flag local para que badges/gates reaccionen sin
					// esperar al próximo /user/extended
					if (!user?.kyc) updateUser({ kyc: true, kyc_status: 'approved' })
				} else if (resp.data.kyc_status === 'pending') {
					setStatus('pending')
				} else if (resp.data.kyc_status === 'declined') {
					setStatus('declined')
				} else {
					setStatus('idle')
				}
				return
			}
			setStatus(user?.kyc ? 'verified' : 'idle')
		} catch {
			setStatus(user?.kyc ? 'verified' : 'idle')
		}
	}, [user?.kyc, updateUser])

	// Estado inicial
	useEffect(() => { checkStatus() }, [checkStatus])

	// Re-check al volver del navegador de Didit
	useEffect(() => {
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active' && sessionOpenedRef.current) {
				checkStatus()
			}
		})
		return () => sub.remove()
	}, [checkStatus])

	// Polling mientras está en revisión
	useEffect(() => {
		if (status !== 'pending') return
		const poll = setInterval(checkStatus, PENDING_POLL_MS)
		return () => clearInterval(poll)
	}, [status, checkStatus])

	// Request verification session URL and open in browser
	const requestVerification = useCallback(async () => {
		try {
			setRequesting(true)
			const resp = await userApi.requestKYCSession()
			if (resp.success && resp.data) {
				sessionOpenedRef.current = true
				markKycSessionStarted()
				await Linking.openURL(resp.data)
				return
			}
			// El backend codifica el estado en el status HTTP
			if (resp.status === 409) {
				setStatus('pending')
				toast.info('Tu verificación está en revisión')
			} else if (resp.status === 403) {
				setStatus('declined')
			} else if (resp.status === 400) {
				checkStatus()
			} else {
				toast.error('Error', { description: resp.error || 'No se pudo obtener la sesión de verificación' })
			}
		} catch (e) { toast.error('Error', { description: e.message || 'Ha ocurrido un error' }) }
		finally { setRequesting(false) }
	}, [checkStatus])

	if (status === 'loading') return <QPLoader />

	// Verified state
	if (status === 'verified') {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					{/* Android resuelve verified.android.json (sin capas de glow: lottie-android recorta el Gaussian Blur a los bounds de la capa) */}
					<LottieView source={require('../../../assets/lotties/verified.json')} autoPlay loop={false} style={styles.lottie} />
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10, textAlign: 'center' }]}>¡Identidad verificada!</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>Gracias por completar la verificación. Ya puedes disfrutar de todos los beneficios.</Text>
				</View>
			</View>
		)
	}

	// En revisión (Didit procesando / revisión manual)
	if (status === 'pending') {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					<LottieView source={require('../../../assets/lotties/looking.json')} autoPlay loop style={styles.lottie} />
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10, textAlign: 'center' }]}>Verificación en revisión</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						Estamos revisando tu información. Te avisaremos en cuanto esté lista — normalmente toma solo unos minutos.
					</Text>
				</View>
			</View>
		)
	}

	// Rechazada — caso de soporte, sin re-intento self-service
	if (status === 'declined') {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					<View style={[styles.declinedIcon, { backgroundColor: theme.colors.danger + '18' }]}>
						<FontAwesome6 name="shield-halved" size={40} color={theme.colors.danger} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 18, textAlign: 'center' }]}>Verificación rechazada</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						No pudimos completar tu verificación. Escríbenos a{' '}
						<Text style={{ color: theme.colors.primary }} onPress={() => Linking.openURL('mailto:soporte@qvapay.com')}>
							soporte@qvapay.com
						</Text>
						{' '}y te ayudamos a resolverlo.
					</Text>
				</View>
			</View>
		)
	}

	// Not verified state
	return (
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between', paddingHorizontal: 20 }]}>

			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<LottieView source={require('../../../assets/lotties/looking.json')} autoPlay loop style={styles.lottie} />

				<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10 }]}>Verificación de identidad</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
					Verifica tu identidad para acceder a todos los beneficios de QvaPay.
				</Text>

				<View style={[containerStyles.card, { width: '100%' }]}>
					<BenefitItem icon="arrow-up" text="Límites de transacción más altos" theme={theme} textStyles={textStyles} />
					<BenefitItem icon="handshake" text="Mejores oportunidades en el P2P" theme={theme} textStyles={textStyles} />
					<BenefitItem icon="star" text="Acceso a funciones exclusivas" theme={theme} textStyles={textStyles} />
				</View>
			</View>

			<View style={containerStyles.bottomButtonContainer}>
				<QPButton
					title={requesting ? 'Abriendo verificación...' : 'Verificar mi identidad'}
					onPress={requestVerification}
					loading={requesting}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>

		</View>
	)
}

const BenefitItem = ({ icon, text, theme, textStyles }) => (
	<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
		<FontAwesome6 name={icon} size={16} color={theme.colors.successText} iconStyle="solid" />
		<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{text}</Text>
	</View>
)

const styles = StyleSheet.create({
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingBottom: 80,
		paddingHorizontal: 20,
	},
	lottie: {
		width: 200,
		height: 200,
	},
	declinedIcon: {
		width: 96,
		height: 96,
		borderRadius: 48,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default KYC
