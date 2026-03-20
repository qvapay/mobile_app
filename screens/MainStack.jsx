import { useMemo } from 'react'
import { Pressable, View, Text, Image, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Liquid glass requires iOS 26+
const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

// Tab Navigators: native for iOS 26+ (liquid glass), JS-based for Android and older iOS
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
const Tab = supportsLiquidGlass ? createNativeBottomTabNavigator() : createBottomTabNavigator()

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
	if (supportsLiquidGlass) {
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
	const { appearance, getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true)
	const showLabels = appearance.bottomBarLabels
	const insets = useSafeAreaInsets()
	const containerStyles = useMemo(() => createContainerStyles(theme), [theme])
	const textStyles = useMemo(() => createTextStyles(theme), [theme])
	const qvapayLogo = theme.isDark ? require('../assets/images/ui/qvapay-logo-white.png') : require('../assets/images/ui/logo-qvapay.png')

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
		headerStyle: { backgroundColor: theme.colors.background, height: 64 + insets.top },
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
		// iOS 26+ native header items (liquid glass compatible)
		...(supportsLiquidGlass && {
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
		// Tab bar styling for Android and pre-liquid-glass iOS
		...(!supportsLiquidGlass && {
			tabBarStyle: {
				backgroundColor: theme.colors.background,
				borderTopColor: theme.colors.surface,
				borderTopWidth: 1,
				height: (showLabels ? 64 : 56) + insets.bottom,
				paddingBottom: insets.bottom + 4,
				paddingTop: 8,
			},
			tabBarLabelStyle: {
				fontFamily: theme.typography.fontFamily.medium,
				fontSize: theme.typography.fontSize.xs,
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
				<QPAvatar user={user} size={36} />
				<View style={{ marginLeft: 10 }}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
						<Text style={textStyles.h4}>{user.name}</Text>
						{user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 16, height: 16 }} />)}
						{user.golden_check && (<FontAwesome6 name="crown" size={12} color={theme.colors.gold} iconStyle="solid" />)}
						{user.role === 'admin' && (<Image source={qvapayLogo} style={{ width: 16, height: 16 }} />)}
					</View>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: -5 }]}>@{user.username}</Text>
				</View>
			</Pressable>
		),
		// iOS 26+ native header items (liquid glass compatible)
		...(supportsLiquidGlass && {
			unstable_headerLeftItems: () => [{
				type: 'custom',
				element: (
					<Pressable onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} style={{ flexDirection: 'row', alignItems: 'center' }}>
						<QPAvatar user={user} size={36} />
						<View style={{ marginLeft: 8 }}>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
								<Text style={textStyles.h4}>{user.name}</Text>
								{user.kyc && (<Image source={require('../assets/images/ui/blue-badge.png')} style={{ width: 14, height: 14 }} />)}
								{user.golden_check && (<FontAwesome6 name="crown" size={11} color={theme.colors.gold} iconStyle="solid" />)}
								{user.role === 'admin' && (<Image source={qvapayLogo} style={{ width: 14, height: 14 }} />)}
							</View>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: -3 }]}>@{user.username}</Text>
						</View>
					</Pressable>
				),
				hidesSharedBackground: true,
			}],
		}),
		// Android fallback
		headerRight: () => (
			<View style={containerStyles.headerRight}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 16 }}>
					<FontAwesome6 name="bolt" size={14} color="#F7931A" iconStyle="solid" />
					<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
						{showBalance ? (user.satoshis || 0).toLocaleString() : '***'}
					</Text>
				</View>
				<Pressable onPress={() => navigation.navigate(ROUTES.SCAN_SCREEN)}>
					<FontAwesome6 name="qrcode" size={24} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
			</View>
		),
		// iOS 26+ native header items (liquid glass compatible)
		...(supportsLiquidGlass && {
			unstable_headerRightItems: () => [
				{
					type: 'custom',
					element: (
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
							<FontAwesome6 name="bolt" size={14} color="#F7931A" iconStyle="solid" />
							<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
								{showBalance ? (user.satoshis || 0).toLocaleString() : '***'}
							</Text>
						</View>
					),
					hidesSharedBackground: true,
				},
				{
					type: 'button',
					label: 'Escanear',
					icon: { type: 'sfSymbol', name: 'qrcode.viewfinder' },
					onPress: () => navigation.navigate(ROUTES.SCAN_SCREEN),
				},
			],
		}),
	}), [showLabels, showBalance, containerStyles, textStyles, theme, user, navigation])

	const investOptions = useMemo(() => ({
		tabBarLabel: showLabels ? 'Invertir' : '',
		tabBarIcon: getTabIcon(ROUTES.INVEST_SCREEN),
		headerRight: () => null,
		...(supportsLiquidGlass && { unstable_headerRightItems: () => [] }),
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
		// iOS 26+ native header items (liquid glass compatible)
		...(supportsLiquidGlass && {
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

					<Tab.Screen
						name={ROUTES.INVEST_SCREEN}
						component={Invest}
						options={investOptions}
					/>

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
