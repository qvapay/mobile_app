import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'
import AssetIcon from './AssetIcon'

// Wallet
import { assetPrice } from '../../../../wallet/assets'
import type { AssetView, PriceMap } from '../../../../wallet/assets'
import { formatUsd } from '../walletFormat'

type Props = {
	asset: AssetView
	prices: PriceMap
	showBalance: boolean
	isLast: boolean
	onPress: (asset: AssetView) => void
}

/**
 * Fila de activo: logo+red · símbolo + red y precio · cantidad + valor USD.
 * Con saldo oculto (ajuste `privacy.showBalance`) se enmascaran cantidad y
 * valor, no el precio (es dato público).
 */
const WalletAssetRow = ({ asset, prices, showBalance, isLast, onPress }: Props) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const price = assetPrice(asset, prices)

	return (
		<QPPressable
			onPress={() => onPress(asset)}
			style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
			accessibilityRole="button"
			accessibilityLabel={`${asset.symbol} ${asset.chainName}`}
		>
			<AssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} />

			<View style={styles.info}>
				<View style={styles.titleRow}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{asset.symbol}</Text>
					<View style={[styles.networkPill, { backgroundColor: theme.colors.elevation }]}>
						<Text style={[styles.networkText, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }]} numberOfLines={1}>
							{asset.chainName}
						</Text>
					</View>
				</View>
				<Text style={[styles.sub, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]} numberOfLines={1}>
					{price === null ? '—' : formatUsd(price, { compactSmall: true })}
				</Text>
			</View>

			<View style={styles.amounts}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>
					{showBalance ? asset.amountLabel : '••••'}
				</Text>
				<Text style={[styles.sub, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]} numberOfLines={1}>
					{showBalance ? (asset.usd === null ? '—' : formatUsd(asset.usd)) : '••••'}
				</Text>
			</View>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	info: { flex: 1, minWidth: 0 },
	titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	networkPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexShrink: 1 },
	networkText: {},
	sub: { marginTop: 2 },
	amounts: { alignItems: 'flex-end', maxWidth: '45%' },
})

export default memo(WalletAssetRow)
