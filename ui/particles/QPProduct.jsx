import FastImage from "@d11/react-native-fast-image"
import { View, Text, StyleSheet, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

const QPProduct = ({ name = '', price = '', details = [], logo = '', image = '', onPress = () => { }, style = {} }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Support both 'logo' and 'image' props, logo takes precedence
	const imageSource = logo || image
	const logoImage = imageSource ? (imageSource.startsWith('http') ? imageSource : `https://media.qvapay.com/${imageSource}`) : ''

	return (
		<Pressable style={[styles.topupCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]} onPress={onPress}>

			<View style={[styles.topupImagePlaceholder, { backgroundColor: theme.colors.elevationLight, ...style.imagePlaceholder }]}>
				{logoImage ? (
					<FastImage source={{ uri: logoImage, priority: FastImage.priority.normal }} style={styles.topupImage} resizeMode={FastImage.resizeMode.cover} />
				) : null}
			</View>

			<Text style={[textStyles.h5, styles.topupPrice]}>{price != null ? `$${Number(price).toFixed(2)}` : ''}</Text>
			<Text style={[textStyles.h6, styles.topupTitle, { color: theme.colors.secondaryText }]} numberOfLines={2}>{name}</Text>
			{Array.isArray(details) && details.length > 0 && (
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, fontSize: 10 }]}>{details.join(' • ')}</Text>
			)}
		</Pressable>
	)
}

const styles = StyleSheet.create({
	topupCard: {
		width: 168,
		borderRadius: 12,
		padding: 8,
		marginRight: 12,
		borderWidth: 0.5,
	},
	topupImagePlaceholder: {
		height: 80,
		borderRadius: 8,
		marginBottom: 8,
		overflow: 'hidden',
	},
	topupImage: {
		width: '100%',
		height: '100%',
	},
	topupPrice: {
		fontWeight: '700',
		marginBottom: 2,
	},
	topupTitle: {
		marginBottom: 2,
	},
})

export default QPProduct