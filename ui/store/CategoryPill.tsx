import { Pressable, Text, StyleSheet } from 'react-native'
import type { TextStyle } from 'react-native'

import { useTheme } from '../../theme/ThemeContext'
import type { Theme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

type Props = {
	/** Selected state. */
	active: boolean
	/** Tap handler. */
	onPress: () => void
	/** Emoji rendered before the label. */
	emoji?: string | null
	/** Chip text. */
	label: string
	/** Item count rendered after the label. */
	count?: number | null
}

/**
 * Selectable filter chip for store category rows, following the house chip
 * pattern: selected = primary background + white text; unselected = transparent
 * with a border in light mode, or a borderless surface in dark mode (dark
 * surfaces never show borders). Optional emoji prefix and count suffix.
 */
const CategoryPill = ({ active, onPress, emoji, label, count }: Props) => {

	const { theme } = useTheme()
	// themeUtils.js aún es JS (@returns {Object}): cast estructural hasta que se tipe
	const textStyles = createTextStyles(theme) as Record<string, TextStyle>

	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.pill,
				active
					? { backgroundColor: theme.colors.primary, borderWidth: 1, borderColor: theme.colors.primary }
					: (theme as Theme & { mode?: string }).mode === 'light'
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
