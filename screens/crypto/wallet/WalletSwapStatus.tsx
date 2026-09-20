import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Auth / wallet
import { useAuth } from '../../../auth/AuthContext'
import { isHouseToken } from '../../../wallet/assets'
import { refreshHistoryAfterSend, useWalletAssets, WALLET_BALANCES_KEY } from './walletQueries'
import { formatUsd, shortAddress } from './walletFormat'
import { swapTimeline } from './swapModel'
import { HOME_QUERY_KEY } from '../../home/homeQueries'

// API
import { swapApi } from '../../../api/swapApi'
import { ApiError } from '../../../api/unwrap'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { Swap, SwapStatus as Status } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletSwapStatus'>

const TERMINAL: Status[] = ['completed', 'failed', 'refunded', 'needs_review']
export const swapQueryKey = (uuid: string) => ['swap', 'detail', uuid]
export const isTerminalSwap = (status: Status | undefined): boolean => !!status && TERMINAL.includes(status)

const ICON: Record<Status, { name: 'clock' | 'paper-plane' | 'hourglass-half' | 'circle-check' | 'circle-xmark' | 'rotate-left' | 'magnifying-glass', tone: 'primary' | 'success' | 'danger' | 'warning' }> = {
	pending: { name: 'clock', tone: 'primary' },
	dispatching: { name: 'paper-plane', tone: 'primary' },
	sent: { name: 'hourglass-half', tone: 'primary' },
	completed: { name: 'circle-check', tone: 'success' },
	failed: { name: 'circle-xmark', tone: 'danger' },
	refunded: { name: 'rotate-left', tone: 'warning' },
	needs_review: { name: 'magnifying-glass', tone: 'warning' },
}

/**
 * Estado de un swap: polling a `GET /swap/{uuid}` cada 5 s hasta un estado terminal (sin
 * SSE: la Transaction del OUT nace `paid` y el stream cerraría al instante). Al completar
 * refresca saldo, Home, balances on-chain e historial del token.
 */
const WalletSwapStatus = ({ navigation, route }: Props) => {

	const { uuid } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()
	const { user, updateUser } = useAuth()
	const { all } = useWalletAssets()
	const [cancelling, setCancelling] = useState(false)

	const query = useQuery({
		queryKey: swapQueryKey(uuid),
		queryFn: async () => { const r = await swapApi.get(uuid); if (!r.success) throw new ApiError(r.error ?? 'swap', r.status); if (!r.data?.data) throw new ApiError('swap'); return r.data.data },
		refetchInterval: (q) => (isTerminalSwap(q.state.data?.status) ? false : 5000),
		meta: { noPersist: true },
	})
	const swap: Swap | undefined = query.data
	const status = swap?.status
	const qusd = useMemo(() => (swap ? all.find(a => a.contract === swap.asset) : undefined) ?? all.find(isHouseToken), [all, swap])

	// Efectos de cierre, una sola vez por swap
	const settledRef = useRef<string | null>(null)
	useEffect(() => {
		if (!swap || !isTerminalSwap(swap.status) || settledRef.current === swap.uuid) return
		settledRef.current = swap.uuid
		queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY })
		queryClient.invalidateQueries({ queryKey: WALLET_BALANCES_KEY })
		if (qusd) refreshHistoryAfterSend(queryClient, qusd.id)
		// IN completado / OUT reembolsado: el saldo cambió en el servidor sin pasar por la app
		if ((swap.direction === 'in' && swap.status === 'completed') || swap.status === 'refunded') updateUser({ balance: Number(user?.balance || 0) + swap.amount })
	}, [swap, qusd, queryClient, updateUser, user?.balance])

	const cancel = useCallback(async () => {
		if (!swap) return
		setCancelling(true)
		try {
			const result = await swapApi.cancel(swap.uuid)
			if (result.success && result.data?.data) {
				toast.success(t('crypto.wallet.swap.status.cancelled'))
				queryClient.setQueryData(swapQueryKey(uuid), result.data.data)
				if (typeof result.data.balance === 'number') { settledRef.current = swap.uuid; updateUser({ balance: result.data.balance }); queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY }) }
			} else toast.error((result.success ? null : result.error) || t('api.swap.cancelFailed'))
		} finally { setCancelling(false) }
	}, [swap, uuid, queryClient, updateUser, t])

	const hint = (() => {
		if (!swap) return ' '
		switch (swap.status) {
			case 'pending': case 'dispatching': return t('crypto.wallet.swap.status.pendingHint')
			case 'sent': return t('crypto.wallet.swap.status.sentHint')
			case 'completed': return swap.direction === 'out' ? t('crypto.wallet.swap.status.completedOut') : t('crypto.wallet.swap.status.completedIn')
			case 'refunded': return t('crypto.wallet.swap.status.refundedHint')
			case 'needs_review': return t('crypto.wallet.swap.status.reviewHint')
			case 'failed': return swap.reason === 'nonce' ? t('crypto.wallet.swap.status.failedNonce') : swap.reason === 'funds' ? t('crypto.wallet.swap.status.failedFunds') : t('crypto.wallet.swap.status.failedGeneric')
			default: return ' '
		}
	})()

	const icon = status ? ICON[status] : ICON.pending
	const tone = { primary: theme.colors.primary, success: theme.colors.successText ?? theme.colors.success, danger: theme.colors.danger, warning: theme.colors.warning }[icon.tone]
	const symbol = qusd?.symbol ?? 'QUSD'
	const amountLabel = swap ? (swap.direction === 'out' ? `+${swap.amount.toFixed(2)} ${symbol}` : `+${formatUsd(swap.amount)}`) : ''

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

			<View style={styles.hero}>
				<View style={[styles.iconWrap, { backgroundColor: tone + '18' }]}>
					<FontAwesome6 name={icon.name} size={30} color={tone} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>{status ? t(`crypto.wallet.swap.status.${status}`) : '…'}</Text>
				{!!swap && <Text style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText }]}>{amountLabel}</Text>}
				<Text style={[textStyles.h5, styles.hint, { color: theme.colors.secondaryText }]}>{hint}</Text>
			</View>

			{!!swap && <Timeline theme={theme} swap={swap} />}

			{!!swap && (
				<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
					<Row theme={theme} label={t('crypto.wallet.swap.fromLabel')} value={swap.direction === 'out' ? t('crypto.wallet.swap.balanceQvaPay') : shortAddress(swap.from_address)} />
					<Row theme={theme} label={t('crypto.wallet.swap.toLabel')} value={swap.direction === 'out' ? shortAddress(swap.to_address) : t('crypto.wallet.swap.balanceQvaPay')} />
					{!!swap.txid && (
						<QPPressable onPress={() => { if (swap.explorer) Linking.openURL(swap.explorer) }} style={styles.row} accessibilityRole="link">
							<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{t('crypto.wallet.swap.status.txLabel')}</Text>
							<Text style={[styles.rowValue, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]}>{shortAddress(swap.txid, 8, 8)}</Text>
						</QPPressable>
					)}
				</View>
			)}

			<View style={styles.spacer} />

			<View style={styles.actions}>
				{swap?.status === 'failed' && swap.reason === 'nonce' && (
					<QPButton title={t('crypto.wallet.swap.status.retry')} onPress={() => navigation.replace(ROUTES.WALLET_SWAP, { direction: 'in' })} />
				)}
				{swap?.status === 'pending' && swap.direction === 'out' && (
					<QPButton title={t('crypto.wallet.swap.status.cancel')} onPress={cancel} outlined loading={cancelling} disabled={cancelling} />
				)}
				<QPButton title={t('crypto.wallet.swap.status.done')} onPress={() => navigation.popToTop()} outlined={swap?.status === 'failed' && swap.reason === 'nonce'} />
			</View>
		</ScrollView>
	)
}

/**
 * Tres pasos como en los exchanges: recibido → en la red → confirmado. El activo late con el
 * color primario; un final malo (fallo, reembolso, revisión) marca el último paso en su tono.
 */
const Timeline = ({ theme, swap }: { theme: ReturnType<typeof useTheme>['theme'], swap: Swap }) => {
	const { t } = useTranslation()
	const { active, failedAt } = swapTimeline(swap.status)
	const steps = [
		t(swap.direction === 'out' ? 'crypto.wallet.swap.timeline.debited' : 'crypto.wallet.swap.timeline.signed'),
		t('crypto.wallet.swap.timeline.onChain'),
		failedAt ? t(`crypto.wallet.swap.status.${swap.status}`) : t(swap.direction === 'out' ? 'crypto.wallet.swap.timeline.inWallet' : 'crypto.wallet.swap.timeline.credited'),
	]
	const bad = swap.status === 'failed' ? theme.colors.danger : theme.colors.warning
	return (
		<View style={[styles.card, styles.timeline, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			{steps.map((label, index) => {
				const step = index + 1
				const failed = failedAt !== null && step === 3
				const done = !failed && active >= step
				const current = !failed && !done && active === step - 1
				const color = failed ? bad : done ? (theme.colors.successText ?? theme.colors.success) : current ? theme.colors.primary : theme.colors.tertiaryText
				return (
					<View key={label} style={styles.step}>
						<View style={styles.stepRail}>
							<View style={[styles.dot, { borderColor: color, backgroundColor: done || failed ? color : 'transparent' }]}>
								{done && <FontAwesome6 name="check" size={9} color={theme.colors.background} iconStyle="solid" />}
								{failed && <FontAwesome6 name="exclamation" size={9} color={theme.colors.background} iconStyle="solid" />}
							</View>
							{index < steps.length - 1 && <View style={[styles.line, { backgroundColor: done ? color : theme.colors.border }]} />}
						</View>
						<Text style={[styles.stepLabel, { color: done || current || failed ? theme.colors.primaryText : theme.colors.tertiaryText, fontFamily: current ? theme.typography.fontFamily.semiBold : theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{label}</Text>
					</View>
				)
			})}
		</View>
	)
}

const Row = ({ theme, label, value }: { theme: ReturnType<typeof useTheme>['theme'], label: string, value: string }) => (
	<View style={styles.row}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text selectable style={[styles.rowValue, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }]}>{value}</Text>
	</View>
)

const styles = StyleSheet.create({
	content: { gap: 12, paddingTop: 24, paddingBottom: 24, flexGrow: 1 },
	spacer: { flex: 1 },
	hero: { alignItems: 'center', gap: 8, paddingBottom: 12 },
	iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
	heroAmount: { fontSize: 30 },
	hint: { textAlign: 'center', paddingHorizontal: 12 },
	card: { borderRadius: 14, paddingHorizontal: 14 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
	rowValue: { flex: 1, textAlign: 'right' },
	actions: { gap: 10, marginTop: 8 },
	timeline: { paddingVertical: 14 },
	step: { flexDirection: 'row', gap: 12 },
	stepRail: { alignItems: 'center', width: 18 },
	dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
	line: { width: 2, flex: 1, minHeight: 18, marginVertical: 2 },
	stepLabel: { flex: 1, paddingBottom: 14, marginTop: 0 },
})

export default WalletSwapStatus
