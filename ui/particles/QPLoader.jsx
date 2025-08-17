import { View, ActivityIndicator } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

export default function QPLoader() {

    // Theme
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
    )
}