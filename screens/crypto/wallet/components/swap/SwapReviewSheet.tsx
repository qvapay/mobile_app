import { ScrollView, StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../../theme/themeUtils'

// UI
import QPButton from '../../../../../ui/particles/QPButton'
import QPFitText from '../../../../../ui/particles/QPFitText'
import SwapDetails from './SwapDetails'
import type { SwapDetailRow } from './SwapDetails'
import SwapSheet from './SwapSheet'
import QPAssetBadge from '../../../../../ui/particles/QPAssetBadge'
import type { QPAssetIconKind } from '../../../../../ui/particles/QPAssetBadge'

export type SwapReviewSide = { amount: string, symbol: string, caption: string, icon: QPAssetIconKind }

type Props = {
	visible: boolean
	title: string
	from: SwapReviewSide
	to: SwapReviewSide
	rate: string
	badge?: string
	rows: SwapDetailRow[]
	notice: string
	confirmLabel: string
	onConfirm: () => void
	confirmDisabled?: boolean
	busy?: boolean
	onClose: () => void
	/** Paso extra dentro de la hoja (PIN/OTP del sentido saldo → wallet). */
	children?: React.ReactNode
}

/**
 * Revisión antes de firmar (el "Review swap" de Uniswap / "Preview conversion" de Binance):
 * qué sale, qué llega, todos los detalles abiertos y un único botón de confirmar. Mientras
 * firma o envía no se puede cerrar.
 */
const SwapReviewSheet = ({ visible, title, from, to, rate, badge, rows, notice, confirmLabel, onConfirm, confirmDisabled, busy, onClose, children }: Props) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const side = (value: SwapReviewSide) => (
		<View style={styles.side}>
			<View style={styles.sideTexts}>
				<QPFitText style={[textStyles.amount, styles.sideAmount, { color: theme.colors.primaryText }]}>{`${value.amount} ${value.symbol}`}</QPFitText>
				<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{value.caption}</Text>
			</View>
			<QPAssetBadge icon={value.icon} size={40} ringColor={theme.colors.background} />
		</View>
	)

	return (
		<SwapSheet visible={visible} title={title} onClose={onClose} dismissable={!busy}>
			<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
				{side(from)}
				<View style={[styles.arrow, { backgroundColor: theme.colors.surface }]}>
					<FontAwesome6 name="arrow-down" size={13} color={theme.colors.secondaryText} iconStyle="solid" />
				</View>
				{side(to)}

				<View style={[styles.divider, { backgroundColor: theme.colors.border + '60' }]} />
				<SwapDetails rate={rate} badge={badge} rows={rows} collapsible={false} />

				<View style={[styles.notice, { backgroundColor: theme.colors.primary + '12' }]}>
					<FontAwesome6 name="shield-halved" size={13} color={theme.colors.primary} iconStyle="solid" style={styles.noticeIcon} />
					<Text style={[styles.noticeText, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>{notice}</Text>
				</View>

				{children}

				<View style={styles.actions}>
					<QPButton title={confirmLabel} onPress={onConfirm} disabled={confirmDisabled || busy} loading={busy} />
				</View>
			</ScrollView>
		</SwapSheet>
	)
}

const styles = StyleSheet.create({
	content: { gap: 10, paddingBottom: 4 },
	side: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	sideTexts: { flex: 1, gap: 2 },
	sideAmount: { fontSize: 28 },
	arrow: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
	divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
	notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	noticeIcon: { marginTop: 2 },
	noticeText: { flex: 1 },
	actions: { marginTop: 6 },
})

export default SwapReviewSheet
