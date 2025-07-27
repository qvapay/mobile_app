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
import Send from './screens/transaction/Send'
import SendSuccess from './screens/transaction/SendSuccess'
import Receive from './screens/transaction/Receive'

// InOut Screens
import Add from './screens/add/Add'
import Withdraw from './screens/withdraw/Withdraw'

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
	if (authLoading || settingsLoading) { return <SplashScreen /> }

	// Show onboarding if it's the first time
	if (firstTime) {
		return (
			<Stack.Navigator
				screenOptions={{
					headerShown: false,
					headerStyle: {
						backgroundColor: theme.colors.background,
					},
					headerTintColor: theme.colors.primaryText,
				}}
			>
				<Stack.Screen name={ROUTES.ONBOARD_SCREEN} component={Onboard} />
				<Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />
			</Stack.Navigator>
		)
	}

	// Show authenticated screens if user is logged in
	if (isAuthenticated) {
		return (
			<Stack.Navigator
				initialRouteName={ROUTES.MAIN_STACK}
				screenOptions={{
					headerShown: false,
					headerStyle: {
						backgroundColor: theme.colors.background,
					},
					headerTintColor: theme.colors.primaryText,
				}}
			>
				{/* Main Stack */}
				<Stack.Screen name={ROUTES.MAIN_STACK} component={MainStack} />

				{/* Add and Withdraw Screens */}
				<Stack.Screen
					name={ROUTES.ADD_SCREEN}
					component={Add}
					options={{
						headerTitle: '',
						headerShown: true,
						headerBackVisible: true,
						headerBackButtonMenuEnabled: true,
						headerShadowVisible: false,
					}}
				/>
				<Stack.Screen
					name={ROUTES.WITHDRAW_SCREEN}
					component={Withdraw}
					options={{
						headerTitle: 'Extraer',
						headerShown: true,
						headerBackVisible: true,
						headerBackButtonMenuEnabled: true,
						headerShadowVisible: false,
					}}
				/>

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
					component={Send}
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
					component={SendSuccess}
					options={{
						headerTitle: '',
						headerShown: false,
						animation: 'slide_from_bottom',
					}}
				/>

				{/* Receive Screen */}
				<Stack.Screen
					name={ROUTES.RECEIVE_SCREEN}
					component={Receive}
					options={{
						headerTitle: '',
						headerShown: false,
						animation: 'slide_from_bottom',
					}}
				/>

				{/* Accesible Screens */}
				<Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />

			</Stack.Navigator>
		)
	}

	// Show unauthenticated screens (welcome, login, register)
	return (
		<Stack.Navigator
			initialRouteName={ROUTES.WELCOME_SCREEN}
			screenOptions={{
				headerShown: false,
				headerStyle: {
					backgroundColor: theme.colors.background,
				},
				headerTintColor: theme.colors.primaryText,
			}}
		>
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
