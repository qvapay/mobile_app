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
import { phaseOf } from './exchangeModel'
import { useWalletAssets } from './walletQueries'

// UI
import QPPressable from '../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../ui/particles/QPAssetIcon'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'

// Navigation
import { ROUTES } from '../../../routes'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'
import type { ExchangeOrder } from '../../../types/domain'
import type { AssetView } from '../../../wallet/assets'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletExchanges'>

/**
 * Historial de intercambios.
 *
 * Es la red de seguridad del módulo: aquí aparece siempre la operación que se quedó
 * esperando el depósito porque el usuario cerró la app antes de enviar. Sin esta lista, esa
 * operación —con su dirección y su importe exacto— sería irrecuperable desde la interfaz.
 */
const WalletExchanges = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()
	const { all } = useWalletAssets()

	const query = useExchangeOrdersQuery()
	const orders = useMemo(() => flattenExchangeOrders(query.data?.pages), [query.data])

	const onRefresh = useCallback(() => {
		// Una query infinita con N páginas revalidaría TODAS en cadena: se recorta antes
		queryClient.setQueryData([...EXCHANGE_ORDERS_KEY, 'all'], trimToFirstPage)
		query.refetch()
	}, [queryClient, query])

	const onEnd = useCallback(() => { if (query.hasNextPage && !query.isFetchingNextPage) { query.fetchNextPage() } }, [query])

	const assetFor = useCallback((id: string): AssetView | undefined => all.find(a => a.id === id), [all])

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={orders}
				keyExtractor={order => order.uuid}
				renderItem={({ item }) => (
					<Row
						order={item}
						from={assetFor(item.from_asset)}
						to={assetFor(item.to_asset)}
						onPress={() => navigation.navigate(ROUTES.WALLET_EXCHANGE_STATUS, { uuid: item.uuid })}
					/>
				)}
				contentContainerStyle={styles.list}
				onEndReached={onEnd}
				onEndReachedThreshold={0.4}
				refreshControl={createHiddenRefreshControl(false, onRefresh)}
				ListEmptyComponent={query.isLoading ? null : (
					<Text style={[textStyles.body, styles.empty, { color: theme.colors.tertiaryText }]}>
						{t('crypto.wallet.exchange.historyEmpty')}
					</Text>
				)}
			/>
		</View>
	)
}

/** Tono del estado: verde lo pagado, ámbar lo devuelto o atascado, primario lo que sigue vivo. */
const toneFor = (order: ExchangeOrder, theme: ReturnType<typeof useTheme>['theme']): string => {
	const phase = phaseOf(order.status)
	return phase === 'done' ? theme.colors.successText
		: phase === 'returned' || phase === 'problem' ? theme.colors.warning
			: theme.colors.primary
}

const Row = ({ order, from, to, onPress }: { order: ExchangeOrder, from?: AssetView, to?: AssetView, onPress: () => void }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const tone = toneFor(order, theme)

	return (
		<QPPressable onPress={onPress} style={[styles.row, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]} accessibilityRole="button">
			{/* Los dos activos: el de origen detrás, el de destino delante y encabalgado */}
			<View style={styles.icons}>
				<QPAssetIcon logoTick={from?.logoTick ?? ''} networkTick={from?.networkTick ?? null} size={34} />
				<View style={styles.iconOverlap}>
					<QPAssetIcon logoTick={to?.logoTick ?? ''} networkTick={to?.networkTick ?? null} size={34} ringColor={theme.colors.surface} />
				</View>
			</View>

			<View style={styles.texts}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>
					{from?.symbol ?? '—'} → {to?.symbol ?? '—'}
				</Text>
				<Text style={[textStyles.h6, { color: tone }]} numberOfLines={1}>
					{t(`crypto.wallet.exchange.status.${order.status}`)}
				</Text>
			</View>

			<View style={styles.amounts}>
				<Text style={[textStyles.h5, styles.right, { color: theme.colors.primaryText }]} numberOfLines={1}>
					−{order.amount_in} {from?.symbol ?? ''}
				</Text>
				<Text style={[textStyles.h6, styles.right, { color: theme.colors.secondaryText }]} numberOfLines={1}>
					{order.actual_out ?? order.expected_out ?? '—'} {to?.symbol ?? ''}
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
