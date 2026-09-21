import { useCallback, useMemo, useState } from 'react'
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { FlashList } from '@shopify/flash-list'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// Datos
import { useQueryClient } from '@tanstack/react-query'
import { ENERGY_ORDERS_KEY, flattenOrders, trimToFirstPage, useEnergyOrdersQuery } from './energyQueries'
import { formatUsd } from './walletFormat'

// UI
import QPButton from '../../../ui/particles/QPButton'
import { createHiddenRefreshControl } from '../../../ui/QPRefreshIndicator'
import EnergyOrderRow, { statusTint } from './components/EnergyOrderRow'

import type { EnergyOrder } from '../../../types/domain'

/**
 * Historial de compras de energía. Es la red de seguridad del módulo: aquí
 * aparece siempre lo que se cobró, incluida la orden que se quedó en curso
 * cuando el usuario cerró la app en mitad de la entrega.
 */
const WalletEnergyOrders = () => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()

	const query = useEnergyOrdersQuery()
	const orders = useMemo(() => flattenOrders(query.data?.pages), [query.data])
	const [detail, setDetail] = useState<EnergyOrder | null>(null)

	const onRefresh = useCallback(() => {
		// Una query infinita con N páginas revalidaría TODAS en cadena: se recorta antes
		queryClient.setQueryData([...ENERGY_ORDERS_KEY, 'all'], trimToFirstPage)
		query.refetch()
	}, [queryClient, query])

	const onEnd = useCallback(() => { if (query.hasNextPage && !query.isFetchingNextPage) { query.fetchNextPage() } }, [query])

	return (
		<View style={containerStyles.subContainer}>
			<FlashList
				data={orders}
				keyExtractor={order => order.uuid}
				renderItem={({ item }) => <EnergyOrderRow order={item} onPress={setDetail} />}
				ItemSeparatorComponent={Separator}
				contentContainerStyle={styles.list}
				onEndReached={onEnd}
				onEndReachedThreshold={0.4}
				refreshControl={createHiddenRefreshControl(false, onRefresh)}
				ListEmptyComponent={query.isLoading ? null : (
					<Text style={[textStyles.body, styles.empty, { color: theme.colors.tertiaryText }]}>{t('crypto.energy.orders.empty')}</Text>
				)}
			/>

			<Modal visible={!!detail} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDetail(null)}>
				<Pressable style={themeStyles.container.modalOverlay} onPress={() => setDetail(null)}>
					<Pressable style={themeStyles.container.modalCard} onPress={() => { }}>
						{!!detail && (
							<>
								<Text style={[textStyles.h4, styles.title]}>
									{t('crypto.energy.orders.row', { volume: detail.volume.toLocaleString(), duration: t(`crypto.energy.buy.durations.${detail.duration}`) })}
								</Text>
								<Text style={[textStyles.body, styles.status, { color: statusTint(detail.status, theme) }]}>
									{t(`crypto.energy.orders.status.${detail.status}`)}
								</Text>
								<View style={styles.rows}>
									<Row theme={theme} label={t('crypto.energy.orders.target')} value={detail.target_address} />
									<Row theme={theme} label={t('crypto.energy.orders.price')} value={formatUsd(Number(detail.price_usd))} />
									<Row theme={theme} label={t('crypto.energy.orders.date')} value={new Date(detail.created_at).toLocaleString()} />
									{!!detail.reason && <Row theme={theme} label={t('crypto.energy.orders.reason')} value={detail.reason} last />}
								</View>
								{!!detail.explorer && (
									<QPButton title={t('crypto.energy.orders.explorer')} onPress={() => Linking.openURL(detail.explorer!)} outlined style={styles.action} />
								)}
								<QPButton title={t('crypto.energy.confirm.close')} onPress={() => setDetail(null)} style={styles.action} />
							</>
						)}
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	)
}

const Separator = () => <View style={styles.separator} />

const Row = ({ theme, label, value, last }: { theme: Theme, label: string, value: string, last?: boolean }) => (
	<View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>{label}</Text>
		<Text selectable style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs, flex: 1, textAlign: 'right' }}>{value}</Text>
	</View>
)

const styles = StyleSheet.create({
	list: { paddingTop: 8, paddingBottom: 32 },
	separator: { height: 8 },
	empty: { textAlign: 'center', marginTop: 40 },
	title: { textAlign: 'center' },
	status: { textAlign: 'center', marginTop: 4 },
	rows: { marginTop: 16 },
	row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 11 },
	action: { marginTop: 10 },
})

export default WalletEnergyOrders
