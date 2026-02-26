import { useMemo } from 'react'
import { Pressable, View, Text, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Tab Navigators: native for iOS (liquid glass), JS-based for Android (full style control)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
const Tab = Platform.OS === 'ios' ? createNativeBottomTabNavigator() : createBottomTabNavigator()

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

// Settings
import { useSettings } from '../settings/SettingsContext'

// UI Components
import QPAvatar from '../ui/particles/QPAvatar'
import ErrorBoundary from '../ui/ErrorBoundary'
import { BottomBarProvider } from '../ui/BottomBarContext'
import AnimatedTabBar from '../ui/AnimatedTabBar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tab icon config per screen: iOS uses sfSymbol, Android uses FontAwesome6
const TAB_ICONS = {
	[ROUTES.HOME_SCREEN]: { ios: 'wallet.pass.fill', android: 'wallet', label: 'Inicio' },
	[ROUTES.INVEST_SCREEN]: { ios: 'bitcoinsign.circle.fill', android: 'bitcoin-sign', label: 'Invertir' },
	[ROUTES.KEYPAD_SCREEN]: { ios: 'dollarsign.circle.fill', android: 'dollar-sign', label: 'Enviar' },
	[ROUTES.P2P_SCREEN]: { ios: 'person.2.fill', android: 'people-group', label: 'P2P' },
	[ROUTES.STORE_SCREEN]: { ios: 'storefront.fill', android: 'store', label: 'Tienda' },
}

const getTabIcon = (routeName) => {
	const config = TAB_ICONS[routeName]
	if (Platform.OS === 'ios') {
		return { type: 'sfSymbol', name: config.ios }
	}
	return ({ color, size }) => (
		<FontAwesome6 name={config.android} size={size || 22} color={color} iconStyle="solid" />
	)
}

// Main Stack
const MainStack = ({ navigation }) => {

	// Contexts
	const { user, isAuthenticated } = useAuth()
	const { theme } = useTheme()
	const { appearance } = useSettings()
	const showLabels = appearance.bottomBarLabels
	const insets = useSafeAreaInsets()
	const containerStyles = useMemo(() => createContainerStyles(theme), [theme])
	const textStyles = useMemo(() => createTextStyles(theme), [theme])

	// Add safety check for user data
	// If user is not authenticated or user data is missing,
	// this will trigger the navigation logic in App.tsx to redirect to welcome/login
	if (!isAuthenticated || !user) { return null }

	// Memoized screen options to prevent liquid glass flash on iOS
	// TopBar height: 56 + insets.top
	const screenOptions = useMemo(() => ({
		headerTitle: '',
		headerShown: true,
		headerShadowVisible: false,
		headerStyle: { backgroundColor: theme.colors.background, height: 56 + insets.top },
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
		tabBarActiveTintColor: theme.colors.primary,
		tabBarInactiveTintColor: theme.colors.secondaryText,
		tabBarShowLabel: showLabels,
		// Android tab bar styling
		...(Platform.OS === 'android' && {
			tabBarStyle: {
				backgroundColor: theme.colors.background,
				borderTopColor: theme.colors.surface,
				borderTopWidth: 1,
				height: (showLabels ? 64 : 56) + insets.bottom,
				paddingBottom: insets.bottom + 4,
				paddingTop: 8,
			},
			tabBarLabelStyle: {
				fontFamily: 'Rubik-Medium',
				fontSize: 12,
			},
		}),
	}), [theme, showLabels, insets.bottom, user, containerStyles, navigation])

	// Memoized per-screen options
	const homeOptions = useMemo(() => ({
		tabBarLabel: showLabels ? 'Inicio' : '',
		tabBarIcon: getTabIcon(ROUTES.HOME_SCREEN),
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
	}), [showLabels, containerStyles, textStyles, theme, user, navigation])

	const investOptions = useMemo(() => ({
		tabBarLabel: showLabels ? 'Invertir' : '',
		tabBarIcon: getTabIcon(ROUTES.INVEST_SCREEN),
	}), [showLabels])

	const keypadOptions = useMemo(() => ({
		tabBarLabel: showLabels ? 'Enviar' : '',
		tabBarIcon: getTabIcon(ROUTES.KEYPAD_SCREEN),
	}), [showLabels])

	const p2pOptions = useMemo(() => ({
		tabBarLabel: showLabels ? 'P2P' : '',
		tabBarIcon: getTabIcon(ROUTES.P2P_SCREEN),
	}), [showLabels])

	const storeOptions = useMemo(() => ({
		tabBarLabel: showLabels ? 'Tienda' : '',
		tabBarIcon: getTabIcon(ROUTES.STORE_SCREEN),
		headerTitle: '',
		// Android fallback
		headerRight: () => (
			<Pressable style={containerStyles.headerRight} onPress={() => navigation.navigate(ROUTES.MY_PURCHASES)}>
				<FontAwesome6 name="cart-shopping" size={24} color={theme.colors.primaryText} iconStyle="solid" />
			</Pressable>
		),
		// iOS native header items (liquid glass compatible)
		...(Platform.OS === 'ios' && {
			unstable_headerRightItems: () => [{
				type: 'button',
				label: 'Carrito',
				icon: { type: 'sfSymbol', name: 'cart.fill' },
				onPress: () => navigation.navigate(ROUTES.MY_PURCHASES),
			}],
		}),
	}), [showLabels, containerStyles, theme, navigation])

	return (
		<BottomBarProvider>
			<ErrorBoundary onReset={() => navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME_SCREEN }] })}>
				<Tab.Navigator
					initialRouteName={ROUTES.HOME_SCREEN}
					backBehavior='initialRoute'
					screenOptions={screenOptions}
					{...(Platform.OS === 'android' ? { tabBar: (props) => <AnimatedTabBar {...props} /> } : {})}
				>

					<Tab.Screen
						name={ROUTES.HOME_SCREEN}
						component={Home}
						options={homeOptions}
					/>

					{Platform.OS !== 'ios' && (
						<Tab.Screen
							name={ROUTES.INVEST_SCREEN}
							component={Invest}
							options={investOptions}
						/>
					)}

					<Tab.Screen
						name={ROUTES.KEYPAD_SCREEN}
						component={Keypad}
						options={keypadOptions}
					/>

					<Tab.Screen
						name={ROUTES.P2P_SCREEN}
						component={P2P}
						options={p2pOptions}
					/>

					<Tab.Screen
						name={ROUTES.STORE_SCREEN}
						component={Store}
						options={storeOptions}
					/>

				</Tab.Navigator>
			</ErrorBoundary>
		</BottomBarProvider>
	)
}

export default MainStack
