// React Components
import React from 'react'
import { StyleSheet, Appearance } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Navigation Components
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/authContext'

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
import MainStack from './screens/MainStack'

// Settings Stack
import SettingsStack from './screens/settings/Settings'


// Main App Navigator Component
const AppNavigator = () => {

	// Auth Context
	const { isAuthenticated, isLoading } = useAuth()

	// Show splash screen while loading
	if (isLoading) { return <SplashScreen /> }

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)

	return (
		<SafeAreaView style={[containerStyles.container, { backgroundColor: theme.colors.background }]}>
			<Stack.Navigator initialRouteName={isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN} screenOptions={{ headerShown: false }}>

				{isAuthenticated ? (
					<>
						<Stack.Screen name={ROUTES.MAIN_STACK} component={MainStack} />
						<Stack.Screen name={ROUTES.SETTINGS_MENU} component={SettingsStack} />
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
								headerStyle: {
									backgroundColor: theme.colors.background,
								},
								headerTintColor: theme.colors.primaryText,
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
		</SafeAreaView>
	)
}

function App() {

	return (
		<ThemeProvider>
			<AuthProvider>
				<NavigationContainer>
					<AppNavigator />
				</NavigationContainer>
			</AuthProvider>
		</ThemeProvider>
	)
}

// const styles = StyleSheet.create({
// 	container: {
// 		flex: 1,
// 		backgroundColor: 'red',
// 	}
// })

export default App
