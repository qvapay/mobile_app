// React Components
import React from 'react'

// Navigation Components
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/AuthContext'

// Settings Context
import { SettingsProvider, useSettings } from './settings/SettingsContext'

// Theme Provider
import { ThemeProvider } from './theme/ThemeContext'
import { useTheme } from './theme/ThemeContext'
import { createContainerStyles } from './theme/themeUtils'

// Routes
import { ROUTES } from './routes'

// Screens without auth
import SplashScreen from './screens/splash/Splash'
import WelcomeScreen from './screens/welcome/Welcome'
import HelpScreen from './screens/help/Help'
import LoginScreen from './auth/screens/Login'
import RegisterScreen from './auth/screens/Register'

// Screens with auth
import Onboard from './screens/onboard/Onboard'
import MainStack from './screens/MainStack'
import SendScreen from './screens/transaction/Send'
import SendSuccessScreen from './screens/transaction/SendSuccess'

// Settings Stack
import SettingsStack from './screens/settings/SettingsStack'

// Main App Navigator Component
const AppNavigator = () => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()

	// Check if this is the first time using the app
	const { appearance, isLoading: settingsLoading } = useSettings()
	const firstTime = appearance.firstTime

	// Auth Context
	const { isAuthenticated, isLoading: authLoading } = useAuth()
	
	// Wait for both auth and settings to finish loading
	if (authLoading || settingsLoading) { 
		console.log('🔄 App loading - Auth:', authLoading, 'Settings:', settingsLoading)
		return <SplashScreen /> 
	}
	
	// Debug logging for route determination
	console.log('🎯 Route determination - firstTime:', firstTime, 'isAuthenticated:', isAuthenticated)

	return (
		<Stack.Navigator
			initialRouteName={firstTime ? ROUTES.ONBOARD_SCREEN : isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN}
			screenOptions={{
				headerShown: false,
				headerStyle: {
					backgroundColor: theme.colors.background,
				},
				headerTintColor: theme.colors.primaryText,
			}}
		>

			{/* Onboard Screen */}
			<Stack.Screen name={ROUTES.ONBOARD_SCREEN} component={Onboard} />

			{isAuthenticated ? (
				<>
					<Stack.Screen name={ROUTES.MAIN_STACK} component={MainStack} />

					{/* Settings Stack */}
					<Stack.Screen
						name={ROUTES.SETTINGS_MENU}
						component={SettingsStack}
						options={{
							animation: 'slide_from_bottom',
						}}
					/>

					{/* Send, Receive and Send Success Screens */}
					<Stack.Screen
						name={ROUTES.SEND_SCREEN}
						component={SendScreen}
						options={{
							headerTitle: '',
							headerShown: true,
							headerBackVisible: true,
							headerBackButtonMenuEnabled: true,
							headerShadowVisible: false,
						}}
					/>

					{/* Send Success Screen */}
					<Stack.Screen
						name={ROUTES.SEND_SUCCESS_SCREEN}
						component={SendSuccessScreen}
						options={{
							headerTitle: '',
							headerShown: false,
							animation: 'slide_from_bottom',
						}}
					/>

				</>
			) : (
				<>
					<Stack.Screen name={ROUTES.WELCOME_SCREEN} component={WelcomeScreen} />
					<Stack.Screen
						name={ROUTES.LOGIN_SCREEN}
						component={LoginScreen}
						options={{
							headerTitle: '',
							animation: 'slide_from_right',
							headerShown: true,
							headerBackVisible: true,
							headerBackButtonMenuEnabled: true,
							headerShadowVisible: false,
						}}
					/>
					<Stack.Screen
						name={ROUTES.REGISTER_SCREEN}
						component={RegisterScreen}
						options={{ animation: 'slide_from_right' }}
					/>
				</>
			)}

			{/* Accesible Screens */}
			<Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />

		</Stack.Navigator>
	)
}

function App() {

	return (
		<AuthProvider>
			<ThemeProvider>
				<SettingsProvider>
					<NavigationContainer>
						<AppNavigator />
					</NavigationContainer>
				</SettingsProvider>
			</ThemeProvider>
		</AuthProvider>
	)
}

export default App
