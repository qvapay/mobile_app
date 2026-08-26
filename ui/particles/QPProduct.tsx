import FastImage from "@d11/react-native-fast-image"
import type { ImageStyle } from "@d11/react-native-fast-image"
import { View, Text, StyleSheet } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'

// Press animation wrapper
import QPPressable from './QPPressable'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Auth
import { useAuth } from '../../auth/AuthContext'

// CDN helper
import { mediaUrl } from '../../helpers/mediaUrl'

/**
 * Store catalog product card (gift cards, top-ups): a 168px tile with banner
 * artwork, name, price and detail bullets, wrapped in QPPressable. Gold members
 * (`user.golden_check`) with a distinct `goldPrice` see the regular price struck
 * through and the gold price highlighted in the theme's gold. Artwork accepts
 * either `logo` or `image` (logo wins) and resolves through the mediaUrl CDN helper.
 *
 * @param props
 * @param props.name - Product name (2-line clamp).
 * @param props.price - Regular price in USD.
 * @param props.goldPrice - Gold-tier price; shown only when set and different.
 * @param props.details - Extra info bullets, joined with " • ".
 * @param props.onPress - Tap handler.
 */
type Props = {
	name?: string
	price?: number | string
	goldPrice?: number | null
	details?: string[]
	logo?: string
	image?: string
	onPress?: () => void
	style?: StyleProp<ViewStyle>
}

const QPProduct = ({ name = '', price = '', goldPrice = null, details = [], logo = '', image = '', onPress = () => { }, style = {} }: Props) => {

	// Contexts
	const { theme, styles: themeStyles } = useTheme()
	// themeUtils.js declara `@returns {Object}`: sin claves hasta que se migre a TS
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>
	const { user } = useAuth()

	const isGold = user?.golden_check
	const hasGoldPrice = isGold && goldPrice && goldPrice > 0 && goldPrice !== price

	// Support both 'logo' and 'image' props, logo takes precedence
	const imageSource = logo || image
	const logoImage = mediaUrl(imageSource) || ''

	return (
		<QPPressable style={[styles.topupCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]} onPress={onPress}>

			<View style={[styles.topupImagePlaceholder, { backgroundColor: theme.colors.elevationLight }]}>
				{logoImage ? (
					<FastImage source={{ uri: logoImage, priority: FastImage.priority.normal, cache: FastImage.cacheControl.immutable }} style={(themeStyles.container as Record<string, ImageStyle>).fill} resizeMode={FastImage.resizeMode.cover} />
				) : null}
			</View>

			<View style={styles.topupContent}>
				<View style={styles.infoRow}>
					<Text style={[textStyles.h6, styles.topupTitle, { color: theme.colors.secondaryText, flex: 1, marginRight: 6 }]} numberOfLines={2}>{name}</Text>
					{price != null && (
						hasGoldPrice ? (
							<View style={styles.priceColumn}>
								<Text style={[textStyles.caption, styles.strikePrice, { color: theme.colors.tertiaryText }]}>${Number(price).toFixed(2)}</Text>
								<Text style={[textStyles.h5, styles.goldPrice, { color: theme.colors.gold }]}>${Number(goldPrice).toFixed(2)}</Text>
							</View>
						) : (
							<Text style={[textStyles.h5, styles.topupPrice]}>{`$${Number(price).toFixed(2)}`}</Text>
						)
					)}
				</View>
				{Array.isArray(details) && details.length > 0 && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs }]}>{details.join(' • ')}</Text>
				)}
			</View>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	topupCard: {
		width: 168,
		borderRadius: 12,
		marginRight: 12,
		borderWidth: 0.5,
		overflow: 'hidden',
	},
	topupImagePlaceholder: {
		height: 80,
	},
	topupContent: {
		padding: 8,
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
	},
	topupPrice: {
		fontWeight: '600',
	},
	priceColumn: {
		alignItems: 'flex-end',
	},
	strikePrice: {
		textDecorationLine: 'line-through',
	},
	goldPrice: {
		fontWeight: '600',
	},
	topupTitle: {
		marginBottom: 2,
	},
})

export default QPProduct
