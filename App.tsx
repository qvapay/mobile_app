// i18n — inicializa el singleton como side-effect ANTES que el resto de la app
// (el ErrorBoundary resuelve su copy con i18n.t() en render); ver i18n/index.js
import './i18n'
import { useTranslation } from 'react-i18next'

// React Components
import { Platform, Pressable } from 'react-native'
import React, { useEffect, useMemo, useRef } from 'react'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// Data layer (React Query + persistencia en AsyncStorage)
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persistOptions } from './api/queryClient'

// Navigation Components
import { enableFreeze } from 'react-native-screens'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'

enableFreeze(true)

// Contrato ruta → params (types/navigation.ts); su declaración global también
// tipa useNavigation() en todo el árbol
import type { RootStackParamList } from './types/navigation'
import type { User } from './types/domain'

const Stack = createNativeStackNavigator<RootStackParamList>()

// Auth Context
import { AuthProvider, useAuth } from './auth/AuthContext'

// Settings Context
import { SettingsProvider, useSettings } from './settings/SettingsContext'
import LanguageSync from './settings/LanguageSync'

// App Lock
import { AppLockProvider } from './lock/AppLockContext'
import LockScreen from './lock/LockScreen'

// Online Status
import { OnlineStatusProvider } from './hooks/OnlineStatusContext'

// Loading
import GlobalLoadingBar from './ui/GlobalLoadingBar'
import { LoadingProvider, useLoading } from './loading/LoadingContext'
import { registerLoadingCallbacks, unregisterLoadingCallbacks } from './api/client'

// Theme Provider
import { useTheme } from './theme/ThemeContext'
import { ThemeProvider } from './theme/ThemeContext'

// Routes
import { ROUTES } from './routes'

// Deep Linking
import linking from './linking'

// Screens without auth
import HelpScreen from './screens/help/Help'
import LoginScreen from './auth/screens/Login'
import SplashScreen from './screens/splash/Splash'
import WelcomeScreen from './screens/welcome/Welcome'
import RegisterScreen from './auth/screens/Register'
import Recover2FAScreen from './auth/screens/Recover2FA'
import RecoverPasswordScreen from './auth/screens/RecoverPassword'

// Screens with auth
import Onboard from './screens/onboard/Onboard'
import MainStack from './screens/MainStack'
import Send from './screens/transaction/Send'
import SendConfirm from './screens/transaction/SendConfirm'
import SendSuccess from './screens/transaction/SendSuccess'
import Receive from './screens/transaction/Receive'
import Transaction from './screens/transaction/Transaction'
import Transactions from './screens/transaction/Transactions'
import Pay from './screens/transaction/Pay'
import P2PCreate from './screens/p2p/P2PCreate'
import P2POffer from './screens/p2p/P2POffer'
import P2PUser from './screens/p2p/P2PUser'
import GoldCheck from './screens/settings/subpanels/GoldCheck'
import Scan from './screens/scan/Scan'
import NearbyPay from './screens/nearby/NearbyPay'

// Invest Screens
import Savings from './screens/invest/Savings'
import StockDetail from './screens/invest/StockDetail'
import CoinDetail from './screens/invest/CoinDetail'

// InOut Screens
import Add from './screens/add/Add'
import Withdraw from './screens/withdraw/Withdraw'


// Store Screens
import PhoneTopupIndex from './screens/store/PhoneTopupIndex'
import PhoneTopupBrand from './screens/store/PhoneTopupBrand'
import TopupScreen from './screens/topup/TopupScreen'
import GiftCards from './screens/store/GiftCards'
import GiftCardBrand from './screens/store/GiftCardBrand'
import MyPurchases from './screens/store/MyPurchases'
import PurchaseDetail from './screens/store/PurchaseDetail'

// Marketplace (tiendas de comercios aprobados) Screens
import MarketStores from './screens/store/market/MarketStores'
import MarketStore from './screens/store/market/MarketStore'
import MarketProduct from './screens/store/market/MarketProduct'
import MarketCart from './screens/store/market/MarketCart'
import MarketOrders from './screens/store/market/MarketOrders'
import MarketOrderDetail from './screens/store/market/MarketOrderDetail'
import CartHeaderButton from './ui/store/CartHeaderButton'

// Assisted Shopping Screens
import AssistedShopping from './screens/store/assisted/AssistedShopping'
import AssistedProduct from './screens/store/assisted/AssistedProduct'
import AssistedCart from './screens/store/assisted/AssistedCart'
import AssistedCheckout from './screens/store/assisted/AssistedCheckout'
import AssistedOrders from './screens/store/assisted/AssistedOrders'
import AssistedOrderDetail from './screens/store/assisted/AssistedOrderDetail'

// Settings Stack
import SettingsStack from './screens/settings/SettingsStack'
import Contacts from './screens/settings/subpanels/Contacts'

// Notifications
import { Toaster } from 'sonner-native'

// UI Components
import QPAvatar from './ui/particles/QPAvatar'
import ErrorBoundary from './ui/ErrorBoundary'
import UpdatePromptModal from './ui/UpdatePromptModal'

// App-root navigation side effects (splash, deep links, OneSignal, auth routing)
import { useAppNavigation } from './hooks/useAppNavigation'

// Consistent header options using native back button (works with iOS liquid glass)
const getHeaderOptions = (title: string, options?: {
	animation?: 'slide_from_right' | 'slide_from_bottom' | 'slide_from_left' | 'none';
	headerRight?: () => React.ReactNode;
}) => ({
	headerTitle: title,
	headerTitleAlign: 'center' as const,
	headerShown: true,
	headerShadowVisible: false,
	animation: options?.animation || 'slide_from_right' as const,
	...(options?.headerRight && { headerRight: options.headerRight }),
})

type ScreenConfig = {
	name: keyof RootStackParamList
	component: React.ComponentType<any>
	options?: any
}

// Screen list builder — AppNavigator lo memoiza con useMemo([t]) para que un
// cambio de idioma recree los options (native-stack repinta los headers en
// vivo) sin batir la identidad en re-renders ajenos (flash liquid glass).
// P2P Offer is the one exception (header avatar needs navigation + user) and is
// registered inline in AppNavigator.
const buildStaticScreens = (t: (key: string, options?: any) => string): ScreenConfig[] => [
	// Onboard + Welcome + Main Stack
	// Onboard lleva header nativo para hospedar los QPStepDots como título
	// (los dots + Saltar los inyecta la pantalla vía setOptions)
	{ name: ROUTES.ONBOARD_SCREEN, component: Onboard, options: getHeaderOptions('') },
	{ name: ROUTES.WELCOME_SCREEN, component: WelcomeScreen, options: { animation: 'none' } },
	{ name: ROUTES.MAIN_STACK, component: MainStack },

	// Add and Withdraw Screens
	{ name: ROUTES.ADD, component: Add, options: getHeaderOptions(t('navigation.headers.deposit')) },
	{ name: ROUTES.WITHDRAW, component: Withdraw, options: getHeaderOptions(t('navigation.headers.withdraw')) },

	// P2P Create Screen
	{ name: ROUTES.P2P_CREATE_SCREEN, component: P2PCreate, options: getHeaderOptions('', { animation: 'slide_from_bottom' }) },

	// P2P User Profile Screen — no header so cover extends to the status bar (Scan/Profile look)
	{ name: ROUTES.P2P_USER_SCREEN, component: P2PUser, options: { headerShown: false } },

	// GoldCheck — also reachable from SettingsStack, but registered here so
	// peer profile and other screens can push it directly with a back button
	{ name: ROUTES.GOLD_CHECK, component: GoldCheck, options: getHeaderOptions(t('navigation.headers.goldCheck')) },

	// Settings Stack
	{ name: ROUTES.SETTINGS_STACK, component: SettingsStack, options: { animation: 'slide_from_bottom' } },

	// Contacts (accessible from Send)
	{ name: ROUTES.CONTACTS, component: Contacts, options: getHeaderOptions(t('navigation.headers.contacts')) },

	// Send, Receive and Send Success Screens
	{ name: ROUTES.SEND, component: Send, options: getHeaderOptions(t('navigation.headers.send')) },
	{ name: ROUTES.SEND_CONFIRM, component: SendConfirm, options: getHeaderOptions(t('navigation.headers.sendConfirm')) },
	{ name: ROUTES.SEND_SUCCESS, component: SendSuccess },
	{ name: ROUTES.RECEIVE, component: Receive, options: { headerShown: false, animation: 'slide_from_bottom' } },

	// Transaction Screens
	{ name: ROUTES.TRANSACTIONS, component: Transactions, options: getHeaderOptions(t('navigation.headers.transactions')) },
	{
		// Transaction detail: when both parties exist the screen shows the
		// counterparty's profile header, so the header must be transparent from
		// the very first frame — flipping it after mount (setOptions in an
		// effect) shifts the whole layout down and back up. The tint stays on
		// the theme default: the screen itself forces white (pre-paint) only
		// when a cover photo actually renders behind the header.
		name: ROUTES.TRANSACTION,
		component: Transaction,
		options: ({ route }: any) => {
			const t = route.params?.transaction ?? {}
			const hasCounterparty = !!((t.user ?? t.User) && (t.paid_by ?? t.PaidBy))
			return {
				...getHeaderOptions(''),
				...(hasCounterparty && {
					headerTransparent: true,
					headerStyle: { backgroundColor: 'transparent' },
				}),
			}
		},
	},

	// Pay Screen — bottom-sheet style, slides from bottom, transparent backdrop
	{
		name: ROUTES.PAY_SCREEN,
		component: Pay,
		options: {
			headerShown: false,
			animation: 'slide_from_bottom',
			presentation: 'transparentModal',
			contentStyle: { backgroundColor: 'transparent' },
		},
	},

	// Savings Screen
	{ name: ROUTES.SAVINGS_SCREEN, component: Savings, options: getHeaderOptions(t('navigation.headers.savings')) },

	// Stock Detail Screen
	{ name: ROUTES.STOCK_DETAIL_SCREEN, component: StockDetail, options: ({ route }: any) => getHeaderOptions(route.params?.name || '') },
	{ name: ROUTES.COIN_DETAIL_SCREEN, component: CoinDetail, options: ({ route }: any) => getHeaderOptions(route.params?.name || '') },

	// QR Scan Screen
	{ name: ROUTES.SCAN_SCREEN, component: Scan, options: { animation: 'slide_from_bottom', headerShown: false } },

	// Nearby Pay Screen — AirDrop-style proximity payments radar
	{ name: ROUTES.NEARBY_PAY, component: NearbyPay, options: { animation: 'slide_from_bottom', headerShown: false } },

	// Login and Register Screens
	{ name: ROUTES.LOGIN_SCREEN, component: LoginScreen, options: getHeaderOptions('') },
	{ name: ROUTES.REGISTER_SCREEN, component: RegisterScreen, options: { ...getHeaderOptions(''), headerBackButtonMenuEnabled: false } },

	// Recover Password Screens
	{ name: ROUTES.RECOVER_PASSWORD_SCREEN, component: RecoverPasswordScreen, options: getHeaderOptions('') },
	{ name: ROUTES.RECOVER_2FA_SCREEN, component: Recover2FAScreen, options: getHeaderOptions('') },

	// Phone Topup Screens
	{ name: ROUTES.PHONE_TOPUP_INDEX, component: PhoneTopupIndex, options: getHeaderOptions(t('navigation.headers.phoneTopups')) },
	{ name: ROUTES.PHONE_TOPUP_BRAND, component: PhoneTopupBrand, options: getHeaderOptions('') },

	// Store-billed Topup Screen (Google Play / App Store consumables)
	{ name: ROUTES.TOPUP_SCREEN, component: TopupScreen, options: getHeaderOptions(t('navigation.headers.topup')) },

	// Gift Card Screens
	{ name: ROUTES.GIFT_CARDS, component: GiftCards, options: getHeaderOptions(t('navigation.headers.giftCards')) },
	{ name: ROUTES.GIFT_CARD_BRAND, component: GiftCardBrand, options: getHeaderOptions('') },

	// My Purchases Screens
	{ name: ROUTES.MY_PURCHASES, component: MyPurchases, options: getHeaderOptions(t('navigation.headers.myPurchases')) },
	{ name: ROUTES.PURCHASE_DETAIL, component: PurchaseDetail, options: getHeaderOptions('') },

	// Marketplace (tiendas de comercios aprobados) Screens
	{ name: ROUTES.MARKET_STORES, component: MarketStores, options: getHeaderOptions(t('navigation.headers.stores'), { headerRight: () => <CartHeaderButton /> }) },
	// MarketStore — no header so the store cover extends to the status bar (P2PUser/Profile look)
	{ name: ROUTES.MARKET_STORE, component: MarketStore, options: { headerShown: false } },
	{ name: ROUTES.MARKET_PRODUCT, component: MarketProduct, options: getHeaderOptions('', { headerRight: () => <CartHeaderButton /> }) },
	{ name: ROUTES.MARKET_CART, component: MarketCart, options: getHeaderOptions(t('navigation.headers.myCart')) },
	{ name: ROUTES.MARKET_ORDERS, component: MarketOrders, options: getHeaderOptions(t('navigation.headers.marketOrders')) },
	{ name: ROUTES.MARKET_ORDER_DETAIL, component: MarketOrderDetail, options: getHeaderOptions(t('navigation.headers.order')) },

	// Assisted Shopping (Personal Shopper) Screens
	{ name: ROUTES.ASSISTED_SHOPPING, component: AssistedShopping, options: getHeaderOptions(t('navigation.headers.assistedShopping')) },
	{ name: ROUTES.ASSISTED_PRODUCT, component: AssistedProduct, options: getHeaderOptions('') },
	{ name: ROUTES.ASSISTED_CART, component: AssistedCart, options: getHeaderOptions(t('navigation.headers.myCart')) },
	{ name: ROUTES.ASSISTED_CHECKOUT, component: AssistedCheckout, options: getHeaderOptions(t('navigation.headers.assistedCheckout')) },
	{ name: ROUTES.ASSISTED_ORDERS, component: AssistedOrders, options: getHeaderOptions(t('navigation.headers.assistedOrders')) },
	{ name: ROUTES.ASSISTED_ORDER_DETAIL, component: AssistedOrderDetail, options: ({ route }: any) => getHeaderOptions(route.params?.id ? t('navigation.headers.orderNumber', { id: route.params.id }) : '') },

	// Accesible Screens
	{ name: ROUTES.HELP_SCREEN, component: HelpScreen },
]

// P2P Offer header: avatar linking to own P2P profile, built from render-time navigation + user
const p2pOfferScreenOptions = (navigation: ReturnType<typeof useAppNavigation>['navigation'], user: User | null) => ({
	...getHeaderOptions(''),
	// Android fallback
	headerRight: () => (
		<Pressable onPress={() => navigation.navigate(ROUTES.P2P_USER_SCREEN, { uuid: user?.uuid as string })}>
			<QPAvatar user={user} size={32} />
		</Pressable>
	),
	// iOS native header items (liquid glass compatible)
	...(Platform.OS === 'ios' && {
		unstable_headerRightItems: () => [{
			type: 'custom' as const,
			element: (
				<Pressable onPress={() => navigation.navigate(ROUTES.P2P_USER_SCREEN, { uuid: user?.uuid as string })}>
					<QPAvatar user={user} size={28} />
				</Pressable>
			),
			hidesSharedBackground: true,
		}],
	}),
})

// Main App Navigator Component
const AppNavigator = ({ pendingDeepLinkRef }: { pendingDeepLinkRef: React.RefObject<string | null> }) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()

	// Idioma activo — useTranslation re-renderiza en cada languageChanged y
	// entrega una `t` con identidad nueva, que recalcula los títulos abajo
	const { t } = useTranslation()

	// Splash timing, store-update prompt, auth routing and deep-link handling
	const {
		navigation,
		user,
		isAuthenticated,
		authLoading,
		settingsLoading,
		firstTime,
		splashReady,
		updateInfo,
		dismissUpdate,
	} = useAppNavigation(pendingDeepLinkRef)

	// Memoized screen options to prevent re-renders that cause liquid glass flash on iOS
	const stackScreenOptions = useMemo(() => ({
		headerShown: false,
		headerStyle: { backgroundColor: theme.colors.background },
		headerShadowVisible: false,
		headerBackButtonDisplayMode: 'minimal' as const,
		headerTintColor: theme.colors.primaryText,
		contentStyle: { backgroundColor: theme.colors.background },
	}), [theme])

	// Recalculado SOLO al cambiar el idioma; estable en el resto de re-renders
	// (options con identidad cambiante reintroducen el flash liquid glass en iOS)
	const staticScreens = useMemo(() => buildStaticScreens(t), [t])

	// Show splash screen if still loading or if minimum time hasn't passed
	if (authLoading || settingsLoading || !splashReady) { return <SplashScreen /> }

	// Show unauthenticated screens (welcome, login, register)
	return (
		<>
			<Stack.Navigator initialRouteName={firstTime ? ROUTES.ONBOARD_SCREEN : isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN} screenOptions={stackScreenOptions}>
				{staticScreens.map(({ name, component, options }) => (
					<Stack.Screen key={name} name={name} component={component} options={options} />
				))}

				{/* P2P Offer Screen — header avatar needs render-time navigation + user */}
				<Stack.Screen
					name={ROUTES.P2P_OFFER_SCREEN}
					component={P2POffer}
					options={p2pOfferScreenOptions(navigation, user)}
				/>
			</Stack.Navigator>

			<UpdatePromptModal
				visible={!!updateInfo?.needsUpdate}
				currentVersion={updateInfo?.currentVersion}
				latestVersion={updateInfo?.latestVersion}
				storeUrl={updateInfo?.storeUrl}
				onDismiss={dismissUpdate}
			/>
		</>
	)
}

// Theme Provider with Settings Integration
const ThemeProviderWithSettings = ({ children }: { children: React.ReactNode }) => {
	const { settings, updateSettings } = useSettings()
	const { user } = useAuth()
	// Custom accent is a GOLD perk. While the profile is unknown (cold start,
	// logged out) keep the stored accent to avoid a flash; once the profile
	// resolves without golden_check the theme reverts to the brand accent.
	const accentAllowed = !user || !!user.golden_check
	return (
		<ThemeProvider settings={settings} updateSettings={updateSettings} accentAllowed={accentAllowed}>
			{children}
		</ThemeProvider>
	)
}

// Navigation wrapper that provides theme to NavigationContainer
// This prevents the iOS native layer from using default white background during transitions
const NavigationWrapper = ({ children }: { children: React.ReactNode }) => {
	const { theme, isDark } = useTheme()
	const baseTheme = isDark ? DarkTheme : DefaultTheme
	const navigationTheme = useMemo(() => ({
		...baseTheme,
		dark: isDark,
		colors: {
			...baseTheme.colors,
			primary: theme.colors.primary,
			background: theme.colors.background,
			card: theme.colors.background,
			text: theme.colors.primaryText,
			border: theme.colors.surface,
			notification: theme.colors.primary,
		},
	}), [theme, isDark, baseTheme])

	return (
		<NavigationContainer linking={linking as any} theme={navigationTheme}>
			{children}
		</NavigationContainer>
	)
}

// Bridge component that connects LoadingContext to Axios interceptors
const LoadingBridge = ({ children }: { children: React.ReactNode }) => {
	const { startLoading, stopLoading } = useLoading()
	useEffect(() => {
		registerLoadingCallbacks(startLoading, stopLoading)
		return () => { unregisterLoadingCallbacks() }
	}, [startLoading, stopLoading])
	return <>{children}</>
}

// Initialize OneSignal (must be called outside component, before render)
OneSignal.initialize('8f69c017-b7e7-40b2-903b-11ce7ac5cc81')

function App() {
	const pendingDeepLinkRef = useRef<string | null>(null)

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ErrorBoundary>
				{/* Por fuera de AuthProvider: el logout vacía la caché de queries */}
				<PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
					<SafeAreaProvider>
						<LoadingProvider>
							<AuthProvider>
								<OnlineStatusProvider>
									<SettingsProvider>
										<LanguageSync />
										<ThemeProviderWithSettings>
											<LoadingBridge>
												<AppLockProvider>
													<NavigationWrapper>
														<GlobalLoadingBar />
														<AppNavigator pendingDeepLinkRef={pendingDeepLinkRef} />
														<Toaster position="top-center" />
													</NavigationWrapper>
													<LockScreen />
												</AppLockProvider>
											</LoadingBridge>
										</ThemeProviderWithSettings>
									</SettingsProvider>
								</OnlineStatusProvider>
							</AuthProvider>
						</LoadingProvider>
					</SafeAreaProvider>
				</PersistQueryClientProvider>
			</ErrorBoundary>
		</GestureHandlerRootView>
	)
}

export default App
