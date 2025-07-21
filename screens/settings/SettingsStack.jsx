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

// Gold Check Screens
import GoldCheck from './GoldCheck'

// Settings Stack
const SettingsStack = ({ navigation }) => {

    // Contexts
    const { theme } = useTheme()

    return (
        <Stack.Navigator
            initialRouteName="SettingsMenuScreen"
            screenOptions={{
                headerTitle: '',
                headerStyle: {
                    backgroundColor: theme.colors.background,
                },
                headerTintColor: theme.colors.primaryText,
            }}
        >

            <Stack.Screen
                name="SettingsMenuScreen"
                component={SettingsMenu}
            />

            <Stack.Screen
                name={ROUTES.GOLD_CHECK}
                component={GoldCheck}
            />

        </Stack.Navigator>
    )
}

export default SettingsStack