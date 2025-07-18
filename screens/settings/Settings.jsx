import React, { useState } from 'react'
import { View, Text, Button, Alert } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// User Context
import { useAuth } from '../../auth/authContext'

// Settings Stack
const SettingsStack = ({ navigation }) => {

    // Contexts
    const { theme } = useTheme()
    const { user, logout } = useAuth()

    // State
    const [isLoading, setIsLoading] = useState(false)

    // Logout function
    const handleLogout = async () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true)
                        const result = await logout()
                        setIsLoading(false)
                        if (!result.success) { Alert.alert('Error', 'Failed to logout. Please try again.') }
                    }
                }
            ]
        )
    }

    return (
        <View>
            <Text>Settings Menu</Text>
            <Button title={isLoading ? "Logging out..." : "Logout"} onPress={handleLogout} disabled={isLoading} />
        </View>
    )
}

export default SettingsStack