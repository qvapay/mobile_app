import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { scaleType, useTextStyles } from '../../../theme/themeUtils'

// UI
import QPPressable from '../../../ui/particles/QPPressable'
import PixIofNotice from './PixIofNotice'

// Logic
import { formatBrl } from './pixRules'
import type { PixPayment } from './usePixPayment'

/** El verde de la marca Pix. */
export const PIX_COLOR = '#32BCAD'

type Props = {
	pix: PixPayment
	/** Saldo QvaPay del usuario, en USD. */
	balance: number
}

/**
 * Selector saldo / PIX de una compra, con los avisos que tienen que ir antes de pagar. Con
 * `offer.kind === 'hidden'` no pinta nada; sin CPF es una sola fila que lleva a verificarlo, o a
 * hacerse GOLD si todavía no puede.
 */
const PixMethodPicker = ({ pix, balance }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const { offer, selected, estimate, holdHours } = pix

	if (offer.kind === 'hidden') { return null }

	const rowStyle = (active: boolean) => [
		styles.row,
		active
			? { backgroundColor: `${theme.colors.primary}12`, borderWidth: 1, borderColor: theme.colors.primary }
			: { backgroundColor: theme.colors.surface, ...(!theme.isDark && { borderWidth: 1, borderColor: theme.colors.border }) },
	]

	if (offer.kind === 'cpf' || offer.kind === 'gold') {
		const needsGold = offer.kind === 'gold'
		return (
			<QPPressable onPress={needsGold ? pix.openGold : pix.openCpf} style={[rowStyle(false), styles.cpfRow]} accessibilityRole="button" testID={needsGold ? 'pix-method-gold' : 'pix-method-cpf'}>
				<FontAwesome6 name="pix" size={20} color={PIX_COLOR} iconStyle="brand" />
				<View style={styles.grow}>
					<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{t('store.pix.cpfPrompt.title')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>{needsGold ? t('store.pix.cpfPrompt.goldBody') : t('store.pix.cpfPrompt.body')}</Text>
				</View>
				<FontAwesome6 name="chevron-right" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
			</QPPressable>
		)
	}

	const price = formatBrl(offer.quote.totalBrl)
	const noteStyle = [textStyles.caption, { color: theme.colors.tertiaryText, lineHeight: scaleType(theme, 17) }]

	return (
		<View style={styles.container}>
			<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{t('store.pix.method.title')}</Text>

			<QPPressable onPress={() => pix.choose(false)} style={rowStyle(!selected)} accessibilityRole="radio" accessibilityState={{ selected: !selected }} testID="pix-method-balance">
				<FontAwesome6 name="wallet" size={18} color={theme.colors.primary} iconStyle="solid" />
				<Text style={[textStyles.h6, styles.grow, { color: theme.colors.primaryText, fontWeight: '500' }]}>{t('store.pix.method.balance')}</Text>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>${balance.toFixed(2)}</Text>
			</QPPressable>

			<QPPressable onPress={() => pix.choose(true)} style={rowStyle(selected)} accessibilityRole="radio" accessibilityState={{ selected }} testID="pix-method-pix">
				<FontAwesome6 name="pix" size={18} color={PIX_COLOR} iconStyle="brand" />
				<Text style={[textStyles.h6, styles.grow, { color: theme.colors.primaryText, fontWeight: '500' }]}>{t('store.pix.method.pix')}</Text>
				<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{estimate ? `≈ ${price}` : price}</Text>
			</QPPressable>

			{selected && (
				<View style={styles.notices}>
					<Text style={noteStyle}>{t('store.pix.method.priceNote')}</Text>
					{estimate && <Text style={noteStyle}>{t('store.pix.method.shippingNote')}</Text>}
					{!!holdHours && <Text style={noteStyle} testID="pix-hold-notice">{t('store.pix.method.holdNote', { hours: holdHours })}</Text>}
					<PixIofNotice />
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: { marginTop: 16, gap: 8 },
	grow: { flex: 1 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		borderRadius: 12,
	},
	cpfRow: { marginTop: 16 },
	notices: { gap: 6, marginTop: 4 },
})

export default PixMethodPicker
