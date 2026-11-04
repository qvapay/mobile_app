import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native'
import { SurfaceHost } from '../../../ui/SurfaceContext'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { FlashList } from '@shopify/flash-list'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import LottieView from 'lottie-react-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import QPPressable from '../../../ui/particles/QPPressable'
import QPKeyboardView from '../../../ui/QPKeyboardView'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Data
import { selectLightningAddress, useLightningAddressAction, useLightningAddressQuery } from '../../../hooks/useLightningAddressQuery'
import { lnFailureHint, lnNameProblem, lnReasonKey, normalizeLnName } from '../../../helpers/lightningAddress'
import { copyTextToClipboard } from '../../../helpers'
import useMaxBrightness from '../../../hooks/useMaxBrightness'

// Piezas
import LnQrCard, { SATS_COLOR } from './lightning/LnQrCard'
import LnNameField from './lightning/LnNameField'
import LnPaymentRow, { formatSats } from './lightning/LnPaymentRow'
import LnRenameSheet from './lightning/LnRenameSheet'

// Routes / tipos
import { ROUTES } from '../../../routes'
import type { RootStackParamList, SettingsStackParamList } from '../../../types/navigation'
import type { LightningAddressAction, LightningAddressState, LightningPayment, LnReceiveUnit } from '../../../types/domain'
import type { ApiResult } from '../../../types/api'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

type Props = NativeStackScreenProps<SettingsStackParamList, 'LightningAddress'>

const usd = (n: number | string | undefined): string => `$${Number(n || 0).toFixed(2)}`
const pct = (n: number | undefined): string => `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} %`

/**
 * Lightning Address (`name@qvpay.me`): espejo de `/settings/lightning` de la web.
 * Tres estados por el GET: no disponible (motivo + verificación), activar (un
 * toque con el nombre sugerido) y mi dirección (QR, copiar/compartir, USD o
 * sats, límites, pausar, renombrar y cobros paginados). Todo POST devuelve el
 * estado entero, así que la caché se repinta sin otra petición.
 */
const LightningAddress = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>()

	const query = useLightningAddressQuery()
	const { state, payments } = selectLightningAddress(query.data)
	const act = useLightningAddressAction()

	const [busy, setBusy] = useState<string | null>(null)
	const [refreshing, setRefreshing] = useState(false)
	const [renameOpen, setRenameOpen] = useState(false)
	const [celebrating, setCelebrating] = useState(false)
	const [confetti, setConfetti] = useState(false)
	const confettiTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(() => () => { if (confettiTimer.current) clearTimeout(confettiTimer.current) }, [])

	// Brillo al máximo mientras el QR esté a la vista
	useMaxBrightness(!!state?.address && state.address.status === 'active')

	const goKyc = useCallback(() => navigation.navigate(ROUTES.KYC), [navigation])

	// Traduce un fallo del POST y lo enseña; devuelve el texto por si el llamador lo pinta en línea
	const reportFailure = useCallback((result: Extract<ApiResult<LightningAddressState>, { success: false }>): string => {
		const hint = lnFailureHint(result.details, result.status, result.error)
		const message = hint.key ? t(hint.key) : (hint.text || t('settings.lightningAddress.errors.generic'))
		toast.error(message)
		if (hint.kyc) goKyc()
		return message
	}, [t, goKyc])

	const run = useCallback(async (body: LightningAddressAction, successKey: string): Promise<boolean> => {
		if (busy) return false
		setBusy(body.action)
		const result = await act(body)
		setBusy(null)
		if (result.success) { toast.success(t(successKey)); return true }
		reportFailure(result)
		return false
	}, [busy, act, t, reportFailure])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await query.refetch() } finally { setRefreshing(false) }
	}, [query])

	const share = useCallback(async () => {
		if (!state?.address) return
		try { await Share.share({ message: t('settings.lightningAddress.card.shareMessage', { address: state.address.address }) }) }
		catch { /* cancelado */ }
	}, [state, t])

	const openPayment = useCallback((payment: LightningPayment) => {
		if (payment.transaction_uuid) rootNavigation.navigate(ROUTES.TRANSACTION, { uuid: payment.transaction_uuid })
	}, [rootNavigation])

	// ── Carga / error ──────────────────────────────────────────────────────
	if (query.isPending) return <QPLoader />
	if (!state) {
		return (
			<View style={[containerStyles.subContainer, styles.centered]}>
				<FontAwesome6 name="bolt" size={40} color={theme.colors.tertiaryText} iconStyle="solid" />
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center' }]}>{t('settings.lightningAddress.loadFailed')}</Text>
				<QPButton title={t('settings.lightningAddress.retry')} onPress={() => query.refetch()} outlined />
			</View>
		)
	}

	// ── No disponible ──────────────────────────────────────────────────────
	if (!state.address && (!state.available || !state.visible)) {
		const reasonKey = state.visible ? lnReasonKey(state.reason_code) : 'settings.lightningAddress.reasons.MODE_OFF'
		const message = reasonKey ? t(reasonKey) : (state.message || t('settings.lightningAddress.reasons.default'))
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
				<View>
					<Header t={t} textStyles={textStyles} theme={theme} />
					<HeroIcon color={theme.colors.tertiaryText} background={theme.colors.surface} />
					<View style={containerStyles.card}>
						<Text style={[textStyles.body, { color: theme.colors.primaryText, textAlign: 'center' }]}>{message}</Text>
					</View>
					<Benefits t={t} theme={theme} textStyles={textStyles} containerStyles={containerStyles} />
				</View>
				{state.reason_code === 'KYC' && (
					<View style={containerStyles.bottomButtonContainer}>
						<QPButton title={t('settings.lightningAddress.verifyIdentity')} icon="id-card" onPress={goKyc} />
					</View>
				)}
			</View>
		)
	}

	// ── Activar ────────────────────────────────────────────────────────────
	if (!state.address) {
		return (
			<ActivateView
				state={state}
				busy={busy === 'activate'}
				onActivate={async (name) => {
					const ok = await run({ action: 'activate', name }, 'settings.lightningAddress.toasts.activated')
					if (ok) {
						ReactNativeHapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
						setCelebrating(true)
						setConfetti(true)
						confettiTimer.current = setTimeout(() => setConfetti(false), 3200)
					}
				}}
			/>
		)
	}

	// ── Mi dirección ───────────────────────────────────────────────────────
	const { address, receive, fees, limits } = state
	const paused = address.status === 'paused'
	const blocked = address.status === 'blocked'
	const showReceive = !blocked && (receive.sats_available || receive.as === 'sats')
	const statusKey = state.receiving ? 'receiving' : paused ? 'paused' : blocked ? 'blocked' : 'notReceiving'
	const statusColor = state.receiving ? theme.colors.successText : blocked ? theme.colors.danger : theme.colors.warning

	const chooseUnit = (unit: LnReceiveUnit) => {
		if (unit === receive.as) return
		run({ action: 'receive', receive_as: unit }, unit === 'sats' ? 'settings.lightningAddress.toasts.receiveSats' : 'settings.lightningAddress.toasts.receiveUsd')
	}

	const header = (
		<View>
			{celebrating && (
				<View style={[containerStyles.card, styles.celebrate, { borderColor: SATS_COLOR + '66', borderWidth: 1 }]}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{t('settings.lightningAddress.celebrate.title')}</Text>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{t('settings.lightningAddress.celebrate.text')}</Text>
					<QPButton title={t('settings.lightningAddress.celebrate.share')} icon="share-nodes" onPress={share} />
				</View>
			)}

			<View style={styles.qrSection}>
				<LnQrCard address={address} hint={t('settings.lightningAddress.card.tapToCopy')} />
				<View style={styles.status}>
					<View style={[styles.statusDot, { backgroundColor: statusColor }]} />
					<Text style={{ color: statusColor, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>
						{t(`settings.lightningAddress.card.${statusKey}`)}
					</Text>
				</View>
				{blocked && (
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, textAlign: 'center' }]}>{t('settings.lightningAddress.card.blockedHelp')}</Text>
				)}
			</View>

			<View style={styles.buttons}>
				<View style={styles.button}><QPButton title={t('settings.lightningAddress.card.copy')} icon="copy" onPress={() => copyTextToClipboard(address.address)} /></View>
				<View style={styles.button}><QPButton title={t('settings.lightningAddress.card.share')} icon="share-nodes" onPress={share} outlined /></View>
			</View>

			{showReceive && (
				<View style={containerStyles.card}>
					<Text style={[textStyles.h4, { marginBottom: 2 }]}>{t('settings.lightningAddress.receive.title')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginBottom: 12 }]}>
						{t('settings.lightningAddress.receive.subtitle')}{state.satoshis > 0 ? ` ${t('settings.lightningAddress.receive.satsBalance', { sats: formatSats(state.satoshis) })}` : ''}
					</Text>
					<ReceiveOption
						icon="dollar-sign" title={t('settings.lightningAddress.receive.usd.title')}
						text={t('settings.lightningAddress.receive.usd.text', { fee: feeText(t, fees.usd_pct) })}
						selected={receive.as === 'usd'} disabled={!!busy} onPress={() => chooseUnit('usd')} theme={theme} textStyles={textStyles}
					/>
					<ReceiveOption
						icon="bitcoin-sign" title={t('settings.lightningAddress.receive.sats.title')}
						text={t('settings.lightningAddress.receive.sats.text', { fee: feeText(t, fees.sats_pct) })}
						selected={receive.as === 'sats'} disabled={!!busy || !receive.sats_available} onPress={() => chooseUnit('sats')} theme={theme} textStyles={textStyles}
					/>
					{receive.as === 'sats' && receive.effective !== 'sats' && (
						<View style={[styles.notice, { backgroundColor: theme.colors.warning + '14' }]}>
							<Text style={[textStyles.caption, { color: theme.colors.primaryText }]}>{t('settings.lightningAddress.receive.unavailableNow')}</Text>
						</View>
					)}
				</View>
			)}

			<View style={[containerStyles.card, styles.limits]}>
				<Limit label={t('settings.lightningAddress.limits.perPayment')} value={`${usd(limits.min_usd)} – ${usd(limits.max_usd)}`} theme={theme} textStyles={textStyles} />
				<Limit label={t('settings.lightningAddress.limits.today')} value={t('settings.lightningAddress.limits.of', { remaining: usd(limits.remaining_usd), daily: usd(limits.daily_usd) })} theme={theme} textStyles={textStyles} />
				<Limit label={t('settings.lightningAddress.limits.fee')} value={pct(receive.effective === 'sats' ? fees.sats_pct : fees.usd_pct)} theme={theme} textStyles={textStyles} />
			</View>

			{!blocked && (
				<View style={[containerStyles.card, styles.actionsCard]}>
					<ActionRow
						icon={paused ? 'play' : 'pause'}
						title={t(paused ? 'settings.lightningAddress.card.resume' : 'settings.lightningAddress.card.pause')}
						loading={busy === 'pause' || busy === 'resume'}
						onPress={() => run({ action: paused ? 'resume' : 'pause' }, paused ? 'settings.lightningAddress.toasts.resumed' : 'settings.lightningAddress.toasts.paused')}
						theme={theme} textStyles={textStyles}
					/>
					{state.renames_left > 0 && (
						<ActionRow
							icon="pen"
							title={t('settings.lightningAddress.rename.title')}
							subtitle={t('settings.lightningAddress.rename.left', { count: state.renames_left })}
							onPress={() => setRenameOpen(true)}
							theme={theme} textStyles={textStyles}
						/>
					)}
					<ActionRow
						icon="link"
						title={t('settings.lightningAddress.card.copyLnurl')}
						onPress={() => copyTextToClipboard(address.lnurl)}
						theme={theme} textStyles={textStyles}
					/>
					{state.satoshis > 0 && (
						<ActionRow
							icon="bolt"
							tint={SATS_COLOR}
							title={t('settings.lightningAddress.withdrawSats')}
							subtitle={t('settings.lightningAddress.receive.satsBalance', { sats: formatSats(state.satoshis) })}
							onPress={() => rootNavigation.navigate(ROUTES.WITHDRAW, { preselectedCoin: 'BTCLN' })}
							theme={theme} textStyles={textStyles} last
						/>
					)}
				</View>
			)}

			<Text style={[textStyles.h4, styles.paymentsTitle]}>{t('settings.lightningAddress.payments.title')}</Text>
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={payments}
				keyExtractor={(p) => p.uuid}
				renderItem={({ item, index }) => <LnPaymentRow payment={item} onPress={openPayment} last={index === payments.length - 1} />}
				ListHeaderComponent={header}
				ListEmptyComponent={<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{t('settings.lightningAddress.payments.empty')}</Text>}
				ListFooterComponent={query.isFetchingNextPage ? <View style={styles.footerLoader}><ActivityIndicator size="small" color={theme.colors.primary} /></View> : null}
				onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage() }}
				onEndReachedThreshold={0.4}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
				contentContainerStyle={styles.listContent}
				showsVerticalScrollIndicator={false}
			/>
			{confetti && (
				<View pointerEvents="none" style={StyleSheet.absoluteFill}>
					<LottieView source={require('../../../assets/lotties/conffeti.json')} autoPlay loop={false} style={StyleSheet.absoluteFill} resizeMode="cover" />
				</View>
			)}
			<LnRenameSheet
				open={renameOpen}
				onClose={() => setRenameOpen(false)}
				currentName={address.name}
				domain={state.domain}
				renamesLeft={state.renames_left}
				onRename={async (name) => {
					const result = await act({ action: 'rename', name })
					if (result.success) { toast.success(t('settings.lightningAddress.toasts.renamed')); return null }
					const hint = lnFailureHint(result.details, result.status, result.error)
					if (hint.kyc) goKyc()
					return hint.key ? t(hint.key) : (hint.text || t('settings.lightningAddress.errors.generic'))
				}}
			/>
		</View>
	)
}

// ── Piezas locales ─────────────────────────────────────────────────────────

type Styles = { theme: ReturnType<typeof useTheme>['theme'], textStyles: ReturnType<typeof useTextStyles> }
type Tr = ReturnType<typeof useTranslation>['t']

const feeText = (t: Tr, feePct: number | undefined): string =>
	(Number(feePct) > 0 ? t('settings.lightningAddress.receive.fee', { pct: pct(feePct) }) : t('settings.lightningAddress.receive.noFee'))

const Header = ({ t, textStyles, theme }: Styles & { t: Tr }) => (
	<View>
		<Text style={textStyles.h1}>{t('settings.lightningAddress.title')}</Text>
		<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.lightningAddress.subtitle')}</Text>
	</View>
)

const HeroIcon = ({ color, background }: { color: string, background: string }) => (
	<View style={styles.hero}>
		<View style={[styles.heroCircle, { backgroundColor: background }]}>
			<FontAwesome6 name="bolt" size={48} color={color} iconStyle="solid" />
		</View>
	</View>
)

const BENEFITS: { key: string, icon: FontAwesome6SolidIconName }[] = [
	{ key: 'anyWallet', icon: 'globe' },
	{ key: 'instant', icon: 'bolt' },
	{ key: 'unit', icon: 'arrows-rotate' },
]

const Benefits = ({ t, theme, textStyles, containerStyles }: Styles & { t: Tr, containerStyles: ReturnType<typeof useContainerStyles> }) => (
	<View style={containerStyles.card}>
		{BENEFITS.map((b, i) => (
			<View key={b.key} style={[styles.benefit, i < BENEFITS.length - 1 && styles.benefitGap]}>
				<View style={[styles.benefitIcon, { backgroundColor: SATS_COLOR + '1A' }]}>
					<FontAwesome6 name={b.icon} size={14} color={SATS_COLOR} iconStyle="solid" />
				</View>
				<View style={styles.benefitTexts}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{t(`settings.lightningAddress.activate.benefits.${b.key}.title`)}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t(`settings.lightningAddress.activate.benefits.${b.key}.text`)}</Text>
				</View>
			</View>
		))}
	</View>
)

const ActivateView = ({ state, busy, onActivate }: { state: LightningAddressState, busy: boolean, onActivate: (name: string) => void }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const [name, setName] = useState(state.suggested_name || '')
	const normalized = normalizeLnName(name)
	const invalid = !normalized || !!lnNameProblem(normalized)

	// QPKeyboardView ya es el subContainer (padding horizontal incluido): no envolverlo en otro
	return (
		<QPKeyboardView actions={<QPButton title={t('settings.lightningAddress.activate.button')} icon="bolt" onPress={() => onActivate(normalized)} loading={busy} disabled={busy || invalid} />}>
			<Header t={t} textStyles={textStyles} theme={theme} />
			<HeroIcon color={SATS_COLOR} background={SATS_COLOR + '1A'} />
			<Benefits t={t} theme={theme} textStyles={textStyles} containerStyles={containerStyles} />
			<View style={[containerStyles.card, styles.activateCard]}>
				<SurfaceHost tone="surface">
					<Text style={textStyles.h4}>{t('settings.lightningAddress.activate.title')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('settings.lightningAddress.activate.text')}</Text>
					<LnNameField value={name} onChange={setName} domain={state.domain} label={t('settings.lightningAddress.activate.nameLabel')} />
				</SurfaceHost>
			</View>
		</QPKeyboardView>
	)
}

const ReceiveOption = ({ icon, title, text, selected, disabled, onPress, theme, textStyles }: Styles & { icon: FontAwesome6SolidIconName, title: string, text: string, selected: boolean, disabled: boolean, onPress: () => void }) => (
	<QPPressable
		onPress={disabled ? undefined : onPress}
		accessibilityRole="radio"
		accessibilityState={{ selected, disabled }}
		style={[styles.option, { borderColor: selected ? theme.colors.primary : theme.colors.border + '80', backgroundColor: selected ? theme.colors.primary + '10' : 'transparent' }, disabled && !selected && { opacity: 0.5 }]}
	>
		<View style={styles.optionHeader}>
			<FontAwesome6 name={icon} size={14} color={selected ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
			<Text style={[textStyles.h5, { color: theme.colors.primaryText, flex: 1 }]}>{title}</Text>
			{selected && <FontAwesome6 name="circle-check" size={16} color={theme.colors.primary} iconStyle="solid" />}
		</View>
		<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{text}</Text>
	</QPPressable>
)

const Limit = ({ label, value, theme, textStyles }: Styles & { label: string, value: string }) => (
	<View style={styles.limit}>
		<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{label}</Text>
		<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{value}</Text>
	</View>
)

const ActionRow = ({ icon, tint, title, subtitle, loading, onPress, theme, textStyles, last }: Styles & { icon: FontAwesome6SolidIconName, tint?: string, title: string, subtitle?: string, loading?: boolean, onPress: () => void, last?: boolean }) => (
	<QPPressable onPress={loading ? undefined : onPress} style={[styles.actionRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '80' }]}>
		<View style={[styles.actionIcon, { backgroundColor: (tint || theme.colors.primary) + '15' }]}>
			<FontAwesome6 name={icon} size={14} color={tint || theme.colors.primary} iconStyle="solid" />
		</View>
		<View style={styles.actionTexts}>
			<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{title}</Text>
			{!!subtitle && <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{subtitle}</Text>}
		</View>
		{/* QPLoader es el Lottie de pantalla completa (200×200 con fondo): en una fila va el spinner pequeño */}
		{loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />}
	</QPPressable>
)

const styles = StyleSheet.create({
	centered: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
	hero: { alignItems: 'center', paddingVertical: 24 },
	heroCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
	benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
	benefitGap: { marginBottom: 12 },
	benefitIcon: { width: 32, height: 32, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	benefitTexts: { flex: 1, gap: 2 },
	activateCard: { gap: 8 },
	celebrate: { gap: 8 },
	qrSection: { alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 16 },
	status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	statusDot: { width: 8, height: 8, borderRadius: 4 },
	buttons: { flexDirection: 'row', gap: 10, marginBottom: 6 },
	button: { flex: 1 },
	option: { borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 6, marginTop: 8 },
	optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	notice: { padding: 10, borderRadius: 10, marginTop: 10 },
	limits: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
	limit: { flex: 1, gap: 2 },
	actionsCard: { paddingVertical: 4 },
	actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	actionIcon: { width: 32, height: 32, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	actionTexts: { flex: 1, gap: 2 },
	paymentsTitle: { marginTop: 12, marginBottom: 4 },
	listContent: { paddingBottom: 40 },
	footerLoader: { paddingVertical: 16 },
})

export default LightningAddress
