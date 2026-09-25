import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../../ui/particles/QPAssetIcon'
import AmountFlow from './AmountFlow'

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
 * valor, no el precio (es dato público). Cantidad y USD ruedan (AmountFlow)
 * y la fila anima su posición: al refrescar, un activo que sube de valor se
 * desliza a su sitio en vez de saltar (la lista se ordena por USD).
 */
const WalletAssetRow = ({ asset, prices, showBalance, isLast, onPress }: Props) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const price = assetPrice(asset, prices)

	return (
		<Animated.View layout={LinearTransition.duration(350)}>
		<QPPressable
			onPress={() => onPress(asset)}
			style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}
			accessibilityRole="button"
			accessibilityLabel={`${asset.symbol} ${asset.chainName}`}
		>
			<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} />

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
				{showBalance
					? <AmountFlow amount={asset.amount} style={[textStyles.h4, { color: theme.colors.primaryText }]} />
					: <Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>••••</Text>}
				{showBalance && asset.usd !== null
					? <AmountFlow amount={String(asset.usd)} prefix="$" fractionDigits={2} style={[styles.sub, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]} />
					: <Text style={[styles.sub, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{showBalance ? '—' : '••••'}</Text>}
			</View>
		</QPPressable>
		</Animated.View>
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
