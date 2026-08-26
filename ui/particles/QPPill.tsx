import { Pressable, Text, StyleSheet } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

type QPPillProps = {
	title: string
	onPress?: () => void
	style?: StyleProp<ViewStyle>
}

/**
 * Small rounded tag chip: surface background, hairline border, xs caption text.
 * Read-mostly — there is no selected state and `onPress` is optional; for
 * selectable filter chips see CategoryPill in `ui/store/`.
 *
 * @param props
 * @param props.title - Pill label.
 * @param [props.onPress] - Optional tap handler.
 */
const QPPill = ({ title, onPress, style }: QPPillProps) => {

	// Contexts
	const { theme } = useTheme()
	// themeUtils.js (JS) declara `@returns {Object}`: cast local hasta que se tipe
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>

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