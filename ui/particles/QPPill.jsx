import { Pressable, Text, StyleSheet } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

const QPPill = ({ title, onPress, style }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<Pressable style={[styles.pill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]} onPress={onPress}>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs }]}>{title}</Text>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	pill: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
		borderWidth: 1,
	},
})

export default QPPill