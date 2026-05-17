import { Pressable, Text, StyleSheet } from 'react-native'

import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

const CategoryPill = ({ active, onPress, emoji, label, count }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.pill,
				active
					? { backgroundColor: theme.colors.primary, borderWidth: 1, borderColor: theme.colors.primary }
					: theme.mode === 'light'
						? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border }
						: { backgroundColor: theme.colors.surface },
			]}
		>
			{!!emoji && <Text style={{ marginRight: 4 }}>{emoji}</Text>}
			<Text
				style={[
					textStyles.caption,
					{
						color: active ? theme.colors.almostWhite : theme.colors.primaryText,
						fontWeight: '600',
					},
				]}
			>
				{label}
			</Text>
			{count != null && (
				<Text
					style={[
						textStyles.caption,
						{ marginLeft: 6, color: active ? theme.colors.almostWhite + 'CC' : theme.colors.tertiaryText },
					]}
				>
					{count}
				</Text>
			)}
		</Pressable>
	)
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 999,
		marginRight: 8,
	},
})

export default CategoryPill
