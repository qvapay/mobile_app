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

			<View style={styles.topupHeaderRow}>
				<Text style={[textStyles.h6, styles.topupTitle]} numberOfLines={2}>{name}</Text>
				<Text style={[textStyles.h5, styles.topupPrice]}>{price != null ? `$${Number(price).toFixed(2)}` : ''}</Text>
			</View>

			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: 10 }]}>{Array.isArray(details) ? details.join(' • ') : ''}</Text>
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
	topupTitle: {
		flex: 1,
		marginRight: 8,
	},
	topupImagePlaceholder: {
		height: 80,
		borderRadius: 8,
		marginBottom: 10,
		overflow: 'hidden',
	},
	topupImage: {
		width: '100%',
		height: '100%',
	},
	topupHeaderRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 4,
	},
	topupPrice: {
		textAlign: 'right',
	},
})

export default QPProduct