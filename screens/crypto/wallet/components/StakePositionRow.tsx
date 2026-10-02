import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import type { Theme } from '../../../../theme/ThemeContext'

// Wallet
import { displayAmount, formatUnits } from '../../../../wallet/chains/units'
import { timeLeft } from '../../../../wallet/staking/staking'
import type { StakePosition, StakeStatus } from '../../../../wallet/staking/types'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'

const STATUS_ICON: Record<StakeStatus, FontAwesome6SolidIconName> = {
	activating: 'hourglass-half',
	active: 'seedling',
	locked: 'lock',
	cooling: 'hourglass-end',
	withdrawable: 'circle-check',
}

const statusColor = (status: StakeStatus, theme: Theme): string =>
	status === 'withdrawable' ? theme.colors.successText
		: status === 'active' || status === 'locked' ? theme.colors.primary
			: theme.colors.warning

type Props = {
	position: StakePosition
	symbol: string
	decimals: number
	showBalance: boolean
	isLast: boolean
	/** Acción sobre la posición (retirar, salir…); sin ella la fila es solo informativa. */
	action?: { label: string, onPress: () => void } | null
}

/** Una posición de staking: estado, a quién, cuánto y cuándo cambia. */
const StakePositionRow = ({ position, symbol, decimals, showBalance, isLast, action }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const color = statusColor(position.status, theme)
	const left = timeLeft(position.unlockAt, Date.now())
	const targetName = position.target ? position.target.name ?? t('crypto.staking.unknownTarget') : null
	const sub = [
		targetName,
		left ? t('crypto.staking.unlockIn', { time: t(`crypto.staking.timeLeft.${left.unit}`, { count: left.value }) }) : null,
	].filter(Boolean).join(' · ')

	return (
		<View style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '60' }]}>
			{/* Indicador de estado, no acción: círculo */}
			<View style={[styles.icon, { backgroundColor: color + '18' }]}>
				<FontAwesome6 name={STATUS_ICON[position.status]} size={14} color={color} iconStyle="solid" />
			</View>
			<View style={styles.info}>
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }} numberOfLines={1}>
					{t(`crypto.staking.status.${position.status}`)}
				</Text>
				{!!sub && (
					<Text style={[styles.sub, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }]} numberOfLines={1}>{sub}</Text>
				)}
			</View>
			<View style={styles.amounts}>
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }} numberOfLines={1}>
					{showBalance ? `${displayAmount(formatUnits(position.amount, decimals))} ${symbol}` : `•••• ${symbol}`}
				</Text>
				{!!action && (
					<QPPressable onPress={action.onPress} style={styles.action} accessibilityRole="button">
						<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{action.label}</Text>
					</QPPressable>
				)}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
	icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	info: { flex: 1, minWidth: 0 },
	sub: { marginTop: 2 },
	amounts: { alignItems: 'flex-end', maxWidth: '50%', gap: 4 },
	action: { paddingVertical: 2 },
})

export default StakePositionRow
