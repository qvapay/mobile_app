import { Pressable, View, Text, Platform } from 'react-native'

// Native Bottom Tab Navigator (uses UITabBarController on iOS → liquid glass on iOS 26)
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
const Tab = createNativeBottomTabNavigator()

// Routes
import { ROUTES } from '../routes'

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
	// Add safety check for user data
	// If user is not authenticated or user data is missing,
	// this will trigger the navigation logic in App.tsx to redirect to welcome/login
	if (!isAuthenticated || !user) { return null }

	return (
		<ErrorBoundary onReset={() => navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME_SCREEN }] })}>
			<Tab.Navigator
				initialRouteName={ROUTES.HOME_SCREEN}
				backBehavior='initialRoute'
				screenOptions={({ navigation }) => ({
					headerTitle: '',
					headerShown: true,
					headerShadowVisible: false,
					headerStyle: { backgroundColor: theme.colors.background },
					headerTintColor: theme.colors.primaryText,
					// Android fallback
					headerLeft: () => (
						<Pressable style={containerStyles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
							<QPAvatar user={user} size={32} />
						</Pressable>
					),
					headerRight: () => (
						<Pressable style={containerStyles.headerRight} onPress={() => navigation.navigate(ROUTES.SCAN_SCREEN)}>
							<FontAwesome6 name="qrcode" size={24} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					),
					// iOS native header items (liquid glass compatible)
					...(Platform.OS === 'ios' && {
						unstable_headerLeftItems: () => [{
							type: 'custom',
							element: (
								<Pressable onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
									<QPAvatar user={user} size={28} />
								</Pressable>
							),
							hidesSharedBackground: true,
						}],
						unstable_headerRightItems: () => [{
							type: 'button',
							label: 'Escanear',
							icon: { type: 'sfSymbol', name: 'qrcode.viewfinder' },
							onPress: () => navigation.navigate(ROUTES.SCAN_SCREEN),
						}],
					}),
					tabBarActiveTintColor: theme.colors.primaryText,
					tabBarInactiveTintColor: theme.colors.secondaryText,
				})}
			>

				<Tab.Screen
					name={ROUTES.HOME_SCREEN}
					component={Home}
					options={{
						tabBarLabel: 'Inicio',
						tabBarIcon: Platform.select({
							ios: { type: 'sfSymbol', name: 'wallet.pass.fill' },
							default: { type: 'drawableResource', name: 'ic_tab_wallet' },
						}),
						// Android fallback
						headerLeft: () => (
							<Pressable style={containerStyles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)}>
								<QPAvatar user={user} size={32} />
								<View style={{ marginLeft: 10 }}>
									<Text style={textStyles.h4}>Hola {user.name}!</Text>
									<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: -5 }]}>@{user.username}</Text>
								</View>
							</Pressable>
						),
						// iOS native header items (liquid glass compatible)
						...(Platform.OS === 'ios' && {
							unstable_headerLeftItems: () => [{
								type: 'custom',
								element: (
									<Pressable onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} style={{ flexDirection: 'row', alignItems: 'center' }}>
										<QPAvatar user={user} size={28} />
										<View style={{ marginLeft: 8 }}>
											<Text style={textStyles.h4}>Hola {user.name}!</Text>
											<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: -3 }]}>@{user.username}</Text>
										</View>
									</Pressable>
								),
								hidesSharedBackground: true,
							}],
						}),
					}}
				/>

				<Tab.Screen
					name={ROUTES.INVEST_SCREEN}
					component={Invest}
					options={{
						tabBarLabel: 'Invertir',
						tabBarIcon: Platform.select({
							ios: { type: 'sfSymbol', name: 'bitcoinsign.circle.fill' },
							default: { type: 'drawableResource', name: 'ic_tab_bitcoin' },
						}),
					}}
				/>

				<Tab.Screen
					name={ROUTES.KEYPAD_SCREEN}
					component={Keypad}
					options={{
						tabBarLabel: 'Enviar',
						tabBarIcon: Platform.select({
							ios: { type: 'sfSymbol', name: 'dollarsign.circle.fill' },
							default: { type: 'drawableResource', name: 'ic_tab_dollar' },
						}),
					}}
				/>

				<Tab.Screen
					name={ROUTES.P2P_SCREEN}
					component={P2P}
					options={{
						tabBarLabel: 'P2P',
						tabBarIcon: Platform.select({
							ios: { type: 'sfSymbol', name: 'person.2.fill' },
							default: { type: 'drawableResource', name: 'ic_tab_people' },
						}),
					}}
				/>

				<Tab.Screen
					name={ROUTES.STORE_SCREEN}
					component={Store}
					options={{
						tabBarLabel: 'Tienda',
						tabBarIcon: Platform.select({
							ios: { type: 'sfSymbol', name: 'storefront.fill' },
							default: { type: 'drawableResource', name: 'ic_tab_store' },
						}),
						headerTitle: '',
						// Android fallback
						headerRight: () => (
							<Pressable style={containerStyles.headerRight}>
								<FontAwesome6 name="cart-shopping" size={24} color={theme.colors.primaryText} iconStyle="solid" />
							</Pressable>
						),
						// iOS native header items (liquid glass compatible)
						...(Platform.OS === 'ios' && {
							unstable_headerRightItems: () => [{
								type: 'button',
								label: 'Carrito',
								icon: { type: 'sfSymbol', name: 'cart.fill' },
								onPress: () => {},
							}],
						}),
					}}
				/>

			</Tab.Navigator>
		</ErrorBoundary>
	)
}

export default MainStack
