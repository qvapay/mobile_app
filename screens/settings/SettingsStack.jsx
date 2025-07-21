import React from 'react'

// Navigation Components
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// User Context
import { useAuth } from '../../auth/AuthContext'

// Routes
import { ROUTES } from '../../routes'

// Settings Menu
import SettingsMenu from './SettingsMenu'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Settings Stack
const SettingsStack = ({ navigation }) => {

    // Contexts
    const { theme } = useTheme()

    return (
        <Stack.Navigator
            initialRouteName={ROUTES.SETTINGS_MENU}
            screenOptions={{
                headerShown: false,
                headerStyle: {
                    backgroundColor: theme.colors.background,
                },
                headerTintColor: theme.colors.primaryText,
            }}
        >
            <Stack.Screen name={ROUTES.SETTINGS_MENU} component={SettingsMenu} />
        </Stack.Navigator>
    )
}

export default SettingsStack