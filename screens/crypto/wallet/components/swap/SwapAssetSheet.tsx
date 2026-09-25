import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../../theme/themeUtils'

// UI
import QPPressable from '../../../../../ui/particles/QPPressable'
import QPAssetIcon from '../../../../../ui/particles/QPAssetIcon'
import SwapSheet from './SwapSheet'

export type SwapAssetOption = { pairId: string, symbol: string, network: string, logoTick: string, networkTick: string | null, balanceLabel: string }

type Props = {
	visible: boolean
	options: SwapAssetOption[]
	selectedPairId: string | null
	onSelect: (pairId: string) => void
	onClose: () => void
}

/**
 * Selector del activo on-chain del swap: una fila por par que publica el backend (hoy solo
 * QUSD en Stacks). Cada cadena nueva aparece aquí sola en cuanto `GET /swap/pairs` la trae.
 */
const SwapAssetSheet = ({ visible, options, selectedPairId, onSelect, onClose }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<SwapSheet visible={visible} title={t('crypto.wallet.swap.pickAsset')} onClose={onClose}>
			<ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
				{options.map(option => {
					const selected = option.pairId === selectedPairId
					return (
						<QPPressable
							key={option.pairId}
							onPress={() => { onSelect(option.pairId); onClose() }}
							style={[styles.row, { backgroundColor: selected ? theme.colors.primary + '14' : theme.colors.surface }]}
							accessibilityRole="button"
							accessibilityState={{ selected }}
						>
							<QPAssetIcon logoTick={option.logoTick} networkTick={option.networkTick} size={38} />
							<View style={styles.texts}>
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{option.symbol}</Text>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{option.network}</Text>
							</View>
							<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{option.balanceLabel}</Text>
							{selected && <FontAwesome6 name="check" size={14} color={theme.colors.primary} iconStyle="solid" />}
						</QPPressable>
					)
				})}
				<Text style={[textStyles.h6, styles.soon, { color: theme.colors.tertiaryText }]}>{t('crypto.wallet.swap.moreSoon')}</Text>
			</ScrollView>
		</SwapSheet>
	)
}

const styles = StyleSheet.create({
	list: { gap: 8, paddingBottom: 8 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderCurve: 'continuous' },
	texts: { flex: 1, gap: 2 },
	soon: { textAlign: 'center', marginTop: 8 },
})

export default SwapAssetSheet
