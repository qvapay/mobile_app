import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// UI
import QPPressable from '../../ui/particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

type Props = { onPress: () => void }

/**
 * Tarjeta «Verifica tu SSN para depositar con tarjeta o PayPal»: sale en Depositar
 * cuando la cuenta no tiene esos rieles pero su ficha dice persona de EE. UU. y la
 * verificación está a su alcance (`ssnCtaVisible`). Lleva a Ajustes → Datos personales,
 * donde vive la ficha CIP y el bloque de verificación.
 */
const SsnTierCta = ({ onPress }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	return (
		<QPPressable onPress={onPress} style={[containerStyles.card, styles.card]} accessibilityRole="button" testID="ssn-tier-cta">
			<View style={[styles.icon, { backgroundColor: theme.colors.primary + '1F' }]}>
				<FontAwesome6 name="id-card-clip" size={18} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<View style={styles.texts}>
				<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginBottom: 2 }]}>{t('add.index.ssnTier.cta.title')}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('add.index.ssnTier.cta.body')}</Text>
			</View>
			<FontAwesome6 name="chevron-right" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
	icon: { width: 38, height: 38, borderRadius: 11, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
	texts: { flex: 1 },
})

export default SsnTierCta
