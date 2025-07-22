import { Text, Pressable, StyleSheet } from 'react-native'

// Contexts
import { useTheme } from '../../theme/ThemeContext'

// UI
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Settings Item
const SettingsItem = ({ title, icon, screen, index, totalItems, navigation }) => {

    // Contexts
    const { theme } = useTheme()

    // Styles
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Determine border radius based on position
    const isFirst = index === 0
    const isLast = index === totalItems - 1
    const isMiddle = !isFirst && !isLast

    const containerStyle = {
        justifyContent: 'space-between',
        borderRadius: isFirst ? 10 : isLast ? 10 : 0,
        borderTopLeftRadius: isFirst ? 10 : 0,
        borderTopRightRadius: isFirst ? 10 : 0,
        borderBottomLeftRadius: isLast ? 10 : 0,
        borderBottomRightRadius: isLast ? 10 : 0,
        marginBottom: isLast ? 10 : 0,
    }

    return (
        <Pressable style={[containerStyles.box, containerStyle]} onPress={() => navigation.navigate(screen)}>
            <Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{title}</Text>
            <FontAwesome6 name="angle-right" size={16} style={{ color: theme.colors.secondaryText }} iconStyle="solid" />
        </Pressable>
    )
}

const styles = StyleSheet.create({
})

export default SettingsItem