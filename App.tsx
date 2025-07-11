// React Components
import { SafeAreaView, Platform, StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native'

// Navigation Components
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Routes
import { ROUTES } from './components/screens/routes'

// Screens
import SplashScreen from './components/screens/Splash'
import WelcomeScreen from './components/screens/Welcome'

function App() {

	const isDarkMode = useColorScheme() === 'dark'

	return (
		<SafeAreaView style={styles.container}>
			<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

			<NavigationContainer>
				<Stack.Navigator
					initialRouteName={ROUTES.SPLASH_SCREEN}
				>
					<Stack.Screen name={ROUTES.SPLASH_SCREEN} component={SplashScreen} />
					<Stack.Screen name={ROUTES.WELCOME_SCREEN} component={WelcomeScreen} />
				</Stack.Navigator>
			</NavigationContainer>

		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'red'
	}
})

export default App
