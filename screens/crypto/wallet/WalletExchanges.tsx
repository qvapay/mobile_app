import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useTextStyles, useContainerStyles } from '../../../theme/themeUtils'

// Datos
import { EXCHANGE_ORDERS_KEY, flattenExchangeOrders, trimToFirstPage, useExchangeOrdersQuery } from './exchangeQueries'
import { SWAP_LIST_KEY, flattenSwaps, useSwapListQuery } from './swapQueries'
import { mergeHistory } from './historyModel'
import { useWalletAssets } from './walletQueries'

// UI
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetBadge from '../../../ui/particles/QPAssetBadge'
import type { QPAssetIconKind } from '../../../ui/particles/QPAssetBadge'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { HistoryEntry, HistorySide } from './historyModel'
import type { AssetView } from '../../../wallet/assets'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletExchanges'>

/**
 * Historial de intercambios: los swaps con el saldo QvaPay y las órdenes de proveedor en
 * una sola lista cronológica (`historyModel` los funde). Para el usuario son lo mismo —
 * "cambié una cosa por otra"—, así que separarlos por motor solo le haría buscar en dos
 * sitios.
 *
 * Es además la red de seguridad del agregador: aquí aparece siempre la operación que se
 * quedó esperando el depósito porque el usuario cerró la app antes de enviar. Sin esta
 * lista, esa operación —con su dirección y su importe exacto— sería irrecuperable desde la
 * interfaz.
 */
const WalletExchanges = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()
	const { all } = useWalletAssets()

	const ordersQuery = useExchangeOrdersQuery()
	const swapsQuery = useSwapListQuery()

	const entries = useMemo(() => mergeHistory({
		orders: flattenExchangeOrders(ordersQuery.data?.pages),
		swaps: flattenSwaps(swapsQuery.data?.pages),
		moreOrders: ordersQuery.hasNextPage,
		moreSwaps: swapsQuery.hasNextPage,
	}), [ordersQuery.data, ordersQuery.hasNextPage, swapsQuery.data, swapsQuery.hasNextPage])

	const onRefresh = useCallback(() => {
		// Una query infinita con N páginas revalidaría TODAS en cadena: se recortan antes
		queryClient.setQueryData([...EXCHANGE_ORDERS_KEY, 'all'], trimToFirstPage)
		queryClient.setQueryData(SWAP_LIST_KEY, trimToFirstPage)
		ordersQuery.refetch()
		swapsQuery.refetch()
	}, [queryClient, ordersQuery, swapsQuery])

	// Se pide página a los DOS: la lista está fundida, y traer solo de uno dejaría el corte
	// de `mergeHistory` donde estaba
	const onEnd = useCallback(() => {
		if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) { ordersQuery.fetchNextPage() }
		if (swapsQuery.hasNextPage && !swapsQuery.isFetchingNextPage) { swapsQuery.fetchNextPage() }
	}, [ordersQuery, swapsQuery])

	/**
	 * El activo de un lado. El agregador manda el `assetId` completo; el swap solo el
	 * contrato, y la red la pone el catálogo (misma búsqueda que hace `WalletSwapStatus`).
	 */
	const assetFor = useCallback((side: HistorySide): AssetView | undefined => (
		side.kind === 'asset' ? all.find(a => a.id === side.assetId)
			: side.kind === 'token' ? all.find(a => a.contract === side.contract)
				: undefined
	), [all])

	const open = useCallback((entry: HistoryEntry) => {
		if (entry.kind === 'swap') { navigation.navigate(ROUTES.WALLET_SWAP_STATUS, { uuid: entry.uuid }) }
		else { navigation.navigate(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: entry.uuid }) }
	}, [navigation])

	// Vacío solo cuando los DOS motores han contestado: enseñar "no hay nada" mientras uno
	// carga es mentir durante medio segundo
	const loading = ordersQuery.isLoading || swapsQuery.isLoading

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={entries}
				keyExtractor={entry => entry.key}
				renderItem={({ item }) => (
					<Row
						entry={item}
						from={sideIcon(item.from, assetFor)}
						to={sideIcon(item.to, assetFor)}
						fromSymbol={sideSymbol(item.from, assetFor)}
						toSymbol={sideSymbol(item.to, assetFor)}
						onPress={() => open(item)}
					/>
				)}
				contentContainerStyle={styles.list}
				onEndReached={onEnd}
				onEndReachedThreshold={0.4}
				refreshControl={createHiddenRefreshControl(false, onRefresh)}
				ListEmptyComponent={loading ? null : (
					<Text style={[textStyles.body, styles.empty, { color: theme.colors.tertiaryText }]}>
						{t('crypto.wallet.exchange.historyEmpty')}
					</Text>
				)}
			/>
		</View>
	)
}

type AssetLookup = (side: HistorySide) => AssetView | undefined

/** El saldo QvaPay lleva isotipo; un activo, su logo con badge de red. */
const sideIcon = (side: HistorySide, assetFor: AssetLookup): QPAssetIconKind => {
	if (side.kind === 'balance') { return { kind: 'balance' } }
	const asset = assetFor(side)
	return { kind: 'wallet', logoTick: asset?.logoTick ?? '', networkTick: asset?.networkTick ?? null }
}

/** Símbolo del lado. El saldo custodial es USD; un activo desconocido, un guion. */
const sideSymbol = (side: HistorySide, assetFor: AssetLookup): string =>
	side.kind === 'balance' ? 'USD' : assetFor(side)?.symbol ?? '—'

/** Tono de la fase: verde lo pagado, ámbar lo devuelto o atascado, primario lo que sigue vivo. */
const toneFor = (entry: HistoryEntry, theme: ReturnType<typeof useTheme>['theme']): string =>
	entry.phase === 'done' ? theme.colors.successText
		: entry.phase === 'returned' || entry.phase === 'problem' ? theme.colors.warning
			: theme.colors.primary

type RowProps = {
	entry: HistoryEntry
	from: QPAssetIconKind
	to: QPAssetIconKind
	fromSymbol: string
	toSymbol: string
	onPress: () => void
}

const Row = ({ entry, from, to, fromSymbol, toSymbol, onPress }: RowProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const tone = toneFor(entry, theme)

	return (
		<QPPressable onPress={onPress} style={[styles.row, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]} accessibilityRole="button">
			{/* Los dos activos: el de origen detrás, el de destino delante y encabalgado */}
			<View style={styles.icons}>
				<QPAssetBadge icon={from} size={34} />
				<View style={styles.iconOverlap}>
					<QPAssetBadge icon={to} size={34} ringColor={theme.colors.surface} />
				</View>
			</View>

			<View style={styles.texts}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>
					{fromSymbol} → {toSymbol}
				</Text>
				<Text style={[textStyles.h6, { color: tone }]} numberOfLines={1}>
					{t(entry.statusKey)}
				</Text>
			</View>

			<View style={styles.amounts}>
				<Text style={[textStyles.h5, styles.right, { color: theme.colors.primaryText }]} numberOfLines={1}>
					−{entry.amountIn} {fromSymbol}
				</Text>
				<Text style={[textStyles.h6, styles.right, { color: theme.colors.secondaryText }]} numberOfLines={1}>
					{entry.amountOut ?? '—'} {toSymbol}
				</Text>
			</View>

			<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	list: { paddingTop: 8, paddingBottom: 24 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderCurve: 'continuous', marginBottom: 8 },
	icons: { flexDirection: 'row', width: 52 },
	iconOverlap: { marginLeft: -16 },
	texts: { flex: 1, gap: 2 },
	amounts: { gap: 2, maxWidth: '42%' },
	right: { textAlign: 'right' },
	empty: { textAlign: 'center', marginTop: 40 },
})

export default WalletExchanges
