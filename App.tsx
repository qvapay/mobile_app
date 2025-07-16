// React Components
import React from 'react'
import { StyleSheet, Appearance } from 'react-native'

// Navigation Components
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/authContext'

// Theme Provider
import { ThemeProvider } from './theme/ThemeContext'

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

// Main App Navigator Component
const AppNavigator = () => {

	// Get color scheme
	const colorScheme = Appearance.getColorScheme()
	console.error(colorScheme)

	// Auth Context
	const { isAuthenticated, isLoading } = useAuth()

	// Show splash screen while loading
	if (isLoading) { return <SplashScreen /> }

	return (
		<Stack.Navigator initialRouteName={isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN} screenOptions={{ headerShown: false }}>

			{isAuthenticated ? (
				<>
					<Stack.Screen name={ROUTES.MAIN_STACK} component={MainStack} options={{ headerShown: false }} />
				</>
			) : (
				<>
					<Stack.Screen name={ROUTES.WELCOME_SCREEN} component={WelcomeScreen} />
					<Stack.Screen name={ROUTES.LOGIN_SCREEN} component={LoginScreen} />
					<Stack.Screen name={ROUTES.REGISTER_SCREEN} component={RegisterScreen} />
				</>
			)}

			{/* Accesible Screens */}
			<Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />

		</Stack.Navigator>
	);
};

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
