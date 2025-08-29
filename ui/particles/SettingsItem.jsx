import { Text, Pressable } from 'react-native'

// Contexts
import { useTheme } from '../../theme/ThemeContext'

// UI
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Settings Item
const SettingsItem = ({ title, icon, screen, index, totalItems, navigation, disabled }) => {

    // Contexts
    const { theme } = useTheme()

    // Styles
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Determine border radius based on position
    const isFirst = index === 0
    const isLast = index === totalItems - 1

    const containerStyle = {
        justifyContent: 'space-between',
        borderRadius: isFirst ? 10 : isLast ? 10 : 0,
        borderTopLeftRadius: isFirst ? 10 : 0,
        borderTopRightRadius: isFirst ? 10 : 0,
        borderBottomLeftRadius: isLast ? 10 : 0,
        borderBottomRightRadius: isLast ? 10 : 0,
        marginBottom: isLast ? 10 : 0,
        opacity: disabled ? 0.5 : 1,
        paddingVertical: 12
    }

    return (
        <Pressable style={[containerStyles.box, containerStyle]} onPress={() => !disabled && navigation.navigate(screen)}>
            <Text style={[textStyles.h4, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular }]}>{title}</Text>
            <FontAwesome6 name="angle-right" size={16} style={{ color: theme.colors.secondaryText }} iconStyle="solid" />
        </Pressable>
    )
}

export default SettingsItem