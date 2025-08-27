// React Components
import { useEffect, useState } from 'react'
import { Button, Pressable } from 'react-native'

// Navigation Components
import { NavigationContainer, useNavigation } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/AuthContext'

// Settings Context
import { SettingsProvider, useSettings } from './settings/SettingsContext'

// Theme Provider
import { ThemeProvider } from './theme/ThemeContext'
import { useTheme } from './theme/ThemeContext'

// Routes
import { ROUTES } from './routes'

// Screens without auth
import SplashScreen from './screens/splash/Splash'
import WelcomeScreen from './screens/welcome/Welcome'
import HelpScreen from './screens/help/Help'
import LoginScreen from './auth/screens/Login'
import RegisterScreen from './auth/screens/Register'
import RecoverPasswordScreen from './auth/screens/RecoverPassword'
import Recover2FAScreen from './auth/screens/Recover2FA'

// Screens with auth
import Onboard from './screens/onboard/Onboard'
import MainStack from './screens/MainStack'
import Send from './screens/transaction/Send'
import SendSuccess from './screens/transaction/SendSuccess'
import Receive from './screens/transaction/Receive'
import Transaction from './screens/transaction/Transaction'
import Transactions from './screens/transaction/Transactions'

// InOut Screens
import Add from './screens/add/Add'
import Withdraw from './screens/withdraw/Withdraw'

// Settings Stack
import SettingsStack from './screens/settings/SettingsStack'

// Notifications
import Toast from 'react-native-toast-message'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Sentry Error Tracking
import * as Sentry from '@sentry/react-native'

Sentry.init({
    dsn: "https://69de2bf07fd7b96e04bd157fe1843757@o483954.ingest.us.sentry.io/4509868469387264",
    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,
})

// Main App Navigator Component
const AppNavigator = () => {

    // Theme variables, dark and light modes
    const { theme } = useTheme();

    // State to control minimum splash screen time
    const [splashReady, setSplashReady] = useState(false)

    // Check if this is the first time using the app
    const { appearance, isLoading: settingsLoading } = useSettings()
    const firstTime = appearance.firstTime

    // Navigation
    const navigation = useNavigation()

    // Auth Context
    const { isAuthenticated, isLoading: authLoading } = useAuth()
    useEffect(() => {
        const timer = setTimeout(() => {
            setSplashReady(true)
        }, 2000)
        return () => clearTimeout(timer)
    }, [])

    // Add this effect after the existing useEffect
    useEffect(() => {
        if (splashReady && !authLoading && !settingsLoading) {
            // Only navigate if we're not already on the correct screen
            const currentRoute = navigation.getState()?.routes[navigation.getState()?.index || 0]?.name
            
            if (isAuthenticated && !firstTime && currentRoute !== ROUTES.MAIN_STACK) {
                // User is authenticated and not first time - navigate to main stack
                navigation.reset({
                    index: 0,
                    routes: [{ name: ROUTES.MAIN_STACK as never }]
                })
            } else if (!isAuthenticated && !firstTime && currentRoute !== ROUTES.WELCOME_SCREEN) {
                // User is not authenticated and not first time - navigate to welcome
                navigation.reset({
                    index: 0,
                    routes: [{ name: ROUTES.WELCOME_SCREEN as never }]
                })
            }
        }
    }, [isAuthenticated, firstTime, splashReady, authLoading, settingsLoading])

    // Show splash screen if still loading or if minimum time hasn't passed
    if (authLoading || settingsLoading || !splashReady) { return <SplashScreen /> }

    // Show unauthenticated screens (welcome, login, register)
    return (
        <Stack.Navigator
            initialRouteName={firstTime ? ROUTES.ONBOARD_SCREEN : isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN}
            screenOptions={{
                headerShown: false,
                headerStyle: {
                    backgroundColor: theme.colors.background
                },
                headerShadowVisible: false,
                headerTintColor: theme.colors.primaryText
            }}
        >
            <Stack.Screen name={ROUTES.ONBOARD_SCREEN} component={Onboard} />

            <Stack.Screen
                name={ROUTES.WELCOME_SCREEN}
                component={WelcomeScreen}
                options={{
                    animation: 'none'
                }}
            />

            {/* Main Stack */}
            <Stack.Screen name={ROUTES.MAIN_STACK} component={MainStack} />

            {/* Add and Withdraw Screens */}
            <Stack.Screen name={ROUTES.ADD} component={Add} />
            <Stack.Screen
                name={ROUTES.WITHDRAW}
                component={Withdraw}
                options={{
                    headerTitle: 'Extraer',
                    headerShown: true,
                    headerBackVisible: true,
                    headerBackButtonMenuEnabled: true
                }}
            />

            {/* Settings Stack */}
            <Stack.Screen
                name={ROUTES.SETTINGS_STACK}
                component={SettingsStack}
                options={{ animation: 'slide_from_bottom' }}
            />

            {/* Send, Receive and Send Success Screens */}
            <Stack.Screen
                name={ROUTES.SEND}
                component={Send}
                options={{
                    headerTitle: '',
                    headerShown: true,
                    headerBackVisible: true,
                    headerBackButtonMenuEnabled: true,
                    headerShadowVisible: false
                }}
            />
            <Stack.Screen name={ROUTES.SEND_SUCCESS} component={SendSuccess} />
            <Stack.Screen name={ROUTES.RECEIVE} component={Receive} />

            {/* Transaction Screen */}
            <Stack.Screen
                name={ROUTES.TRANSACTIONS}
                component={Transactions}
                options={{
                    headerTitle: '',
                    headerShown: true,
                    headerBackVisible: true,
                    headerBackButtonMenuEnabled: true,
                    headerShadowVisible: false
                }}
            />
            <Stack.Screen name={ROUTES.TRANSACTION} component={Transaction} />

            {/* Login and Register Screens */}
            <Stack.Screen
                name={ROUTES.LOGIN_SCREEN}
                component={LoginScreen}
                options={{
                    headerTitle: '',
                    animation: 'slide_from_right',
                    headerShown: true,
                    headerBackVisible: false,
                    headerBackButtonMenuEnabled: true,
                    headerShadowVisible: false,
                    headerLeft: () => (
                        <Pressable onPress={() => navigation.goBack()}>
                            <FontAwesome6
                                name="arrow-left"
                                size={24}
                                color={theme.colors.primaryText}
                                iconStyle="solid"
                            />
                        </Pressable>
                    )
                }}
            />
            <Stack.Screen
                name={ROUTES.REGISTER_SCREEN}
                component={RegisterScreen}
                options={{
                    headerTitle: '',
                    animation: 'slide_from_right',
                    headerShown: true,
                    headerBackVisible: false,
                    headerBackButtonMenuEnabled: true,
                    headerShadowVisible: false,
                    headerLeft: () => (
                        <Pressable onPress={() => navigation.goBack()}>
                            <FontAwesome6
                                name="arrow-left"
                                size={24}
                                color={theme.colors.primaryText}
                                iconStyle="solid"
                            />
                        </Pressable>
                    )
                }}
            />

            {/* Recover Password Screen */}
            <Stack.Screen
                name={ROUTES.RECOVER_PASSWORD_SCREEN}
                component={RecoverPasswordScreen}
                options={{
                    headerTitle: '',
                    animation: 'slide_from_right',
                    headerShown: true,
                    headerBackVisible: false,
                    headerBackButtonMenuEnabled: true,
                    headerShadowVisible: false,
                    headerLeft: () => (
                        <Pressable onPress={() => navigation.goBack()}>
                            <FontAwesome6
                                name="arrow-left"
                                size={24}
                                color={theme.colors.primaryText}
                                iconStyle="solid"
                            />
                        </Pressable>
                    )
                }}
            />
            <Stack.Screen
                name={ROUTES.RECOVER_2FA_SCREEN}
                component={Recover2FAScreen}
                options={{
                    headerTitle: '',
                    animation: 'slide_from_right',
                    headerShown: true,
                    headerBackVisible: false,
                    headerBackButtonMenuEnabled: true,
                    headerShadowVisible: false,
                    headerLeft: () => (
                        <Pressable onPress={() => navigation.goBack()}>
                            <FontAwesome6
                                name="arrow-left"
                                size={24}
                                color={theme.colors.primaryText}
                                iconStyle="solid"
                            />
                        </Pressable>
                    )
                }}
            />

            {/* Accesible Screens */}
            <Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />
        </Stack.Navigator>
    )
}

// Theme Provider with Settings Integration
const ThemeProviderWithSettings = ({ children }: { children: React.ReactNode }) => {
    const { settings, updateSettings } = useSettings()
    return (
        <ThemeProvider settings={settings} updateSettings={updateSettings}>
            {children}
        </ThemeProvider>
    )
}

function App() {
    return (
        <AuthProvider>
            <SettingsProvider>
                <ThemeProviderWithSettings>
                    <NavigationContainer>
                        <AppNavigator />
                        <Toast position="top" topOffset={40} />
                    </NavigationContainer>
                </ThemeProviderWithSettings>
            </SettingsProvider>
        </AuthProvider>
    )
}

export default Sentry.wrap(App)
