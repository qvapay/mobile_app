import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Linking, AppState } from 'react-native'
import { Trans, useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// Flujo de verificación nativo (SDK embebido, con fallback a navegador)
import useKycVerification from '../../../hooks/useKycVerification'

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
 * - `pending`   — verificación en revisión: sin CTA, polling cada 12s.
 * - `declined`  — rechazada: caso de soporte, sin re-intento self-service
 *                 (el backend responde 403 a nuevas sesiones).
 * - `idle`      — sin verificar: beneficios + CTA que lanza el flujo NATIVO
 *                 de verificación (useKycVerification) sin salir de la app.
 *
 * El flujo nativo devuelve el resultado en línea (approved/pending/declined →
 * transición de estado inmediata). Solo en el fallback a navegador (backend
 * viejo sin session_token) sobrevive el re-check por AppState al volver, y los
 * códigos del POST se mapean: 409 → pending, 403 → declined, 400 → refresca.
 */
const KYC = () => {

	// Idioma activo
	const { t } = useTranslation()

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Auth
	const { user, updateUser } = useAuth()

	// Flujo de verificación nativo
	const { launchKyc, launching } = useKycVerification()

	// States: 'loading' | 'verified' | 'pending' | 'declined' | 'idle'
	const [status, setStatus] = useState('loading')
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

	// Re-check al volver del navegador (solo aplica al fallback sin SDK)
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

	// Lanza el flujo nativo y traduce su resultado al estado de la pantalla
	const requestVerification = useCallback(async () => {
		const resp = await launchKyc()

		if (resp.kind === 'native') {
			if (resp.outcome === 'approved') {
				setStatus('verified')
				toast.success(t('settings.kyc.toasts.approved'))
			} else if (resp.outcome === 'pending') {
				setStatus('pending')
				toast.info(t('settings.kyc.toasts.inReview'))
			} else if (resp.outcome === 'declined') {
				setStatus('declined')
			}
			// cancelled: el usuario cerró el flujo, se queda en idle sin ruido
			return
		}

		if (resp.kind === 'browser') {
			// Fallback a la URL hospedada: el resultado llega al volver (AppState)
			sessionOpenedRef.current = true
			return
		}

		if (resp.kind === 'request-error') {
			// El backend codifica el estado en el status HTTP
			if (resp.status === 409) {
				setStatus('pending')
				toast.info(t('settings.kyc.toasts.inReview'))
			} else if (resp.status === 403) {
				setStatus('declined')
			} else if (resp.status === 400) {
				checkStatus()
			} else {
				toast.error(t('settings.kyc.toasts.errorTitle'), { description: resp.message || t('settings.kyc.toasts.sessionFailed') })
			}
			return
		}

		// sdk-error
		if (resp.errorType === 'cameraAccessDenied') {
			toast.error(t('settings.kyc.toasts.errorTitle'), { description: t('settings.kyc.toasts.cameraDenied') })
		} else {
			toast.error(t('settings.kyc.toasts.errorTitle'), { description: resp.message || t('settings.kyc.toasts.genericError') })
		}
	}, [launchKyc, checkStatus, t])

	if (status === 'loading') return <QPLoader />

	// Verified state
	if (status === 'verified') {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					{/* Android resuelve verified.android.json (sin capas de glow: lottie-android recorta el Gaussian Blur a los bounds de la capa) */}
					<LottieView source={require('../../../assets/lotties/verified.json')} autoPlay loop={false} style={styles.lottie} />
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10, textAlign: 'center' }]}>{t('settings.kyc.verified.title')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>{t('settings.kyc.verified.body')}</Text>
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
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10, textAlign: 'center' }]}>{t('settings.kyc.pending.title')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						{t('settings.kyc.pending.body')}
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
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 18, textAlign: 'center' }]}>{t('settings.kyc.declined.title')}</Text>
					{/* La frase vive en UNA clave; el email tocable entra como <0> vía Trans */}
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						<Trans
							i18nKey="settings.kyc.declined.body"
							components={[
								<Text style={{ color: theme.colors.primary }} onPress={() => Linking.openURL('mailto:soporte@qvapay.com')} />,
							]}
						/>
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

				<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10 }]}>{t('settings.kyc.idle.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
					{t('settings.kyc.idle.body')}
				</Text>

				<View style={[containerStyles.card, { width: '100%' }]}>
					<BenefitItem icon="arrow-up" text={t('settings.kyc.idle.benefits.higherLimits')} theme={theme} textStyles={textStyles} />
					<BenefitItem icon="handshake" text={t('settings.kyc.idle.benefits.betterP2P')} theme={theme} textStyles={textStyles} />
					<BenefitItem icon="star" text={t('settings.kyc.idle.benefits.exclusiveFeatures')} theme={theme} textStyles={textStyles} />
				</View>
			</View>

			<View style={containerStyles.bottomButtonContainer}>
				<QPButton
					title={launching ? t('settings.kyc.idle.opening') : t('settings.kyc.idle.verifyButton')}
					onPress={requestVerification}
					loading={launching}
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
