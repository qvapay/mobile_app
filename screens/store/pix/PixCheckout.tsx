import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AppState, BackHandler, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { ComponentProps, ComponentType } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { CommonActions } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import LottieView from 'lottie-react-native'
import QRCodeStyled from 'react-native-qrcode-styled'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPFitText from '../../../ui/particles/QPFitText'
import QPLoader from '../../../ui/particles/QPLoader'
import QPPressable from '../../../ui/particles/QPPressable'
import PixIofNotice from './PixIofNotice'

// API
import { pixApi } from '../../../api/pixApi'
import { unwrap } from '../../../api/unwrap'

// Hooks / helpers
import useContentPadding from '../../../hooks/useContentPadding'
import useMaxBrightness from '../../../hooks/useMaxBrightness'
import { copyTextToClipboard } from '../../../helpers'
import { ROUTES } from '../../../routes'

// Carrito y compras
import { settleCartLines } from './pixCartLines'
import { MY_PURCHASES_KEY } from '../storeQueries'

// Logic
import { PIX_ELIGIBILITY_KEY, pixChargeKey } from './pixQueries'
import { formatBrl, formatPixClock, isPixPaid, pixPollDelay, pixSecondsLeft } from './pixRules'
import type { PixStage } from '../../../types/domain'
import type { RootStackParamList } from '../../../types/navigation'

// `errorCorrectionLevel` existe pero no está en sus tipos (ver Receive.tsx)
const QRCode = QRCodeStyled as ComponentType<ComponentProps<typeof QRCodeStyled> & { errorCorrectionLevel?: string }>

/** Lo que se pinta de una etapa cerrada. */
const FINISHED: Record<Exclude<PixStage, 'awaiting_payment'>, { icon?: string, tone: 'primary' | 'muted' }> = {
	delivered: { tone: 'primary' },
	verifying: { icon: 'shield-halved', tone: 'primary' },
	refunded: { icon: 'rotate-left', tone: 'muted' },
	expired: { icon: 'stopwatch', tone: 'muted' },
	cancelled: { icon: 'stopwatch', tone: 'muted' },
	failed: { icon: 'stopwatch', tone: 'muted' },
}

/** Sin decoración a propósito: lo escanea la cámara de un banco, y su fondo tiene que ser blanco. */
const PixQr = memo(({ data, size, dimmed }: { data: string, size: number, dimmed: boolean }) => (
	<View style={[styles.qrCard, dimmed && styles.qrDimmed]} testID="pix-qr">
		<QRCode data={data} size={size} padding={8} errorCorrectionLevel="M" color="#000000" />
	</View>
))

/**
 * QR de un cobro por PIX. Es una PANTALLA y no un `<Modal>` porque lo normal es copiar el código e
 * irse a la app del banco en el mismo teléfono: la app pasa a segundo plano con esto delante, y un
 * Modal abierto impediría presentar la cortina del bloqueo (ver «Modal zombi» en CLAUDE.md).
 *
 * Consulta `GET /pix/checkout/{uuid}` cada 4 s con el QR abierto y unos 30 s en `verifying`, y una
 * vez más al volver a la app. Lo que tarde más se sigue en Mis compras (`pix_holds`).
 */
const PixCheckout = ({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'PixCheckout'>) => {

	const { charge: initial, holdHours = 72, doneDepth = 1 } = route.params

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const contentPadding = useContentPadding(24)
	const { width: screenWidth } = useWindowDimensions()
	const queryClient = useQueryClient()

	const verifyingSince = useRef<number | null>(null)
	const { data, refetch } = useQuery({
		queryKey: pixChargeKey(initial.uuid),
		queryFn: async () => unwrap(await pixApi.getCheckout(initial.uuid)),
		initialData: initial,
		retry: false,
		meta: { noPersist: true },
		refetchInterval: (query) => {
			const current = query.state.data
			if (current?.stage === 'verifying' && verifyingSince.current === null) { verifyingSince.current = Date.now() }
			return pixPollDelay({ stage: current?.stage, expiresAt: current?.expires_at, verifyingSince: verifyingSince.current, now: Date.now() })
		},
	})
	const charge = data ?? initial
	const { stage, uuid, surface } = charge
	const awaiting = stage === 'awaiting_payment'
	const paid = isPixPaid(stage)
	const code = charge.qr?.data ?? null

	// Cuenta atrás: se para sola al llegar a cero
	const [now, setNow] = useState(() => Date.now())
	const seconds = pixSecondsLeft(charge.expires_at, now)
	const ticking = awaiting && seconds !== null && seconds > 0
	useEffect(() => {
		if (!ticking) { return undefined }
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [ticking])
	const expired = seconds === 0

	useMaxBrightness(awaiting && !!code && !expired)

	// El pago se hace en la app del banco: al volver se mira ya, sin esperar a la siguiente vuelta
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') { refetch() } })
		return () => subscription.remove()
	}, [refetch])

	// Con el pago dentro, lo que pinta el resto de la app ya no vale
	useEffect(() => {
		if (awaiting) { return }
		queryClient.invalidateQueries({ queryKey: PIX_ELIGIBILITY_KEY })
		if (!paid) { return }
		queryClient.invalidateQueries({ queryKey: MY_PURCHASES_KEY })
		if (surface === 'market') { queryClient.invalidateQueries({ queryKey: ['market', 'orders'] }) }
	}, [awaiting, paid, queryClient, stage, surface])

	// Las líneas cobradas salen del carrito, las que se mandaron con ESTE cobro; las de uno devuelto se quedan
	useEffect(() => {
		if (!awaiting) { settleCartLines(uuid, stage) }
	}, [awaiting, stage, uuid])

	// Cerrar un cobro pagado también saca el wizard: quedarse en él invitaría a pagar dos veces
	const leave = useCallback((target?: string) => {
		const depth = paid ? doneDepth : 1
		navigation.dispatch((state) => {
			const kept = state.routes.slice(0, Math.max(1, state.routes.length - depth))
			const routes = target ? [...kept, { name: target }] : kept
			return CommonActions.reset({ ...state, routes, index: routes.length - 1 })
		})
	}, [doneDepth, navigation, paid])

	// Pagado no hay vuelta atrás al wizard: solo los botones de abajo
	useLayoutEffect(() => {
		if (paid) { navigation.setOptions({ headerBackVisible: false, gestureEnabled: false }) }
	}, [navigation, paid])
	useEffect(() => {
		if (!paid) { return undefined }
		const subscription = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true })
		return () => subscription.remove()
	}, [leave, paid])

	const [cancelling, setCancelling] = useState(false)
	const cancel = useCallback(async () => {
		setCancelling(true)
		const result = await pixApi.cancelCheckout(uuid)
		setCancelling(false)
		if (result.success) {
			queryClient.invalidateQueries({ queryKey: PIX_ELIGIBILITY_KEY })
			navigation.goBack()
			return
		}
		if ((result.details as { code?: unknown } | undefined)?.code === 'PIX_NOT_CANCELLABLE') {
			// El pago acaba de entrar y la compra sigue su curso: que lo diga la propia pantalla
			toast.info(t('store.pix.checkout.notCancellable'))
			refetch()
			return
		}
		toast.error(result.error || t('store.pix.errors.generic'))
	}, [navigation, queryClient, refetch, t, uuid])

	if (awaiting) {
		const qrSize = Math.min(screenWidth - 96, 240)
		return (
			<View style={containerStyles.subContainer}>
				<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[contentPadding, styles.scroll]}>
					<Text style={[textStyles.caption, styles.centered, { color: theme.colors.secondaryText }]} numberOfLines={2}>
						{charge.description || t('store.pix.checkout.fallbackDescription')}
					</Text>
					<QPFitText style={[textStyles.amount, styles.amount, { color: theme.colors.primaryText }]}>{formatBrl(charge.total_brl)}</QPFitText>

					{code
						? <PixQr data={code} size={qrSize} dimmed={expired} />
						: <View style={[styles.qrLoading, { width: qrSize, height: qrSize }]}><QPLoader /></View>}

					{seconds !== null && (
						<View style={styles.clock}>
							<FontAwesome6 name="stopwatch" size={13} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]} testID="pix-countdown">
								{expired ? t('store.pix.checkout.expired') : t('store.pix.checkout.expiresIn', { time: formatPixClock(seconds) })}
							</Text>
						</View>
					)}

					<Text style={[textStyles.caption, styles.centered, styles.instructions, { color: theme.colors.tertiaryText }]}>{t('store.pix.checkout.instructions')}</Text>

					<View style={styles.spacer} />

					<View style={styles.legal}><PixIofNotice /></View>
					<QPButton title={t('store.pix.checkout.copy')} icon="copy" onPress={() => { if (code) { copyTextToClipboard(code) } }} disabled={!code || expired} testID="pix-copy" />
					{!expired && !!code && (
						<QPPressable onPress={cancel} disabled={cancelling} style={styles.textAction} accessibilityRole="button" testID="pix-cancel">
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{cancelling ? t('store.pix.checkout.cancelling') : t('store.pix.checkout.cancel')}</Text>
						</QPPressable>
					)}
				</ScrollView>
			</View>
		)
	}

	// Una etapa que esta versión no conozca se cuenta como lo que es para el comprador: en marcha
	const shown = FINISHED[stage] ? stage : 'verifying'
	const view = FINISHED[shown]
	const amount = formatBrl(charge.refunded_brl || charge.total_brl)
	const goPurchases = () => leave(stage === 'delivered' && surface === 'market' ? ROUTES.MARKET_ORDERS : ROUTES.MY_PURCHASES)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[contentPadding, styles.scroll]}>
				<View style={styles.spacer} />
				{view.icon
					? (
						<View style={[styles.finishedIcon, { backgroundColor: `${view.tone === 'primary' ? theme.colors.primary : theme.colors.tertiaryText}1A` }]}>
							<FontAwesome6 name={view.icon as 'stopwatch'} size={26} color={view.tone === 'primary' ? theme.colors.primary : theme.colors.tertiaryText} iconStyle="solid" />
						</View>
					)
					: <LottieView source={require('../../../assets/lotties/verified.json')} autoPlay loop={false} style={styles.lottie} />}
				<Text style={[textStyles.h3, styles.centered, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 16 }]} testID="pix-finished-title">
					{t(`store.pix.checkout.finished.${shown}.title`)}
				</Text>
				<Text style={[textStyles.h6, styles.centered, { color: theme.colors.secondaryText, marginTop: 8 }]}>
					{t(`store.pix.checkout.finished.${shown}.body`, { hours: holdHours, amount })}
				</Text>
				<View style={styles.spacer} />
				{paid && <QPButton title={t('store.pix.checkout.seePurchases')} onPress={goPurchases} testID="pix-see-purchases" />}
				<QPPressable onPress={() => leave()} style={styles.textAction} accessibilityRole="button" testID="pix-close">
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('common.actions.close')}</Text>
				</QPPressable>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scroll: { flexGrow: 1, alignItems: 'center' },
	centered: { textAlign: 'center' },
	amount: { marginTop: 6, marginBottom: 18 },
	qrCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 8 },
	qrDimmed: { opacity: 0.25 },
	qrLoading: { alignItems: 'center', justifyContent: 'center' },
	clock: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
	instructions: { marginTop: 10, paddingHorizontal: 8 },
	spacer: { flex: 1, minHeight: 16 },
	legal: { alignSelf: 'stretch', marginBottom: 12 },
	textAction: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 4 },
	finishedIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	lottie: { width: 140, height: 140 },
})

export default PixCheckout
