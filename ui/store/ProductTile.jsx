import { View, Text, StyleSheet } from 'react-native'
import FastImage from '@d11/react-native-fast-image'

import QPPressable from '../particles/QPPressable'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import { mediaUrl } from '../../helpers/mediaUrl'
import { formatPriceRange } from '../../screens/store/market/marketConstants'

/**
 * Marketplace product tile for grids and shelves: square image, two-line
 * title and the effective price ("$10.00" or "$10.00 – $15.00" with
 * variants). Sold-out products (tracked stock at 0 with no variants) show an
 * "Agotado" veil. Light mode adds a hairline border; dark stays borderless.
 *
 * @param {object} props
 * @param {object} props.product - Catalog row: uuid, title, main_image, price, price_min, price_max, variant_count, track_inventory, stock, featured.
 * @param {function} props.onPress - Tap handler.
 * @param {object|Array} [props.style] - Extra tile styles.
 */
const ProductTile = ({ product, onPress, style }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const image = mediaUrl(product?.main_image)
	const soldOut = !!product?.track_inventory && (product?.variant_count || 0) === 0 && (product?.stock ?? 0) <= 0
	const hasRange = (product?.variant_count || 0) > 0 && product?.price_min !== product?.price_max
	const priceLabel = hasRange
		? formatPriceRange(product.price_min, product.price_max)
		: formatPriceRange(product?.price_min ?? product?.price)

	return (
		<QPPressable
			onPress={onPress}
			style={[
				styles.tile,
				{ backgroundColor: theme.colors.surface },
				theme.mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
				style,
			]}
		>
			<View style={[styles.imageWrap, { backgroundColor: theme.colors.elevationLight }]}>
				{image && (
					<FastImage
						source={{ uri: image, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }}
						style={StyleSheet.absoluteFill}
						resizeMode={FastImage.resizeMode.cover}
					/>
				)}
				{soldOut && (
					<View style={styles.soldOutVeil}>
						<Text style={[textStyles.caption, { color: '#FFF', fontWeight: '600' }]}>Agotado</Text>
					</View>
				)}
			</View>
			<View style={styles.body}>
				<Text numberOfLines={2} style={[textStyles.caption, { color: theme.colors.primaryText, fontWeight: '500' }]}>
					{product?.title}
				</Text>
				<Text numberOfLines={1} style={[textStyles.h6, { color: theme.colors.primary, fontWeight: '600' }]}>
					{priceLabel}
				</Text>
			</View>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	tile: {
		borderRadius: 14,
		overflow: 'hidden',
	},
	imageWrap: {
		aspectRatio: 1,
	},
	soldOutVeil: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.55)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	body: {
		paddingHorizontal: 10,
		paddingVertical: 8,
		gap: 4,
	},
})

export default ProductTile
