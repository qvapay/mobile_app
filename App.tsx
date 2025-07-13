// React Components
import React from 'react'
import { StyleSheet } from 'react-native'

// Safe Area Components
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Navigation Components
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/authContext'

// Routes
import { ROUTES } from './routes'

// Screens
import SplashScreen from './screens/splash/Splash'
import WelcomeScreen from './screens/welcome/Welcome'

import LoginScreen from './auth/screens/Login'
import RegisterScreen from './auth/screens/Register'
import HomeScreen from './screens/home/Home'

// Main App Navigator Component
const AppNavigator = () => {

	// Auth Context
	const { isAuthenticated, isLoading } = useAuth()

	// Show splash screen while loading
	if (isLoading) { return <SplashScreen /> }

	return (
		<Stack.Navigator initialRouteName={isAuthenticated ? ROUTES.HOME_SCREEN : ROUTES.WELCOME_SCREEN} screenOptions={{ headerShown: false }}>
			{isAuthenticated ? (
				<>
					<Stack.Screen name={ROUTES.HOME_SCREEN} component={HomeScreen} />
				</>
			) : (
				<>
					<Stack.Screen name={ROUTES.WELCOME_SCREEN} component={WelcomeScreen} />
					<Stack.Screen name={ROUTES.LOGIN_SCREEN} component={LoginScreen} />
					<Stack.Screen name={ROUTES.REGISTER_SCREEN} component={RegisterScreen} />
				</>
			)}
		</Stack.Navigator>
	);
};

function App() {
	return (
		<AuthProvider>
			<SafeAreaProvider style={styles.container}>
				<NavigationContainer>
					<AppNavigator />
				</NavigationContainer>
			</SafeAreaProvider>
		</AuthProvider>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'red'
	}
})

export default App
