import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Linking, AppState, Pressable } from 'react-native'
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

// Derivación de la fase (pura, testeada aparte)
import { deriveKycView, phaseForRequestError } from './kycPhase'

// Nudge del Home: recordar si el caso está retenido
import { markKycOnHold } from '../../../hooks/useKycPrompt'

// Lottie
import LottieView from 'lottie-react-native'

// Auth
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { KycView } from './kycPhase'

// Mientras la verificación está en manos del proveedor o del equipo se re-consulta
// cada 12s (mismo ritmo que el StepKyc de la web) — el webhook puede aprobar en
// segundos si el flujo fue automático, y la revisión manual se resuelve a mano
const WAITING_POLL_MS = 12000

// Estado de la sesión en el proveedor → clave de traducción. Solo se pinta como
// etiqueta secundaria en las pantallas de espera: NUNCA decide qué se muestra
// (el backend lo calcula por precedencia sobre todas las sesiones del usuario,
// así que puede venir de una vieja).
const SESSION_STATUS_KEYS: Record<string, string> = {
	'Not Started': 'settings.kyc.sessionStatus.notStarted',
	'In Progress': 'settings.kyc.sessionStatus.inProgress',
	'Awaiting User': 'settings.kyc.sessionStatus.awaitingUser',
	'Submitted': 'settings.kyc.sessionStatus.submitted',
	'Resubmitted': 'settings.kyc.sessionStatus.submitted',
	'Processing': 'settings.kyc.sessionStatus.processing',
	'In Review': 'settings.kyc.sessionStatus.inReview',
	'Declined': 'settings.kyc.sessionStatus.declined',
	'Approved': 'settings.kyc.sessionStatus.approved',
}

/**
 * Verificación de identidad (KYC vía Didit). La fase la decide el SERVIDOR, con
 * `GET /user/kyc?detail=1` → `{ kyc, kyc_status, session_status, on_hold, can_retry }`,
 * traducida por `deriveKycView`:
 *
 * - `verified`      — Lottie de verificado.
 * - `review`        — documentos en manos del proveedor: sin CTA, polling cada 12s.
 * - `manual_review` — retenido por el equipo (compliance o demasiados intentos):
 *                     sin CTA, mailto a soporte, y polling por si aprueban a mano.
 * - `idle`          — beneficios + CTA que lanza el flujo NATIVO de verificación
 *                     (useKycVerification) sin salir de la app. Tras un rechazo
 *                     ordinario se ofrece reintentar: el backend lo permite.
 *
 * OJO con `kyc_status`: el backend lo pone en 'pending' al CREAR la sesión y no lo
 * revierte nunca, así que NO significa "en revisión" (ver `kycPhase.ts`).
 *
 * El flujo nativo devuelve el resultado en línea. Solo en el fallback a navegador
 * (sesión reutilizada, sin `session_token`) sobrevive el re-check por AppState.
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

	// null mientras carga el estado inicial
	const [view, setView] = useState<KycView | null>(null)
	// Se abrió una sesión en esta visita: habilita el re-check por AppState y el
	// enlace de "generar uno nuevo" (la sesión pudo borrarse desde el proveedor)
	const [sessionOpened, setSessionOpened] = useState(false)
	const sessionOpenedRef = useRef(false)
	// Último valor escrito del flag de retén: el polling corre cada 12s y no tiene
	// sentido reescribir AsyncStorage con lo mismo una y otra vez
	const onHoldRef = useRef<boolean | null>(null)

	const syncOnHold = useCallback((onHold: boolean) => {
		if (onHoldRef.current === onHold) return
		onHoldRef.current = onHold
		markKycOnHold(onHold)
	}, [])

	const openedSession = useCallback(() => {
		sessionOpenedRef.current = true
		setSessionOpened(true)
	}, [])

	const checkStatus = useCallback(async () => {
		const resp = await userApi.getKYCStatus()

		// Un fallo de red NO cambia de pantalla: antes cualquier tropiezo del polling
		// mandaba a 'idle' y además mataba el intervalo. Con caché vacía se asume idle,
		// que es la fase con salida.
		if (!resp.success || !resp.data) {
			setView(prev => prev ?? { phase: user?.kyc ? 'verified' : 'idle', retryable: false, sessionStatus: null })
			return
		}

		const next = deriveKycView(resp.data)
		setView(next)

		// Refresca el flag local para que badges/gates reaccionen sin esperar al
		// próximo /user/extended
		if (resp.data.kyc && !user?.kyc) updateUser({ kyc: true, kyc_status: 'approved' })

		// El banner del Home no debe nagear a quien está retenido, pero sí a quien
		// puede reintentar tras un rechazo ordinario.
		syncOnHold(next.phase === 'manual_review')
	}, [user?.kyc, updateUser, syncOnHold])

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

	// Polling mientras se espera a alguien: al proveedor o al equipo
	useEffect(() => {
		if (view?.phase !== 'review' && view?.phase !== 'manual_review') return
		const poll = setInterval(checkStatus, WAITING_POLL_MS)
		return () => clearInterval(poll)
	}, [view?.phase, checkStatus])

	// Lanza el flujo nativo y traduce su resultado a la fase de la pantalla
	const requestVerification = useCallback(async ({ refresh = false } = {}) => {
		const resp = await launchKyc({ refresh })

		if (resp.kind === 'native') {
			if (resp.outcome === 'approved') {
				setView({ phase: 'verified', retryable: false, sessionStatus: 'Approved' })
				toast.success(t('settings.kyc.toasts.approved'))
			} else if (resp.outcome === 'pending') {
				setView({ phase: 'review', retryable: false, sessionStatus: 'Submitted' })
				toast.info(t('settings.kyc.toasts.inReview'))
			} else if (resp.outcome === 'declined' || resp.outcome === 'unknown') {
				// Un rechazo NO es terminal (el backend deja reintentar salvo retén) y un
				// estado ilegible tampoco se inventa: en ambos casos manda el servidor.
				checkStatus()
			}
			// cancelled: el usuario cerró el flujo, se queda como está sin ruido
			return
		}

		if (resp.kind === 'browser') {
			// Fallback a la URL hospedada: el resultado llega al volver (AppState)
			openedSession()
			return
		}

		if (resp.kind === 'request-error') {

			// 400 = ya verificado: que lo confirme el servidor.
			if (resp.status === 400) { checkStatus(); return }
			// Transitorios: se avisa y la pantalla se queda donde está, con su botón.
			if (resp.status === 429) { toast.info(t('settings.kyc.toasts.rateLimited')); return }
			if (resp.status === 502) { toast.error(t('settings.kyc.toasts.errorTitle'), { description: t('settings.kyc.toasts.providerDown') }); return }

			const phase = phaseForRequestError(resp.status, resp.reason)

			if (phase === 'manual_review') {
				setView(prev => ({ phase, retryable: false, sessionStatus: prev?.sessionStatus ?? null }))
				syncOnHold(true)
				return
			}

			if (phase === 'review') {
				setView(prev => ({ phase, retryable: false, sessionStatus: prev?.sessionStatus ?? null }))
				toast.info(t('settings.kyc.toasts.inReview'))
				return
			}

			// Resto (incluido el 403 sin reason, que NO es un caso cerrado): error
			// reintentable desde el propio botón. Sin toast esto sería un click que no
			// hace nada visible.
			toast.error(t('settings.kyc.toasts.errorTitle'), { description: resp.message || t('settings.kyc.toasts.sessionFailed') })
			return
		}

		// sdk-error
		if (resp.errorType === 'cameraAccessDenied') {
			toast.error(t('settings.kyc.toasts.errorTitle'), { description: t('settings.kyc.toasts.cameraDenied') })
		} else {
			toast.error(t('settings.kyc.toasts.errorTitle'), { description: resp.message || t('settings.kyc.toasts.genericError') })
		}
	}, [launchKyc, checkStatus, openedSession, syncOnHold, t])

	if (!view) return <QPLoader />

	const statusKey = view.sessionStatus ? SESSION_STATUS_KEYS[view.sessionStatus] : null
	const sessionLabel = statusKey
		? <Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 12 }]}>
			{t('settings.kyc.sessionStatus.label', { status: t(statusKey) })}
		</Text>
		: null

	// Verified state
	if (view.phase === 'verified') {
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

	// En revisión — documentos enviados, la pelota está en el proveedor
	if (view.phase === 'review') {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					<LottieView source={require('../../../assets/lotties/looking.json')} autoPlay loop style={styles.lottie} />
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10, textAlign: 'center' }]}>{t('settings.kyc.review.title')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						{t('settings.kyc.review.body')}
					</Text>
					{sessionLabel}
				</View>
			</View>
		)
	}

	// Revisión manual — el equipo retiene el caso; no hay nada self-service
	if (view.phase === 'manual_review') {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					<View style={[styles.declinedIcon, { backgroundColor: theme.colors.warning + '18' }]}>
						<FontAwesome6 name="shield-halved" size={40} color={theme.colors.warning} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 18, textAlign: 'center' }]}>{t('settings.kyc.manualReview.title')}</Text>
					{/* La frase vive en UNA clave; el email tocable entra como <0> vía Trans */}
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						<Trans
							i18nKey="settings.kyc.manualReview.body"
							components={[
								<Text style={{ color: theme.colors.primary }} onPress={() => Linking.openURL('mailto:soporte@qvapay.com')} />,
							]}
						/>
					</Text>
					{sessionLabel}
				</View>
			</View>
		)
	}

	// Not verified state — con salida: siempre hay botón
	return (
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between', paddingHorizontal: 20 }]}>

			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<LottieView source={require('../../../assets/lotties/looking.json')} autoPlay loop style={styles.lottie} />

				<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 10 }]}>{t('settings.kyc.idle.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
					{view.retryable ? t('settings.kyc.retry.body') : t('settings.kyc.idle.body')}
				</Text>

				<View style={[containerStyles.card, { width: '100%' }]}>
					<BenefitItem icon="arrow-up" text={t('settings.kyc.idle.benefits.higherLimits')} theme={theme} textStyles={textStyles} />
					<BenefitItem icon="handshake" text={t('settings.kyc.idle.benefits.betterP2P')} theme={theme} textStyles={textStyles} />
					<BenefitItem icon="star" text={t('settings.kyc.idle.benefits.exclusiveFeatures')} theme={theme} textStyles={textStyles} />
				</View>
			</View>

			<View style={containerStyles.bottomButtonContainer}>
				<QPButton
					title={launching ? t('settings.kyc.idle.opening') : (view.retryable ? t('settings.kyc.retry.button') : t('settings.kyc.idle.verifyButton'))}
					onPress={() => requestVerification()}
					loading={launching}
					textStyle={{ color: theme.colors.almostWhite }}
				/>

				{/* Salida para quien aterriza en el "no existe" del proveedor: la sesión pudo
				    borrarse o reenviarse desde su panel, y refresh=1 salta la caché */}
				{sessionOpened && (
					<Pressable onPress={() => requestVerification({ refresh: true })} disabled={launching} style={{ paddingVertical: 12 }}>
						<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center' }]}>
							{t('settings.kyc.actions.newLinkHint')}{' '}
							<Text style={{ color: theme.colors.primary }}>{t('settings.kyc.actions.newLink')}</Text>
						</Text>
					</Pressable>
				)}
			</View>

		</View>
	)
}

type BenefitItemProps = {
	icon: FontAwesome6SolidIconName
	text: string
	theme: Theme
	textStyles: TextStyles
}

const BenefitItem = ({ icon, text, theme, textStyles }: BenefitItemProps) => (
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
