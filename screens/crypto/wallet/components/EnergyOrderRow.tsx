import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../../../theme/ThemeContext'
import { timeAgo } from '../../../../helpers'
import { formatUsd } from '../walletFormat'
import { statusTint } from '../energyOrderTint'
import QPPressable from '../../../../ui/particles/QPPressable'

import type { EnergyOrder } from '../../../../types/domain'

type Props = { order: EnergyOrder, onPress?: (order: EnergyOrder) => void }

/** Una compra de energía en la lista: cuánta, por cuánto tiempo, en qué estado y qué costó. */
const EnergyOrderRow = ({ order, onPress }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()

	const body = (
		<View style={[styles.row, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<View style={styles.main}>
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>
					{t('crypto.energy.orders.row', { volume: order.volume.toLocaleString(), duration: t(`crypto.energy.buy.durations.${order.duration}`) })}
				</Text>
				<Text style={{ color: statusTint(order.status, theme), fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>
					{t(`crypto.energy.orders.status.${order.status}`)} · {timeAgo(order.created_at)}
				</Text>
			</View>
			<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.sm }}>
				{formatUsd(Number(order.price_usd))}
			</Text>
		</View>
	)

	return onPress ? <QPPressable onPress={() => onPress(order)} accessibilityRole="button">{body}</QPPressable> : body
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderCurve: 'continuous' },
	main: { flex: 1, gap: 3 },
})

export default EnergyOrderRow
