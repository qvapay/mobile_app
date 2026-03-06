import { useTheme } from '../theme/ThemeContext'
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native'

// FastImage
import FastImage from '@d11/react-native-fast-image'

const PromoBanner = ({ promo }) => {

	const { theme } = useTheme()
	if (!promo || !promo.text) return null

	const handlePress = () => { if (promo.url) { Linking.openURL(promo.url) } }

	return (
		<Pressable onPress={handlePress} style={({ pressed }) => [styles.container, { backgroundColor: theme.colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border }]}>
			{promo.logo ? (
				<FastImage source={{ uri: promo.logo }} style={styles.logo} resizeMode={FastImage.resizeMode.contain} />
			) : null}
			<View style={styles.textContainer}>
				<Text style={[styles.title, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>
					{promo.text}
				</Text>
				{promo.description ? (
					<Text style={[styles.description, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]} numberOfLines={2}>
						{promo.description}
					</Text>
				) : null}
			</View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 12,
		padding: 12,
		marginBottom: 6,
		gap: 12,
	},
	logo: {
		width: 40,
		height: 40,
		borderRadius: 8,
	},
	textContainer: {
		flex: 1,
		gap: 2,
	},
	title: {},
	description: {},
})

export default PromoBanner
