import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Helpers
import { cardDepositPreview } from '../../helpers/cardFeeMode'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Selector del modo de fee para depósitos con tarjeta (paridad con el wizard
 * web de /topup): dos radio-cards — "Fee aparte" (se suma al cobro, default) y
 * "Fee incluido" (se descuenta de lo acreditado). El subtítulo es un preview
 * en vivo con el monto tecleado (fórmulas espejo del backend en
 * helpers/cardFeeMode); sin monto, muestra el porcentaje.
 *
 * Solo se pinta cuando el método elegido es CARD y el fee aplicable es > 0
 * (esa condición vive en Add.jsx).
 */
const CardFeeModeSelector = ({ feeRate, amount, value, onChange }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const options = [
		{
			mode: 'on_top',
			title: t('add.feeMode.onTopTitle'),
			subtitle: (p) => p
				? t('add.feeMode.preview', { pays: p.pays.toFixed(2), credited: p.credited.toFixed(2) })
				: t('add.feeMode.onTopHint', { rate: feeRate }),
		},
		{
			mode: 'included',
			title: t('add.feeMode.includedTitle'),
			subtitle: (p) => p
				? t('add.feeMode.preview', { pays: p.pays.toFixed(2), credited: p.credited.toFixed(2) })
				: t('add.feeMode.includedHint', { rate: feeRate }),
		},
	]

	return (
		<View style={styles.container}>
			<Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 12 }]}>
				{t('add.feeMode.title')}
			</Text>

			{options.map(({ mode, title, subtitle }) => {
				const selected = value === mode
				const preview = cardDepositPreview(amount, feeRate, mode)
				return (
					<Pressable
						key={mode}
						onPress={() => onChange(mode)}
						style={[styles.option, { backgroundColor: theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.elevation }]}
					>
						<FontAwesome6
							name={selected ? 'circle-dot' : 'circle'}
							size={18}
							color={selected ? theme.colors.primary : theme.colors.secondaryText}
							iconStyle={selected ? 'solid' : 'regular'}
						/>
						<View style={styles.optionText}>
							<Text style={[textStyles.subtitle, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]}>
								{title}
							</Text>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
								{subtitle(preview)}
							</Text>
						</View>
					</Pressable>
				)
			})}
		</View>
	)
}

const styles = StyleSheet.create({
	container: { marginBottom: 20 },
	option: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 16,
		borderCurve: 'continuous',
		borderWidth: 1,
		marginBottom: 10,
	},
	optionText: { flex: 1, marginLeft: 12 },
})

export default CardFeeModeSelector
