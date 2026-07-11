// React Components
import { Platform, Pressable } from 'react-native'
import React, { useEffect, useMemo, useRef } from 'react'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// Navigation Components
import { enableFreeze } from 'react-native-screens'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'

enableFreeze(true)

const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider } from './auth/AuthContext'

// Settings Context
import { SettingsProvider, useSettings } from './settings/SettingsContext'

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

// InOut Screens
import Add from './screens/add/Add'
import Withdraw from './screens/withdraw/Withdraw'


// Store Screens
import PhoneTopupIndex from './screens/store/PhoneTopupIndex'
import PhoneTopupBrand from './screens/store/PhoneTopupBrand'
import GiftCards from './screens/store/GiftCards'
import GiftCardBrand from './screens/store/GiftCardBrand'
import MyPurchases from './screens/store/MyPurchases'
import PurchaseDetail from './screens/store/PurchaseDetail'

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

// Main App Navigator Component
const AppNavigator = ({ pendingDeepLinkRef }: { pendingDeepLinkRef: React.RefObject<string | null> }) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()

	// Consistent header options using native back button (works with iOS liquid glass)
	const getHeaderOptions = useMemo(() => (title: string, options?: {
		animation?: 'slide_from_right' | 'slide_from_bottom' | 'slide_from_left' | 'none';
		headerRight?: () => React.ReactNode;
	}) => ({
		headerTitle: title,
		headerTitleAlign: 'center' as const,
		headerShown: true,
		headerShadowVisible: false,
		animation: options?.animation || 'slide_from_right' as const,
		...(options?.headerRight && { headerRight: options.headerRight }),
	}), [])

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

	// Show splash screen if still loading or if minimum time hasn't passed
	if (authLoading || settingsLoading || !splashReady) { return <SplashScreen /> }

	// Show unauthenticated screens (welcome, login, register)
	return (
		<>
			<Stack.Navigator initialRouteName={firstTime ? ROUTES.ONBOARD_SCREEN : isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN} screenOptions={stackScreenOptions}>
				{/* Onboard Screen */}
				<Stack.Screen name={ROUTES.ONBOARD_SCREEN} component={Onboard} />

				{/* Welcome Screen */}
				<Stack.Screen
					name={ROUTES.WELCOME_SCREEN}
					component={WelcomeScreen}
					options={{
						animation: 'none'
					}}
				/>

				{/* Main Stack */}
				<Stack.Screen name={ROUTES.MAIN_STACK} component={MainStack} />

				{/* Add and Withdraw Screens */}
				<Stack.Screen
					name={ROUTES.ADD}
					component={Add}
					options={getHeaderOptions('Depositar')}
				/>
				<Stack.Screen
					name={ROUTES.WITHDRAW}
					component={Withdraw}
					options={getHeaderOptions('Extraer')}
				/>


				{/* P2P Create Screen */}
				<Stack.Screen
					name={ROUTES.P2P_CREATE_SCREEN}
					component={P2PCreate}
					options={getHeaderOptions('', { animation: 'slide_from_bottom' })}
				/>

				{/* P2P Offer Screen */}
				<Stack.Screen
					name={ROUTES.P2P_OFFER_SCREEN}
					component={P2POffer}
					options={{
						...getHeaderOptions(''),
						// Android fallback
						headerRight: () => (
							<Pressable onPress={() => (navigation as any).navigate(ROUTES.P2P_USER_SCREEN, { uuid: user.uuid })}>
								<QPAvatar user={user} size={32} />
							</Pressable>
						),
						// iOS native header items (liquid glass compatible)
						...(Platform.OS === 'ios' && {
							unstable_headerRightItems: () => [{
								type: 'custom' as const,
								element: (
									<Pressable onPress={() => (navigation as any).navigate(ROUTES.P2P_USER_SCREEN, { uuid: user.uuid })}>
										<QPAvatar user={user} size={28} />
									</Pressable>
								),
								hidesSharedBackground: true,
							}],
						}),
					}}
				/>

				{/* P2P User Profile Screen — no header so cover extends to the status bar (Scan/Profile look) */}
				<Stack.Screen
					name={ROUTES.P2P_USER_SCREEN}
					component={P2PUser}
					options={{
						headerShown: false,
					}}
				/>

				{/* GoldCheck — also reachable from SettingsStack, but registered here so
				    peer profile and other screens can push it directly with a back button */}
				<Stack.Screen
					name={ROUTES.GOLD_CHECK}
					component={GoldCheck}
					options={getHeaderOptions('Hazte GOLD')}
				/>

				{/* Settings Stack */}
				<Stack.Screen
					name={ROUTES.SETTINGS_STACK}
					component={SettingsStack}
					options={{
						animation: 'slide_from_bottom'
					}}
				/>

				{/* Contacts (accessible from Send) */}
				<Stack.Screen
					name={ROUTES.CONTACTS}
					component={Contacts}
					options={getHeaderOptions('Contactos')}
				/>

				{/* Send, Receive and Send Success Screens */}
				<Stack.Screen
					name={ROUTES.SEND}
					component={Send}
					options={getHeaderOptions('Enviar QUSD')}
				/>
				<Stack.Screen
					name={ROUTES.SEND_CONFIRM}
					component={SendConfirm}
					options={getHeaderOptions('Confirmar pago')}
				/>
				<Stack.Screen name={ROUTES.SEND_SUCCESS} component={SendSuccess} />
				<Stack.Screen name={ROUTES.RECEIVE} component={Receive} options={{ headerShown: false, animation: 'slide_from_bottom' }} />

				{/* Transaction Screen */}
				<Stack.Screen
					name={ROUTES.TRANSACTIONS}
					component={Transactions}
					options={getHeaderOptions('Transacciones')}
				/>
				<Stack.Screen
					name={ROUTES.TRANSACTION}
					component={Transaction}
					options={getHeaderOptions('')}
				/>

				{/* Pay Screen — bottom-sheet style, slides from bottom, transparent backdrop */}
				<Stack.Screen
					name={ROUTES.PAY_SCREEN}
					component={Pay}
					options={{
						headerShown: false,
						animation: 'slide_from_bottom',
						presentation: 'transparentModal',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/>

				{/* Savings Screen */}
				<Stack.Screen
					name={ROUTES.SAVINGS_SCREEN}
					component={Savings}
					options={getHeaderOptions('Ahorros')}
				/>

				{/* Stock Detail Screen */}
				<Stack.Screen
					name={ROUTES.STOCK_DETAIL_SCREEN}
					component={StockDetail}
					options={({ route }) => getHeaderOptions(route.params?.name || '')}
				/>

				{/* QR Scan Screen */}
				<Stack.Screen
					name={ROUTES.SCAN_SCREEN}
					component={Scan}
					options={{
						animation: 'slide_from_bottom',
						headerShown: false,
					}}
				/>

				{/* Nearby Pay Screen — AirDrop-style proximity payments radar */}
				<Stack.Screen
					name={ROUTES.NEARBY_PAY}
					component={NearbyPay}
					options={{
						animation: 'slide_from_bottom',
						headerShown: false,
					}}
				/>

				{/* Login and Register Screens */}
				<Stack.Screen
					name={ROUTES.LOGIN_SCREEN}
					component={LoginScreen}
					options={getHeaderOptions('')}
				/>
				<Stack.Screen
					name={ROUTES.REGISTER_SCREEN}
					component={RegisterScreen}
					options={{ ...getHeaderOptions(''), headerBackButtonMenuEnabled: false }}
				/>

				{/* Recover Password Screen */}
				<Stack.Screen
					name={ROUTES.RECOVER_PASSWORD_SCREEN}
					component={RecoverPasswordScreen}
					options={getHeaderOptions('')}
				/>
				<Stack.Screen
					name={ROUTES.RECOVER_2FA_SCREEN}
					component={Recover2FAScreen}
					options={getHeaderOptions('')}
				/>

				{/* Phone Topup Screens */}
				<Stack.Screen
					name={ROUTES.PHONE_TOPUP_INDEX}
					component={PhoneTopupIndex}
					options={getHeaderOptions('Recargas móviles')}
				/>
				<Stack.Screen
					name={ROUTES.PHONE_TOPUP_BRAND}
					component={PhoneTopupBrand}
					options={getHeaderOptions('')}
				/>

				{/* Gift Card Screens */}
				<Stack.Screen
					name={ROUTES.GIFT_CARDS}
					component={GiftCards}
					options={getHeaderOptions('Tarjetas de regalo')}
				/>
				<Stack.Screen
					name={ROUTES.GIFT_CARD_BRAND}
					component={GiftCardBrand}
					options={getHeaderOptions('')}
				/>

				{/* My Purchases Screens */}
				<Stack.Screen
					name={ROUTES.MY_PURCHASES}
					component={MyPurchases}
					options={getHeaderOptions('Mis Compras')}
				/>
				<Stack.Screen
					name={ROUTES.PURCHASE_DETAIL}
					component={PurchaseDetail}
					options={getHeaderOptions('')}
				/>

				{/* Assisted Shopping (Personal Shopper) Screens */}
				<Stack.Screen
					name={ROUTES.ASSISTED_SHOPPING}
					component={AssistedShopping}
					options={getHeaderOptions('Compras asistidas')}
				/>
				<Stack.Screen
					name={ROUTES.ASSISTED_PRODUCT}
					component={AssistedProduct}
					options={getHeaderOptions('')}
				/>
				<Stack.Screen
					name={ROUTES.ASSISTED_CART}
					component={AssistedCart}
					options={getHeaderOptions('Mi carrito')}
				/>
				<Stack.Screen
					name={ROUTES.ASSISTED_CHECKOUT}
					component={AssistedCheckout}
					options={getHeaderOptions('Confirmar compra')}
				/>
				<Stack.Screen
					name={ROUTES.ASSISTED_ORDERS}
					component={AssistedOrders}
					options={getHeaderOptions('Mis pedidos')}
				/>
				<Stack.Screen
					name={ROUTES.ASSISTED_ORDER_DETAIL}
					component={AssistedOrderDetail}
					options={({ route }: any) => getHeaderOptions(route.params?.id ? `Pedido #${route.params.id}` : '')}
				/>

				{/* Accesible Screens */}
				<Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />

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
	return (
		<ThemeProvider settings={settings} updateSettings={updateSettings}>
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
					<SafeAreaProvider>
						<LoadingProvider>
							<AuthProvider>
								<OnlineStatusProvider>
									<SettingsProvider>
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
				</ErrorBoundary>
		</GestureHandlerRootView>
	)
}

export default App
