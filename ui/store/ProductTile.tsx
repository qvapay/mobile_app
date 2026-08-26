import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FastImage from '@d11/react-native-fast-image'

import QPPressable from '../particles/QPPressable'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import { mediaUrl } from '../../helpers/mediaUrl'
import { formatPriceRange } from '../../screens/store/market/marketConstants'

import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import type { Theme } from '../../theme/ThemeContext'

/** Marketplace catalog product row (only the fields this tile reads). */
export type MarketProduct = {
	uuid?: string
	title?: string | null
	main_image?: string | null
	price?: number | string | null
	price_min?: number | string | null
	price_max?: number | string | null
	variant_count?: number | null
	track_inventory?: boolean | number | null
	stock?: number | null
	featured?: boolean | number | null
}

type Props = {
	/** Catalog row: uuid, title, main_image, price, price_min, price_max, variant_count, track_inventory, stock, featured. */
	product: MarketProduct
	/** Tap handler. */
	onPress: () => void
	/** Extra tile styles. */
	style?: StyleProp<ViewStyle>
}

/**
 * Marketplace product tile for grids and shelves: square image, two-line
 * title and the effective price ("$10.00" or "$10.00 – $15.00" with
 * variants). Sold-out products (tracked stock at 0 with no variants) show an
 * "Agotado" veil. Light mode adds a hairline border; dark stays borderless.
 */
const ProductTile = ({ product, onPress, style }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	// themeUtils.js aún es JS (@returns {Object}): cast estructural hasta que se tipe
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>

	const image = mediaUrl(product?.main_image)
	const soldOut = !!product?.track_inventory && (product?.variant_count || 0) === 0 && (product?.stock ?? 0) <= 0
	const hasRange = (product?.variant_count || 0) > 0 && product?.price_min !== product?.price_max
	const priceLabel = hasRange
		? formatPriceRange(product.price_min as number | null, product.price_max as number | null)
		: formatPriceRange((product?.price_min ?? product?.price) as number | null)

	return (
		<QPPressable
			onPress={onPress}
			style={[
				styles.tile,
				{ backgroundColor: theme.colors.surface },
				(theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 0.5, borderColor: theme.colors.border },
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
						<Text style={[textStyles.caption, { color: '#FFF', fontWeight: '600' }]}>{t('ui.productTile.soldOut')}</Text>
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
