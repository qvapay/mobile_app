import { Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'

/**
 * Selectable amount card for one top-up product: CUP amount on top, localized
 * store price (from react-native-iap) below. While the store price hasn't
 * loaded yet a small spinner takes its place.
 *
 * @param {object} props
 * @param {string} props.label - CUP amount label from TOPUP_CATALOG (e.g. '$100 CUP').
 * @param {string} [props.price] - Localized store price (e.g. 'US$0.99'); undefined while loading.
 * @param {boolean} props.selected
 * @param {boolean} [props.unavailable] - Backend reports the product as not purchasable.
 * @param {function} props.onPress
 */
const TopupCard = ({ label, price, selected, unavailable = false, onPress, theme, textStyles }) => (
	<Pressable
		onPress={onPress}
		disabled={unavailable}
		style={[
			styles.card,
			selected
				? { backgroundColor: theme.colors.primary + '12', borderWidth: 1.5, borderColor: theme.colors.primary }
				: { backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: 'transparent', ...(theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }) },
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
			<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>No disponible</Text>
		)}
	</Pressable>
)

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
