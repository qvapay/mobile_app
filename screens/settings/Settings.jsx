import React from 'react'
import { View, Text } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// User Context
import { useAuth } from '../../auth/authContext'

// Settings Stack
const SettingsStack = () => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()

    return (
        <View>
            <Text>Settings Menu1</Text>
        </View>
    )
}

export default SettingsStack