import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const HomeServiceCard = ({ icon, title, iconColor, onPress, theme }) => (
	<Pressable
		onPress={onPress}
		style={({ pressed }) => [
			styles.card,
			{
				backgroundColor: theme.colors.surface,
				transform: [{ scale: pressed ? 0.97 : 1 }],
			},
			theme.mode === 'light' && styles.cardLight,
			theme.mode === 'light' && { borderColor: theme.colors.border },
		]}
	>
		<View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
			<FontAwesome6 name={icon} size={22} color={iconColor} iconStyle="solid" />
		</View>
		<Text
			style={[
				styles.title,
				{
					color: theme.colors.primaryText,
					fontSize: theme.typography.fontSize.sm,
					fontFamily: theme.typography.fontFamily.medium,
				},
			]}
		>
			{title}
		</Text>
	</Pressable>
)

const styles = StyleSheet.create({
	card: {
		flexBasis: Platform.isPad ? '22%' : '46%',
		flexGrow: 1,
		borderRadius: 12,
		padding: 14,
		alignItems: 'center',
		gap: 10,
	},
	cardLight: {
		borderWidth: 1,
	},
	iconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		justifyContent: 'center',
		alignItems: 'center',
	},
	title: {},
})

export default HomeServiceCard

