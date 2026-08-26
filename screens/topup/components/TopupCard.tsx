import { Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'

import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'

type TopupCardProps = {
	/** CUP amount label from TOPUP_CATALOG (e.g. '$100 CUP'). */
	label: string
	/** Localized store price (e.g. 'US$0.99'); undefined while loading. */
	price?: string
	selected: boolean
	/** Backend reports the product as not purchasable. */
	unavailable?: boolean
	onPress: () => void
	theme: Theme
	textStyles: TextStyles
}

/**
 * Selectable amount card for one top-up product: CUP amount on top, localized
 * store price (from react-native-iap) below. While the store price hasn't
 * loaded yet a small spinner takes its place.
 */
const TopupCard = ({ label, price, selected, unavailable = false, onPress, theme, textStyles }: TopupCardProps) => {
	const { t } = useTranslation()
	return (
	<Pressable
		onPress={onPress}
		disabled={unavailable}
		style={[
			styles.card,
			selected
				? { backgroundColor: theme.colors.primary + '12', borderWidth: 1.5, borderColor: theme.colors.primary }
				// OJO (pre-existente, NO tocado): el theme expone `isDark`, no `mode`,
				// así que este spread condicional nunca se aplica. Cast local
				: { backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: 'transparent', ...((theme as Theme & { mode?: 'light' | 'dark' }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }) },
			unavailable && { opacity: 0.4 },
		]}
	>
		<Text style={[textStyles.h4, { color: selected ? theme.colors.primary : theme.colors.primaryText, fontWeight: '600' }]}>
			{label}
		</Text>
		{price ? (
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>{price}</Text>
		) : (
			<ActivityIndicator size="small" color={theme.colors.tertiaryText} style={{ marginTop: 4 }} />
		)}
		{unavailable && (
			<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>{t('topup.card.unavailable')}</Text>
		)}
	</Pressable>
	)
}

const styles = StyleSheet.create({
	card: {
		flexBasis: '47%',
		flexGrow: 1,
		alignItems: 'center',
		paddingVertical: 18,
		paddingHorizontal: 12,
		borderRadius: 14,
	},
})

export default TopupCard
