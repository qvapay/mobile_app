import { useMemo } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// Data: misma query de medias que usan las cards de oferta (una petición, una caché)
import { useP2pMarketAveragesQuery } from './p2pQueries'
import { mapP2pPairs } from '../crypto/cryptoQueries'
import type { P2pPair } from '../crypto/cryptoQueries'

// UI
import QPCoin from '../../ui/particles/QPCoin'
import QPPressable from '../../ui/particles/QPPressable'
import QPSkeleton from '../../ui/particles/QPSkeleton'

type Props = {
	visible: boolean
	onClose: () => void
	/** Tocar un raíl filtra la lista del P2P por esa moneda. */
	onSelectCoin: (tick: string, name: string) => void
}

/**
 * Medias de compra/venta del mercado P2P por raíl (antes una card del tab
 * Crypto). Modal centrado estándar de la app: overlay con dismiss, card con
 * scroll acotado al 75% del alto.
 */
const P2PMarketModal = ({ visible, onClose, onSelectCoin }: Props) => {

	const { t } = useTranslation()
	const { theme, styles: themeStyles } = useTheme()
	const textStyles = useTextStyles(theme)
	const { height } = useWindowDimensions()

	const averages = useP2pMarketAveragesQuery()
	const pairs = useMemo<P2pPair[]>(() => mapP2pPairs(averages.data), [averages.data])

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={themeStyles.container.modalOverlay} onPress={onClose}>
				{/* Pressable interior vacío: los toques dentro de la card no cierran */}
				<Pressable style={[themeStyles.container.modalCard, styles.card, { maxHeight: height * 0.75 }]} onPress={() => {}}>
					<View style={styles.header}>
						<View style={styles.headerTitle}>
							<FontAwesome6 name="scale-balanced" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{t('crypto.common.p2pMarket')}</Text>
						</View>
						<Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('p2p.market.modal.close')}>
							<FontAwesome6 name="xmark" size={18} color={theme.colors.secondaryText} iconStyle="solid" />
						</Pressable>
					</View>
					<Text style={[styles.subtitle, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
						{t('p2p.market.modal.subtitle')}
					</Text>

					<ScrollView bounces={false} showsVerticalScrollIndicator={false}>
						{averages.isPending && !averages.data && [0, 1, 2, 3].map(i => <QPSkeleton key={i} width="100%" height={44} borderRadius={10} style={styles.skeleton} />)}

						{!averages.isPending && pairs.length === 0 && (
							<Text style={[styles.empty, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
								{t('crypto.dashboard.empty')}
							</Text>
						)}

						{pairs.map((pair, index) => (
							<QPPressable
								key={pair.tick}
								onPress={() => onSelectCoin(pair.tick, pair.name)}
								style={[styles.row, index < pairs.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
							>
								<QPCoin coin={pair.tick} size={32} />
								<View style={styles.info}>
									<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{pair.name}</Text>
									<Text style={[{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }, styles.offers]}>
										{t('crypto.dashboard.offers', { count: pair.count })}
									</Text>
								</View>
								<View style={styles.prices}>
									<View style={styles.priceRow}>
										<Text style={[styles.priceLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('p2p.common.buy')}</Text>
										<Text style={{ color: theme.colors.successText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>{pair.buy.toFixed(2)}</Text>
									</View>
									<View style={styles.priceRow}>
										<Text style={[styles.priceLabel, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>{t('p2p.common.sell')}</Text>
										<Text style={{ color: theme.colors.danger, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>{pair.sell.toFixed(2)}</Text>
									</View>
								</View>
							</QPPressable>
						))}
					</ScrollView>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { paddingHorizontal: 18, paddingVertical: 18 },
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	subtitle: { marginTop: 4, marginBottom: 8 },
	skeleton: { marginVertical: 5 },
	empty: { textAlign: 'center', paddingVertical: 16 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
	info: { flex: 1 },
	offers: { marginTop: 1 },
	prices: { alignItems: 'flex-end', gap: 2 },
	priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
	priceLabel: {},
})

export default P2PMarketModal
