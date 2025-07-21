import { View, Text } from 'react-native'

// Contexts
import { useTheme } from '../theme/ThemeContext'

// UI
import { createTextStyles } from '../theme/themeUtils'

// Particles
import SettingsItem from './particles/SettingsItem'

// Settings Item
const SettingsSection = ({ title, items }) => {

    // Contexts
    const { theme } = useTheme()

    // Styles
    const textStyles = createTextStyles(theme)

    return (
        <View style={{ marginTop: 10 }}>
            <Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>{title}</Text>
            {items.map((item, index) => (
                <SettingsItem
                    key={index}
                    title={item.title}
                    icon={item.icon}
                    onPress={item.onPress}
                    index={index}
                    totalItems={items.length}
                />
            ))}
        </View>
    )
}

export default SettingsSection