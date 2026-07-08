import { View, Text, StyleSheet, Pressable } from 'react-native'

import OperatorAvatar from './OperatorAvatar'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

/**
 * Store catalog tile for a brand: a colored banner with the operator logo on
 * top, brand name and a price hint below. The banner uses the brand's own
 * `bg_color` when the catalog provides one. The price label prefers a
 * "$min – $max" range, falls back to "desde $min", then to the offer count.
 * Light mode adds a hairline border; dark surfaces stay borderless (house style).
 *
 * @param {object} props
 * @param {object} props.brand - Catalog brand: brand, logo_url, bg_color, price_min/max, offer_count.
 * @param {object} [props.country] - Prepends the country's flag emoji to the price label.
 * @param {function} props.onPress - Tap handler.
 */
const BrandTile = ({ brand, country, onPress, style }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const min = brand?.price_min
	const max = brand?.price_max
	let priceLabel = null
	if (min != null && max != null && min !== max) priceLabel = `$${Number(min).toFixed(0)} – $${Number(max).toFixed(0)}`
	else if (min != null) priceLabel = `desde $${Number(min).toFixed(2)}`

	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.tile,
				{ backgroundColor: theme.colors.surface },
				theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
				style,
			]}
		>
			<View style={[styles.banner, { backgroundColor: brand?.bg_color || theme.colors.elevationLight }]}>
				<OperatorAvatar brand={brand?.brand} logoUrl={brand?.logo_url} size="lg" bgColor="transparent" />
			</View>
			<View style={styles.body}>
				<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
					{brand?.brand}
				</Text>
				<Text numberOfLines={1} style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
					{country?.flag ? `${country.flag} ` : ''}{priceLabel || `${brand?.offer_count || 0} opciones`}
				</Text>
			</View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	tile: {
		borderRadius: 14,
		overflow: 'hidden',
	},
	banner: {
		height: 84,
		alignItems: 'center',
		justifyContent: 'center',
	},
	body: {
		paddingHorizontal: 10,
		paddingVertical: 8,
		gap: 2,
	},
})

export default BrandTile
