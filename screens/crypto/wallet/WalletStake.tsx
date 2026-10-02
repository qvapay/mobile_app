import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { assetPrice } from '../../../wallet/assets'
import { displayAmount, formatUnits } from '../../../wallet/chains/units'
import { isPlausibleApy } from '../../../wallet/staking/apy'
import { canStakeAction, entryActionFor, exitActionFor } from '../../../wallet/staking/capabilities'
import { sortPositions, summarizePositions, timeLeft } from '../../../wallet/staking/staking'
import { isStakingKind } from '../../../wallet/staking/types'
import type { StakeAction, StakePosition, StakingKind } from '../../../wallet/staking/types'
import { usePriceMap, useWalletAssets } from './walletQueries'
import { useStakingConfig, useStakingSnapshot, useTargetApys } from './stakingQueries'
import { formatUsd } from './walletFormat'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPFitText from '../../../ui/particles/QPFitText'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import QPSkeleton from '../../../ui/particles/QPSkeleton'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'
import StakePositionRow from './components/StakePositionRow'
import StakingDisclosureModal from './components/StakingDisclosureModal'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletStake'>

const NO_ACCEPTED: Record<string, boolean> = {}

/** Acción que ofrece cada posición según su estado, si la cadena la sabe firmar. */
const positionAction = (kind: StakingKind, position: StakePosition): StakeAction | null => {
	if (position.status === 'withdrawable') return canStakeAction(kind, 'withdraw') ? 'withdraw' : null
	// TRON: solo lo congelado PROPIO se descongela; lo delegado a otros hay que recuperarlo antes
	if (kind === 'tron' && !position.id.startsWith('frozen:')) return null
	if (position.status === 'active' || position.status === 'activating' || position.status === 'locked') {
		const exit = exitActionFor(kind)
		return canStakeAction(kind, exit) ? exit : null
	}
	return null
}

/** Tarjeta con algo que hacer ahora (cobrar, votar): el motivo para volver a la pantalla. */
const ActionCard = ({ theme, icon, title, subtitle, cta, onPress, testID }: {
	theme: Theme, icon: 'gift' | 'check-to-slot', title: string, subtitle: string, cta: string | null, onPress: () => void, testID: string
}) => (
	<View style={[styles.card, styles.actionCard, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
		<View style={[styles.actionIcon, { backgroundColor: theme.colors.successText + '18' }]}>
			<FontAwesome6 name={icon} size={15} color={theme.colors.successText} iconStyle="solid" />
		</View>
		<View style={styles.actionInfo}>
			<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }}>{title}</Text>
			<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{subtitle}</Text>
		</View>
		{!!cta && (
			<QPPressable onPress={onPress} testID={testID} style={[styles.actionCta, { backgroundColor: theme.colors.primary }]} accessibilityRole="button">
				<Text style={{ color: theme.colors.buttonText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.sm }}>{cta}</Text>
			</QPPressable>
		)}
	</View>
)

const HowItWorks = ({ kind, theme }: { kind: StakingKind, theme: Theme }) => {
	const { t } = useTranslation()
	return (
		<View style={[styles.card, styles.how, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }}>{t('crypto.staking.asset.howTitle')}</Text>
			{(['step1', 'step2', 'step3'] as const).map((step, index) => (
				<View key={step} style={styles.step}>
					<View style={[styles.stepDot, { backgroundColor: theme.colors.primary + '18' }]}>
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{index + 1}</Text>
					</View>
					<Text style={[styles.stepText, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
						{t(`crypto.staking.asset.how.${kind}.${step}`)}
					</Text>
				</View>
			))}
		</View>
	)
}

/**
 * Staking de UN activo nativo (SOL, TRX, STX): cuánto hay comprometido,
 * cada posición con su estado y cuenta atrás, la acción de entrada y cómo
 * funciona la red. Las acciones solo aparecen cuando la cadena sabe firmarlas
 * (`wallet/staking/capabilities`); mientras tanto la pantalla informa de lo
 * que ya hay on-chain (p. ej. STX bloqueado desde otra wallet).
 */
const WalletStake = ({ navigation, route }: Props) => {

	const { assetId } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { isBackedUp } = useWallet()
	const { all, isLoading: balancesLoading, refetch: refetchBalances } = useWalletAssets()
	const prices = usePriceMap()
	const asset = useMemo(() => all.find(a => a.id === assetId), [all, assetId])
	const kind = asset && isStakingKind(asset.kind) ? asset.kind : null

	const snapshot = useStakingSnapshot(asset)
	const positions = useMemo(() => sortPositions(snapshot.data?.positions ?? []), [snapshot.data])
	const summary = useMemo(() => summarizePositions(positions), [positions])

	const { getSetting, updateSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean
	const accepted = getSetting('crypto', 'stakingDisclosure', NO_ACCEPTED) as Record<string, boolean>
	const [pending, setPending] = useState<{ action: StakeAction, positionId?: string } | null>(null)

	useLayoutEffect(() => {
		if (asset) navigation.setOptions({ headerTitle: `${t('navigation.headers.walletStake')} · ${asset.symbol}` })
	}, [navigation, asset, t])

	const [refreshing, setRefreshing] = useState(false)
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await Promise.all([refetchBalances(), snapshot.refetch()]) } finally { setRefreshing(false) }
	}, [refetchBalances, snapshot])

	const formatLeft = (at: number) => {
		const left = timeLeft(at, Date.now())
		return left ? t(`crypto.staking.timeLeft.${left.unit}`, { count: left.value }) : ''
	}

	const go = useCallback((action: StakeAction, positionId?: string) => {
		navigation.navigate(ROUTES.WALLET_STAKE_ACTION, { assetId, action, positionId })
	}, [navigation, assetId])

	/** Backup primero (como Enviar); luego el aviso de riesgos la primera vez por red. */
	const start = useCallback((action: StakeAction, positionId?: string) => {
		if (!kind) return
		if (!isBackedUp) { navigation.navigate(ROUTES.WALLET_BACKUP); return }
		if (!accepted[kind]) { setPending({ action, positionId }); return }
		go(action, positionId)
	}, [kind, isBackedUp, accepted, navigation, go])

	const acceptDisclosure = useCallback(() => {
		if (!kind || !pending) return
		updateSetting('crypto', 'stakingDisclosure', { ...accepted, [kind]: true })
		const next = pending
		setPending(null)
		go(next.action, next.positionId)
	}, [kind, pending, accepted, updateSetting, go])

	// APY: el real de la última epoch si la red lo da (Solana); si no, el estimado del destino al
	// que va TODO el stake (TRON: el SR votado). Mismo cálculo y misma caché que el selector
	const votedTarget = useMemo(() => {
		const ids = new Set(positions.map(p => p.target?.id).filter((id): id is string => !!id))
		return ids.size === 1 ? [...ids][0] : null
	}, [positions])
	const stakingConfig = useStakingConfig(asset?.chainKey)
	const votedTargets = useMemo(
		() => (votedTarget ? [stakingConfig?.targets.find(target => target.id === votedTarget) ?? { id: votedTarget }] : []),
		[votedTarget, stakingConfig],
	)
	const targetApys = useTargetApys(asset?.chainKey, votedTargets, !snapshot.data?.apy && !!votedTarget)
	const apy = snapshot.data?.apy ?? (votedTarget ? targetApys.data?.[votedTarget] ?? null : null)
	const claimable = snapshot.data?.claimable ?? 0n
	const claimableAt = snapshot.data?.claimableAt ?? null
	const unvoted = snapshot.data?.unvotedPower ?? 0n

	if (!asset || !kind) {
		return (
			<View style={[containerStyles.subContainer, styles.center]}>
				{balancesLoading ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.asset.notFound')}</Text>}
			</View>
		)
	}

	const entry = entryActionFor(kind)
	const canEnter = canStakeAction(kind, entry)
	const committed = formatUnits(summary.committed, asset.decimals)
	const price = assetPrice(asset, prices)
	const loadingPositions = snapshot.isLoading && !snapshot.data

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}>

				<View style={styles.hero}>
					<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={56} ringColor={theme.colors.background} />
					<Text style={[textStyles.h5, styles.heroLabel, { color: theme.colors.secondaryText }]}>{t('crypto.staking.asset.committed')}</Text>
					<QPFitText style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText }]}>
						{showBalance ? `${displayAmount(committed)} ${asset.symbol}` : `•••• ${asset.symbol}`}
					</QPFitText>
					{showBalance && price !== null && summary.committed > 0n && (
						<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>≈ {formatUsd(Number(committed) * price)}</Text>
					)}
					<Text style={[styles.available, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
						{t('crypto.staking.asset.available', { amount: showBalance ? asset.amountLabel : '••••', symbol: asset.symbol })}
					</Text>
					{isPlausibleApy(apy) && (
						<View style={[styles.apyPill, { backgroundColor: theme.colors.successText + '18' }]}>
							<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>
								{t('crypto.staking.asset.apy', { apy: `${(apy * 100).toFixed(1)} %` })}
							</Text>
						</View>
					)}
				</View>

				<Text style={[textStyles.h3, styles.sectionTitle, { color: theme.colors.primaryText }]}>{t('crypto.staking.asset.positions')}</Text>
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					{loadingPositions ? (
						<View style={styles.skeleton}>{[0, 1].map(i => <QPSkeleton key={i} width="100%" height={44} borderRadius={12} />)}</View>
					) : snapshot.isError && positions.length === 0 ? (
						<Text style={[textStyles.h5, styles.empty, { color: theme.colors.secondaryText }]}>{t('crypto.staking.asset.loadError')}</Text>
					) : positions.length === 0 ? (
						<Text style={[textStyles.h5, styles.empty, { color: theme.colors.secondaryText }]}>{t('crypto.staking.asset.empty', { symbol: asset.symbol })}</Text>
					) : positions.map((position, index) => {
						const action = positionAction(kind, position)
						return (
							<StakePositionRow
								key={position.id}
								position={position}
								symbol={asset.symbol}
								decimals={asset.decimals}
								showBalance={showBalance}
								isLast={index === positions.length - 1}
								action={action ? { label: t(`crypto.staking.actions.${action}`), onPress: () => start(action, position.id) } : null}
							/>
						)
					})}
				</View>

				{kind === 'tron' && claimable > 0n && canStakeAction(kind, 'claim') && (
					<ActionCard
						theme={theme}
						icon="gift"
						title={t('crypto.staking.asset.claim.title', { amount: showBalance ? displayAmount(formatUnits(claimable, asset.decimals)) : '••••', symbol: asset.symbol })}
						subtitle={claimableAt ? t('crypto.staking.asset.claim.wait', { time: formatLeft(claimableAt) }) : t('crypto.staking.asset.claim.ready')}
						cta={claimableAt ? null : t('crypto.staking.actions.claim')}
						onPress={() => start('claim')}
						testID="stake-claim"
					/>
				)}

				{kind === 'tron' && unvoted >= 1_000_000n && canStakeAction(kind, 'vote') && (
					<ActionCard
						theme={theme}
						icon="check-to-slot"
						title={t('crypto.staking.asset.unvoted.title', { amount: displayAmount(formatUnits(unvoted, asset.decimals)) })}
						subtitle={t('crypto.staking.asset.unvoted.subtitle')}
						cta={t('crypto.staking.asset.unvoted.cta')}
						onPress={() => start('vote')}
						testID="stake-vote"
					/>
				)}

				{!canEnter && (
					<View style={[styles.notice, { backgroundColor: theme.colors.primary + '12' }]}>
						<FontAwesome6 name="seedling" size={14} color={theme.colors.primary} iconStyle="solid" style={styles.noticeIcon} />
						<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
							{t('crypto.staking.asset.soonNotice', { symbol: asset.symbol })}
						</Text>
					</View>
				)}

				<HowItWorks kind={kind} theme={theme} />

				<Text style={[styles.disclaimer, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]}>
					{t('crypto.staking.hub.disclaimer')}
				</Text>
			</ScrollView>

			{canEnter && (
				<View style={styles.footer}>
					<QPButton title={t(`crypto.staking.actions.${entry}`)} onPress={() => start(entry)} testID="stake-entry" />
				</View>
			)}

			<StakingDisclosureModal visible={!!pending} kind={kind} onAccept={acceptDisclosure} onClose={() => setPending(null)} />
		</View>
	)
}

const styles = StyleSheet.create({
	center: { alignItems: 'center', justifyContent: 'center' },
	content: { paddingBottom: 32, gap: 12 },
	hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 8, gap: 4 },
	heroLabel: { marginTop: 10 },
	heroAmount: { fontSize: 34 },
	available: { marginTop: 2 },
	apyPill: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
	sectionTitle: { marginTop: 8 },
	card: { borderRadius: 14, paddingHorizontal: 12 },
	skeleton: { gap: 10, paddingVertical: 12 },
	empty: { textAlign: 'center', paddingVertical: 18 },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1, lineHeight: 20 },
	how: { paddingVertical: 14, gap: 12 },
	step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
	stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
	stepText: { flex: 1, lineHeight: 20 },
	disclaimer: { textAlign: 'center', paddingHorizontal: 8, marginTop: 4, lineHeight: 16 },
	actionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
	actionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	actionInfo: { flex: 1, minWidth: 0, gap: 2 },
	actionCta: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderCurve: 'continuous' },
	footer: { paddingTop: 8, paddingBottom: 24 },
})

export default WalletStake
