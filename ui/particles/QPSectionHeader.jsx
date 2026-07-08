import { View, Text, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

/**
 * Section header row: muted title on the left, optional action link on the right
 * ("Ver más" pattern — subtitle text plus a small icon, both in the primary color).
 * The action Pressable always renders; it only becomes meaningful when `subtitle`
 * and `onPress` are provided.
 *
 * @param {object} props
 * @param {string} props.title - Section title.
 * @param {string} [props.subtitle] - Action label shown next to the icon.
 * @param {string} [props.iconName='arrow-right'] - FontAwesome6 icon for the action.
 * @param {function} [props.onPress] - Action tap handler.
 */
const QPSectionHeader = ({ title, subtitle, iconName = 'arrow-right', onPress }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
			<Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>{title}</Text>
			<Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} onPress={onPress}>
				<Text style={[textStyles.h6, { color: theme.colors.primary }]}>{subtitle}</Text>
				<FontAwesome6 name={iconName} size={10} color={theme.colors.primary} iconStyle="solid" />
			</Pressable>
		</View>
	)
}

export default QPSectionHeader