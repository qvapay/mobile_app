import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme Context
import { useTheme } from '../theme/ThemeContext'

// Particles
import QPPressable from './particles/QPPressable'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../routes'

/**
 * First-use empty state for the Home transactions section: educates the new
 * user and CTAs to the action that generates the first transaction (adding
 * balance, via `ROUTES.ADD`). Card border only shows in light mode, per the
 * house dark-surface rule.
 *
 * @param {object} props
 * @param {object} props.navigation - React Navigation object used for the CTA.
 */
const EmptyTransactions = ({ navigation }) => {

	// Context
	const { t } = useTranslation()
	const { theme } = useTheme()

	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
			<View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="receipt" size={20} color={theme.colors.primary} iconStyle="solid" />
			</View>
			<Text style={[styles.title, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.medium }]}>
				{t('ui.emptyTransactions.title')}
			</Text>
			<Text style={[styles.subtitle, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>
				{t('ui.emptyTransactions.subtitle')}
			</Text>
			<QPPressable onPress={() => navigation.navigate(ROUTES.ADD)} style={[styles.cta, { backgroundColor: theme.colors.primary }]}>
				<Text style={{ color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
					{t('ui.emptyTransactions.cta')}
				</Text>
			</QPPressable>
		</View>
	)
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		paddingVertical: 24,
		paddingHorizontal: 20,
		alignItems: 'center',
		gap: 8,
	},
	iconCircle: {
		width: 48,
		height: 48,
		borderRadius: 24,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 4,
	},
	title: {
		textAlign: 'center',
	},
	subtitle: {
		textAlign: 'center',
	},
	cta: {
		borderRadius: 16,
		borderCurve: 'continuous',
		paddingHorizontal: 18,
		paddingVertical: 8,
		marginTop: 8,
	},
})

export default EmptyTransactions
