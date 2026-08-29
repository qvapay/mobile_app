import { useMemo } from 'react'
import { Pressable, View, Text, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Liquid glass requires iOS 26+
const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

// Tab Navigators: native for iOS 26+ (liquid glass), JS-based for Android and older iOS
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
import type { BottomTabNavigationOptions, BottomTabTypeBag } from '@react-navigation/bottom-tabs'
import type { TypedNavigator } from '@react-navigation/native'
import type { MainTabParamList, RootStackParamList } from '../types/navigation'

/**
 * Los dos navigators (nativo iOS 26+ vs JS) tienen tipos distintos, así que el
 * ternario se tipa por el JS-based: es el que fija el contrato de
 * `Tab.Navigator`/`Tab.Screen` sobre MainTabParamList. `Config = undefined`
 * selecciona la variante dinámica de TypedNavigator (la de `<Tab.Screen>`),
 * no la estática de `createBottomTabNavigator({ screens })`.
 */
const Tab = (supportsLiquidGlass
	? createNativeBottomTabNavigator()
	: createBottomTabNavigator<MainTabParamList>()
) as unknown as TypedNavigator<BottomTabTypeBag<MainTabParamList>, undefined>

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
import HeaderIdentity from '../ui/HeaderIdentity'
import ErrorBoundary from '../ui/ErrorBoundary'
import { BottomBarProvider } from '../ui/BottomBarContext'
import AnimatedTabBar from '../ui/AnimatedTabBar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

type MainStackProps = NativeStackScreenProps<RootStackParamList, 'MainStack'>

/** Icono de un tab por plataforma: SF Symbol en iOS 26+, FontAwesome6 en el resto. */
type TabIconConfig = { ios: string, android: FontAwesome6SolidIconName, label: string }

// Tab icon config per screen: iOS uses sfSymbol, Android uses FontAwesome6
const TAB_ICONS: Record<string, TabIconConfig> = {
	[ROUTES.HOME_SCREEN]: { ios: 'wallet.pass.fill', android: 'wallet', label: 'Inicio' },
	[ROUTES.INVEST_SCREEN]: { ios: 'bitcoinsign.circle.fill', android: 'bitcoin-sign', label: 'Invertir' },
	[ROUTES.KEYPAD_SCREEN]: { ios: 'dollarsign.circle.fill', android: 'dollar-sign', label: 'Enviar' },
	[ROUTES.P2P_SCREEN]: { ios: 'person.2.fill', android: 'people-group', label: 'P2P' },
	[ROUTES.STORE_SCREEN]: { ios: 'storefront.fill', android: 'store', label: 'Tienda' },
}

const getTabIcon = (routeName: string) => {
	const config = TAB_ICONS[routeName]
	if (supportsLiquidGlass) {
		return { type: 'sfSymbol', name: config.ios }
	}
	return ({ color, size }: { color: string, size?: number }) => (
		<FontAwesome6 name={config.android} size={size || 22} color={color} iconStyle="solid" />
	)
}

// Main Stack
const MainStack = ({ navigation }: MainStackProps) => {

	// Contexts
	const { user, isAuthenticated } = useAuth()
	const { theme } = useTheme()
	const { t } = useTranslation()
	const { appearance, getSetting } = useSettings()
	const showBalance = getSetting('privacy', 'showBalance', true)
	const showLabels = appearance.bottomBarLabels
	const insets = useSafeAreaInsets()
	const containerStyles = useMemo(() => createContainerStyles(theme), [theme])
	const textStyles = useMemo(() => createTextStyles(theme), [theme])

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
			<HeaderIdentity user={user} style={containerStyles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} />
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
					<HeaderIdentity user={user} native onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} />
				),
				hidesSharedBackground: true,
			}],
			unstable_headerRightItems: () => [{
				type: 'button',
				label: t('navigation.headerItems.scan'),
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
	}), [theme, showLabels, insets.top, insets.bottom, user, containerStyles, navigation, t])

	// Memoized per-screen options.
	// OJO: los `unstable_header*Items` (iOS 26 liquid glass) no están en
	// `BottomTabNavigationOptions`, y los spreads condicionales los dejan como
	// props opcionales extra — de ahí el cast en cada `options={…}` del JSX.
	const homeOptions = useMemo(() => ({
		tabBarLabel: showLabels ? t('navigation.tabs.home') : '',
		tabBarIcon: getTabIcon(ROUTES.HOME_SCREEN),
		// Android fallback
		headerRight: () => (
			<View style={containerStyles.headerRight}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 16 }}>
					<FontAwesome6 name="bolt" size={14} color="#F7931A" iconStyle="solid" />
					<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>
						{showBalance ? (user!.satoshis || 0).toLocaleString() : '***'}
					</Text>
				</View>
				{!user!.golden_check && (
					<Pressable style={{ marginRight: 16 }} onPress={() => navigation.navigate(ROUTES.GOLD_CHECK)}>
						<FontAwesome6 name="crown" size={20} color={theme.colors.gold} iconStyle="solid" />
					</Pressable>
				)}
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
								{showBalance ? (user!.satoshis || 0).toLocaleString() : '***'}
							</Text>
						</View>
					),
					hidesSharedBackground: true,
				},
				...(!user!.golden_check ? [{
					type: 'custom',
					element: (
						<Pressable onPress={() => navigation.navigate(ROUTES.GOLD_CHECK)}>
							<FontAwesome6 name="crown" size={18} color={theme.colors.gold} iconStyle="solid" />
						</Pressable>
					),
					hidesSharedBackground: true,
				}] : []),
				{
					type: 'button',
					label: t('navigation.headerItems.scan'),
					icon: { type: 'sfSymbol', name: 'qrcode.viewfinder' },
					onPress: () => navigation.navigate(ROUTES.SCAN_SCREEN),
				},
			],
		}),
	}), [showLabels, showBalance, containerStyles, textStyles, theme, user, navigation, t])

	const investOptions = useMemo(() => ({
		tabBarLabel: showLabels ? t('navigation.tabs.invest') : '',
		tabBarIcon: getTabIcon(ROUTES.INVEST_SCREEN),
		headerRight: () => null,
		...(supportsLiquidGlass && { unstable_headerRightItems: () => [] }),
	}), [showLabels, t])

	const keypadOptions = useMemo(() => ({
		tabBarLabel: showLabels ? t('navigation.tabs.send') : '',
		tabBarIcon: getTabIcon(ROUTES.KEYPAD_SCREEN),
	}), [showLabels, t])

	// El switch Comprar/Vender vive centrado en el header de P2P (P2P.tsx), así
	// que aquí la identidad se reduce al avatar — mismo tamaño que en el resto
	// de pestañas para que la barra siga leyéndose igual.
	const p2pOptions = useMemo(() => ({
		tabBarLabel: showLabels ? t('navigation.tabs.p2p') : '',
		tabBarIcon: getTabIcon(ROUTES.P2P_SCREEN),
		// P2P.tsx lo repite en su setOptions (junto al switch), pero ahí llega un
		// frame tarde: sin esto el header entra alineado a la izquierda (default
		// de Android) y se recoloca al montar la pantalla.
		headerTitleAlign: 'center' as const,
		// Android fallback
		headerLeft: () => (
			<HeaderIdentity user={user} avatarOnly style={containerStyles.headerLeft} onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} />
		),
		// iOS 26+ native header items (liquid glass compatible)
		...(supportsLiquidGlass && {
			unstable_headerLeftItems: () => [{
				type: 'custom',
				element: (
					<HeaderIdentity user={user} avatarOnly native onPress={() => navigation.navigate(ROUTES.SETTINGS_STACK)} />
				),
				hidesSharedBackground: true,
			}],
		}),
	}), [showLabels, containerStyles, user, navigation, t])

	const storeOptions = useMemo(() => ({
		tabBarLabel: showLabels ? t('navigation.tabs.store') : '',
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
				label: t('navigation.headerItems.cart'),
				icon: { type: 'sfSymbol', name: 'cart.fill' },
				onPress: () => navigation.navigate(ROUTES.MY_PURCHASES),
			}],
		}),
	}), [showLabels, containerStyles, theme, navigation, t])

	const hapticTabListeners = useMemo(() => ({
		tabPress: () => ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false }),
	}), [])

	// Safety check for user data (after all hooks)
	if (!isAuthenticated || !user) { return null }

	return (
		<BottomBarProvider>
			<ErrorBoundary onReset={() => navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME_SCREEN as unknown as keyof RootStackParamList }] })}>
				<Tab.Navigator
					initialRouteName={ROUTES.HOME_SCREEN}
					backBehavior='initialRoute'
					screenOptions={screenOptions}
					{...(Platform.OS === 'android' ? { tabBar: (props) => <AnimatedTabBar {...props} /> } : {})}
				>

					<Tab.Screen
						name={ROUTES.HOME_SCREEN}
						component={Home}
						options={homeOptions as unknown as BottomTabNavigationOptions}
						listeners={hapticTabListeners}
					/>

					<Tab.Screen
						name={ROUTES.INVEST_SCREEN}
						component={Invest}
						options={investOptions as unknown as BottomTabNavigationOptions}
						listeners={hapticTabListeners}
					/>

					<Tab.Screen
						name={ROUTES.KEYPAD_SCREEN}
						component={Keypad}
						options={keypadOptions as unknown as BottomTabNavigationOptions}
						listeners={hapticTabListeners}
					/>

					<Tab.Screen
						name={ROUTES.P2P_SCREEN}
						component={P2P}
						options={p2pOptions as unknown as BottomTabNavigationOptions}
						listeners={hapticTabListeners}
					/>

					<Tab.Screen
						name={ROUTES.STORE_SCREEN}
						component={Store}
						options={storeOptions as unknown as BottomTabNavigationOptions}
						listeners={hapticTabListeners}
					/>

				</Tab.Navigator>
			</ErrorBoundary>
		</BottomBarProvider>
	)
}

export default MainStack
