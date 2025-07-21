import { View, Text, Pressable, Image, StyleSheet } from 'react-native'

// Contexts
import { useTheme } from '../../theme/ThemeContext'

// UI
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Settings Item
const SettingsItem = ({ title, icon, onPress }) => {

    // Contexts
    const { theme } = useTheme()

    // Styles
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    return (
        <Pressable style={[styles.box, { backgroundColor: theme.colors.elevation, flexDirection: 'row', alignContent: 'center', alignItems: 'center', overflow: 'hidden' }]} onPress={onPress}>
            <Image source={icon} style={{ width: 48, height: 48 }} />
            <Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>{title}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    box: {
        flexDirection: 'row',
        alignContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        padding: 10,
        borderRadius: 10,
        marginBottom: 10,
    }
})

export default SettingsItem