import { Pressable, View, Text } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

// Bottom Tab Navigator
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
const Tab = createBottomTabNavigator()

// Bottom Bar
import BottomBar from '../ui/BottomBar'

// Routes
import { ROUTES, navItems } from '../routes'

// Tab Screens
import Home from './home/Home'
import Invest from './invest/Invest'
import Keypad from './keypad/Keypad'
import P2P from './p2p/P2P'
import Store from './store/Store'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../theme/themeUtils'

// Auth
import { useAuth } from '../auth/AuthContext'

// UI Components
import QPAvatar from '../ui/particles/QPAvatar'
import ErrorBoundary from '../ui/ErrorBoundary'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Main Stack
const MainStack = ({ navigation }) => {

	// Contexts
	const { user, isAuthenticated } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)
	const textStyles = createTextStyles(theme)
	const insets = useSafeAreaInsets()

	// Add safety check for user data
	// If user is not authenticated or user data is missing, 
	// this will trigger the navigation logic in App.tsx to redirect to welcome/login
	if (!isAuthenticated || !user) { return null }

	return (
		<SafeAreaProvider style={{ paddingBottom: insets.bottom, backgroundColor: theme.colors.background }}>

			<ErrorBoundary onReset={() => navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME_SCREEN }] })}>
			<Tab.Navigator
				initialRouteName={ROUTES.HOME_SCREEN}
				backBehavior='initialRoute'
				tabBar={props => <BottomBar {...props} navItems={navItems} />}
				screenOptions={({ navigation }) => ({
					headerTitle: '',
					headerShown: true,
					headerBackVisible: true,
					headerBackTitleVisible: false,
					headerBackButtonMenuEnabled: false,
					headerBackButtonDisplayMode: 'minimal',
					headerShadowVisible: false,
					headerStyle: { backgroundColor: theme.colors.background },
					headerTintColor: theme.colors.primaryText,
					headerTitleStyle: { fontSize: 24, fontFamily: theme.typography.fontFamily.bold },
					headerLeft: () => (
						<Pressable style={containerStyles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
							<QPAvatar user={user} size={32} />
						</Pressable>
					),
					headerRight: () => (
						<Pressable style={containerStyles.headerRight} onPress={() => navigation.navigate(ROUTES.SCAN_SCREEN)}>
							<FontAwesome6 name="qrcode" size={24} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					)
				})}
			>

				<Tab.Screen
					name={ROUTES.HOME_SCREEN}
					component={Home}
					options={{
						headerLeft: () => (
							<Pressable style={containerStyles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
								<QPAvatar user={user} size={32} />
								<View style={{ marginLeft: 10 }}>
									<Text style={textStyles.h4}>Hola {user.name}!</Text>
									<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: -5 }]}>@{user.username}</Text>
								</View>
							</Pressable>
						)
					}}
				/>

				<Tab.Screen
					name={ROUTES.INVEST_SCREEN}
					component={Invest}
					options={{
					}}
				/>

				<Tab.Screen
					name={ROUTES.KEYPAD_SCREEN}
					component={Keypad}
					options={{
					}}
				/>

				<Tab.Screen
					name={ROUTES.P2P_SCREEN}
					component={P2P}
					options={{
					}}
				/>

				<Tab.Screen
					name={ROUTES.STORE_SCREEN}
					component={Store}
					options={({ navigation }) => ({
						headerTitle: '',
						headerRight: () => (
							<Pressable style={containerStyles.headerRight}>
								<FontAwesome6 name="cart-shopping" size={24} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						)
					})}
				/>

			</Tab.Navigator>
			</ErrorBoundary>
		</SafeAreaProvider>
	)
}

export default MainStack