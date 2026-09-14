import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import { FlashList } from '@shopify/flash-list'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { addressForKind, assetPrice, explorerAddressUrl, explorerTxUrl } from '../../../wallet/assets'
import { displayAmount } from '../../../wallet/chains/units'
import { splitDust } from '../../../wallet/dust'
import { markHistoryFresh, usePriceMap, useWalletAssets, useWalletHistoryQuery } from './walletQueries'
import { formatUsd, shortAddress } from './walletFormat'
import { canSendAsset } from './walletSendActions'
import type { ApiError } from '../../../api/unwrap'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// Helpers
import { timeAgo } from '../../../helpers'

// UI
import QPFitText from '../../../ui/particles/QPFitText'
import QPPressable from '../../../ui/particles/QPPressable'
import QPSkeleton from '../../../ui/particles/QPSkeleton'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'
import AssetIcon from './components/AssetIcon'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { WalletTx } from '../../../types/domain'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletAsset'>

/** Auto-paginación: pedir páginas hasta tener esto visible… */
const MIN_VISIBLE_ITEMS = 10
/** …sin pasar de estas páginas encadenadas solas. */
const MAX_AUTO_PAGES = 5

const DIRECTION_ICON: Record<WalletTx['direction'], FontAwesome6SolidIconName> = {
	in: 'arrow-down',
	out: 'arrow-up',
	self: 'arrows-rotate',
}

type TxRowProps = { tx: WalletTx, theme: Theme, onPress: (tx: WalletTx) => void }

const TxRow = ({ tx, theme, onPress }: TxRowProps) => {
	const { t } = useTranslation()
	const failed = tx.status === 'failed'
	const isFee = tx.kind === 'fee'
	// Comisión: fila atenuada (no es dinero que fue a nadie, se quemó en la red)
	const tint = failed ? theme.colors.danger : isFee ? theme.colors.secondaryText : tx.direction === 'in' ? theme.colors.successText : theme.colors.primaryText
	const iconColor = failed ? theme.colors.danger : isFee ? theme.colors.secondaryText : tx.direction === 'in' ? theme.colors.successText : theme.colors.primary
	const counterpart = tx.direction === 'in' ? tx.from : tx.to
	const sign = tx.direction === 'in' ? '+' : tx.direction === 'out' ? '−' : ''

	return (
		<QPPressable onPress={() => onPress(tx)} style={[styles.txRow, { borderBottomColor: theme.colors.border + '40' }]}>
			<View style={[styles.txIcon, { backgroundColor: iconColor + '18' }]}>
				<FontAwesome6 name={failed ? 'xmark' : isFee ? 'fire' : DIRECTION_ICON[tx.direction]} size={14} color={iconColor} iconStyle="solid" />
			</View>
			<View style={styles.txInfo}>
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }} numberOfLines={1}>
					{isFee ? t('crypto.wallet.asset.feeEntry') : t(`crypto.wallet.asset.direction.${tx.direction}`)}
				</Text>
				<Text style={[{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }, styles.txSub]} numberOfLines={1}>
					{isFee
						? `${t('crypto.wallet.asset.feeEntrySub', { address: shortAddress(tx.to) })} · `
						: counterpart ? `${t(tx.direction === 'in' ? 'crypto.wallet.asset.from' : 'crypto.wallet.asset.to', { address: shortAddress(counterpart) })} · ` : ''}{timeAgo(tx.time * 1000)}
				</Text>
			</View>
			<View style={styles.txAmounts}>
				<Text style={{ color: tint, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }} numberOfLines={1}>
					{sign}{displayAmount(tx.amount)} {tx.symbol}
				</Text>
				{tx.status !== 'confirmed' && (
					<Text style={[{ color: failed ? theme.colors.danger : theme.colors.warning, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }, styles.txSub]}>
						{t(`crypto.wallet.asset.status.${tx.status}`)}
					</Text>
				)}
			</View>
		</QPPressable>
	)
}

type ActionProps = { icon: FontAwesome6SolidIconName, label: string, onPress: () => void, dimmed?: boolean, theme: Theme }

const Action = ({ icon, label, onPress, dimmed, theme }: ActionProps) => {
	const color = dimmed ? theme.colors.tertiaryText : theme.colors.primaryText
	return (
		<QPPressable onPress={onPress} style={[styles.action, { backgroundColor: theme.colors.elevation }]} accessibilityRole="button" accessibilityLabel={label}>
			<FontAwesome6 name={icon} size={17} color={color} iconStyle="solid" />
			<Text style={{ color, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }}>{label}</Text>
		</QPPressable>
	)
}

/**
 * Detalle de un activo en su red: saldo, valor, acciones y actividad on-chain
 * (historial paginado del proxy de qpweb; tocar un movimiento abre el
 * explorador). Si el historial no está disponible (backend sin desplegar o
 * proveedor caído), la pantalla sigue siendo útil: saldo + explorador.
 */
const WalletAsset = ({ navigation, route }: Props) => {

	const { assetId } = route.params
	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const { addresses, isBackedUp } = useWallet()
	const registry = useEffectiveRegistry()
	const { all, isLoading: balancesLoading, refetch: refetchBalances } = useWalletAssets()
	const prices = usePriceMap()
	const asset = useMemo(() => all.find(a => a.id === assetId), [all, assetId])
	const chain = asset ? registry.chains[asset.chainKey] : undefined
	const address = asset && addresses ? addressForKind(addresses, asset.kind) : null

	const { getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true) as boolean
	const hideDust = getSetting('crypto', 'hideDust', true) as boolean
	// "Mostrar" en la fila de ocultos revela el dust solo mientras dura esta pantalla
	const [revealDust, setRevealDust] = useState(false)

	const history = useWalletHistoryQuery(asset)
	const allItems = useMemo(() => history.data?.pages.flatMap(page => page.items) ?? [], [history.data])
	const priceForDust = asset ? assetPrice(asset, prices) : null
	const { visible: items, dust } = useMemo(
		() => (hideDust && !revealDust ? splitDust(allItems, priceForDust) : { visible: allItems, dust: [] as WalletTx[] }),
		[allItems, hideDust, revealDust, priceForDust],
	)
	const hiddenDustCount = hideDust && !revealDust ? dust.length : 0
	const historyStatus = (history.error as ApiError | null)?.status
	const historyUnavailable = history.isError && allItems.length === 0
	const pageCount = history.data?.pages.length ?? 0

	// El proxy filtra por página (txs de valor 0, contratos que no son
	// transferencias) y puede devolver páginas vacías CON cursor: sin esto una
	// lista corta se quedaría en "sin movimientos" y el onEndReached de una
	// lista vacía nunca dispara. Tope de páginas para no vaciar la cuota.
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = history
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage && allItems.length < MIN_VISIBLE_ITEMS && pageCount < MAX_AUTO_PAGES) fetchNextPage()
	}, [hasNextPage, isFetchingNextPage, allItems.length, pageCount, fetchNextPage])

	const [refreshing, setRefreshing] = useState(false)
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		if (asset) markHistoryFresh(asset.id)
		try { await Promise.all([refetchBalances(), history.refetch()]) } finally { setRefreshing(false) }
	}, [refetchBalances, history, asset])

	useLayoutEffect(() => {
		if (asset) navigation.setOptions({ headerTitle: `${asset.symbol} · ${asset.chainName}` })
	}, [navigation, asset])

	const openUrl = useCallback((url: string | null) => {
		if (!url) return
		Linking.openURL(url).catch(() => toast.error(t('crypto.wallet.asset.explorerFailed')))
	}, [t])

	const openTx = useCallback((tx: WalletTx) => openUrl(explorerTxUrl(chain, tx.hash)), [chain, openUrl])

	if (!asset) {
		return (
			<View style={[containerStyles.subContainer, styles.center]}>
				{balancesLoading ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.asset.notFound')}</Text>}
			</View>
		)
	}

	const price = assetPrice(asset, prices)

	const header = (
		<View>
			<View style={styles.hero}>
				<AssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={56} ringColor={theme.colors.background} />
				<QPFitText style={[textStyles.amount, styles.heroAmount, { color: theme.colors.primaryText }]}>
					{showBalance ? `${asset.amountLabel} ${asset.symbol}` : `•••• ${asset.symbol}`}
				</QPFitText>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>
					{showBalance && asset.usd !== null ? `≈ ${formatUsd(asset.usd)}` : ' '}
				</Text>
				{price !== null && (
					<Text style={[{ color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }, styles.priceLine]}>
						{t('crypto.wallet.asset.price', { symbol: asset.symbol, price: formatUsd(price, { compactSmall: true }) })}
					</Text>
				)}
			</View>

			<View style={styles.actions}>
				<Action
					theme={theme}
					icon="paper-plane"
					label={t('crypto.wallet.home.actions.send')}
					// Bitcoin aún no firma: avisa "próximamente"
					dimmed={!canSendAsset(asset)}
					onPress={() => !canSendAsset(asset) ? toast(t('crypto.wallet.home.sendSoon')) : isBackedUp ? navigation.navigate(ROUTES.WALLET_SEND, { assetId: asset.id }) : navigation.navigate(ROUTES.WALLET_BACKUP)}
				/>
				<Action
					theme={theme}
					icon="qrcode"
					label={t('crypto.wallet.home.actions.receive')}
					onPress={() => (isBackedUp ? navigation.navigate(ROUTES.WALLET_RECEIVE, { assetId: asset.id }) : navigation.navigate(ROUTES.WALLET_BACKUP))}
				/>
				<Action theme={theme} icon="up-right-from-square" label={t('crypto.wallet.asset.explorer')} onPress={() => openUrl(address ? explorerAddressUrl(chain, address) : null)} />
			</View>

			<Text style={[textStyles.h3, styles.sectionTitle, { color: theme.colors.primaryText }]}>{t('crypto.wallet.asset.activity')}</Text>

			{((history.isPending && history.fetchStatus === 'fetching') || (allItems.length === 0 && isFetchingNextPage)) && (
				<View style={styles.historySkeleton}>
					{[0, 1, 2].map(i => <QPSkeleton key={i} width="100%" height={48} borderRadius={12} />)}
				</View>
			)}

			{historyUnavailable && (
				<View style={[styles.emptyBox, { backgroundColor: theme.colors.surface }]}>
					<FontAwesome6 name="clock-rotate-left" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
					<Text style={[textStyles.h5, styles.emptyText, { color: theme.colors.secondaryText }]}>
						{t(historyStatus === 503 || historyStatus === 404 ? 'crypto.wallet.asset.historyUnavailable' : 'crypto.wallet.asset.historyError')}
					</Text>
					<QPPressable onPress={() => openUrl(address ? explorerAddressUrl(chain, address) : null)} style={styles.emptyCta}>
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>{t('crypto.wallet.asset.openExplorer')}</Text>
					</QPPressable>
				</View>
			)}

			{history.isSuccess && allItems.length === 0 && !hasNextPage && (
				<View style={[styles.emptyBox, { backgroundColor: theme.colors.surface }]}>
					<FontAwesome6 name="inbox" size={20} color={theme.colors.secondaryText} iconStyle="solid" />
					<Text style={[textStyles.h5, styles.emptyText, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.asset.empty', { symbol: asset.symbol })}</Text>
				</View>
			)}
		</View>
	)

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={items}
				keyExtractor={(tx, index) => `${tx.hash}:${index}`}
				renderItem={({ item }) => <TxRow tx={item} theme={theme} onPress={openTx} />}
				ListHeaderComponent={header}
				ListFooterComponent={
					<>
						{hiddenDustCount > 0 && (
							<QPPressable onPress={() => setRevealDust(true)} style={styles.dustRow} accessibilityRole="button">
								<FontAwesome6 name="eye-slash" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
								<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{t('crypto.wallet.asset.dustHidden', { count: hiddenDustCount })}</Text>
								<Text style={[textStyles.h6, { color: theme.colors.primary }]}>{t('crypto.wallet.asset.dustShow')}</Text>
							</QPPressable>
						)}
						{isFetchingNextPage && allItems.length > 0 && <ActivityIndicator style={styles.footer} color={theme.colors.primary} />}
					</>
				}
				onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
				onEndReachedThreshold={0.5}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={styles.listContent}
				refreshControl={createHiddenRefreshControl(refreshing, onRefresh)}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	center: { alignItems: 'center', justifyContent: 'center' },
	listContent: { paddingBottom: 40 },
	hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 18, gap: 4 },
	heroAmount: { marginTop: 10, fontSize: 38 },
	actions: { flexDirection: 'row', gap: 10, height: 56 },
	action: { flex: 1, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 5 },
	sectionTitle: { marginTop: 24, marginBottom: 6 },
	historySkeleton: { gap: 10, marginTop: 6 },
	emptyBox: { alignItems: 'center', gap: 10, padding: 20, borderRadius: 14, marginTop: 6 },
	emptyText: { textAlign: 'center' },
	emptyCta: { paddingVertical: 6, paddingHorizontal: 12 },
	txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
	// Indicador de estado, no acción: círculo (el squircle queda para botones)
	txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	txInfo: { flex: 1, minWidth: 0 },
	txSub: { marginTop: 2 },
	priceLine: { marginTop: 4 },
	txAmounts: { alignItems: 'flex-end', maxWidth: '50%' },
	footer: { paddingVertical: 16 },
	dustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
})

export default WalletAsset
