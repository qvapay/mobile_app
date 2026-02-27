import FastImage from "@d11/react-native-fast-image"
import { View, Text, StyleSheet, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Auth
import { useAuth } from '../../auth/AuthContext'

const QPProduct = ({ name = '', price = '', goldPrice = null, details = [], logo = '', image = '', onPress = () => { }, style = {} }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const { user } = useAuth()

	const isGold = user?.golden_check
	const hasGoldPrice = isGold && goldPrice && goldPrice > 0 && goldPrice !== price

	// Support both 'logo' and 'image' props, logo takes precedence
	const imageSource = logo || image
	const logoImage = imageSource ? (imageSource.startsWith('http') ? imageSource : `https://media.qvapay.com/${imageSource}`) : ''

	return (
		<Pressable style={[styles.topupCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]} onPress={onPress}>

			<View style={[styles.topupImagePlaceholder, { backgroundColor: theme.colors.elevationLight }]}>
				{logoImage ? (
					<FastImage source={{ uri: logoImage, priority: FastImage.priority.normal }} style={styles.topupImage} resizeMode={FastImage.resizeMode.cover} />
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
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, fontSize: 10 }]}>{details.join(' • ')}</Text>
				)}
			</View>
		</Pressable>
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
	topupImage: {
		width: '100%',
		height: '100%',
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
	},
	topupPrice: {
		fontWeight: '700',
	},
	priceColumn: {
		alignItems: 'flex-end',
	},
	strikePrice: {
		textDecorationLine: 'line-through',
		fontSize: 11,
	},
	goldPrice: {
		fontWeight: '700',
	},
	topupTitle: {
		marginBottom: 2,
	},
})

export default QPProduct
