import { View, Text, Pressable } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

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