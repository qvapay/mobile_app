// React Components
import { Linking, Platform, Pressable } from 'react-native'
import React, { useEffect, useRef, useState } from 'react'

// Navigation Components
import { NavigationContainer, useNavigation } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/AuthContext'

// Settings Context
import { SettingsProvider, useSettings } from './settings/SettingsContext'

// App Lock
import { AppLockProvider } from './lock/AppLockContext'
import LockScreen from './lock/LockScreen'

// Theme Provider
import { ThemeProvider } from './theme/ThemeContext'
import { useTheme } from './theme/ThemeContext'
import { createContainerStyles } from './theme/themeUtils'

// Routes
import { ROUTES } from './routes'

// Deep Linking
import linking from './linking'

// Screens without auth
import SplashScreen from './screens/splash/Splash'
import WelcomeScreen from './screens/welcome/Welcome'
import HelpScreen from './screens/help/Help'
import LoginScreen from './auth/screens/Login'
import RegisterScreen from './auth/screens/Register'
import RecoverPasswordScreen from './auth/screens/RecoverPassword'
import Recover2FAScreen from './auth/screens/Recover2FA'

// Screens with auth
import Onboard from './screens/onboard/Onboard'
import MainStack from './screens/MainStack'
import Send from './screens/transaction/Send'
import SendConfirm from './screens/transaction/SendConfirm'
import SendSuccess from './screens/transaction/SendSuccess'
import Receive from './screens/transaction/Receive'
import Transaction from './screens/transaction/Transaction'
import Transactions from './screens/transaction/Transactions'
import P2PCreate from './screens/p2p/P2PCreate'
import P2POffer from './screens/p2p/P2POffer'
import Scan from './screens/scan/Scan'

// InOut Screens
import Add from './screens/add/Add'
import Withdraw from './screens/withdraw/Withdraw'

// Store Screens
import PhoneTopupIndex from './screens/store/PhoneTopupIndex'
import PhoneTopupPurchase from './screens/store/PhoneTopupPurchase'
import GiftCards from './screens/store/GiftCards'
import GiftCardDetail from './screens/store/GiftCardDetail'
import MyPurchases from './screens/store/MyPurchases'
import PurchaseDetail from './screens/store/PurchaseDetail'

// Settings Stack
import SettingsStack from './screens/settings/SettingsStack'

// Notifications
import Toast from 'react-native-toast-message'

// UI Components
import QPAvatar from './ui/particles/QPAvatar'
import ErrorBoundary from './ui/ErrorBoundary'

// Parse P2P UUID from a deep link URL
const parseP2PUuid = (url: string): string | null => {
	const match = url.match(/\/p2p\/([^/?#]+)/)
	if (match) return match[1]
	const schemeMatch = url.match(/qvapay:\/\/p2p\/([^/?#]+)/)
	if (schemeMatch) return schemeMatch[1]
	return null
}

// Main App Navigator Component
const AppNavigator = ({ pendingDeepLinkRef }: { pendingDeepLinkRef: React.RefObject<string | null> }) => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)

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

	// State to control minimum splash screen time
	const [splashReady, setSplashReady] = useState(false)

	// Check if this is the first time using the app
	const { appearance, isLoading: settingsLoading } = useSettings()
	const firstTime = appearance.firstTime

	// Navigation
	const navigation = useNavigation()

	// Auth Context
	const { user } = useAuth()
	const { isAuthenticated, isLoading: authLoading } = useAuth()
	useEffect(() => {
		const timer = setTimeout(() => {
			setSplashReady(true)
		}, 2000)
		return () => clearTimeout(timer)
	}, [])

	// Navigation handler for auth state changes
	// Only re-run when auth state actually changes, not on settings/theme changes
	useEffect(() => {
		if (splashReady && !authLoading && !settingsLoading) {
			const currentRoute = navigation.getState()?.routes[navigation.getState()?.index || 0]?.name
			if (isAuthenticated && !firstTime && currentRoute !== ROUTES.MAIN_STACK) {
				// Check for a pending deep link after login
				const pendingUrl = pendingDeepLinkRef.current
				if (pendingUrl) {
					pendingDeepLinkRef.current = null
					const uuid = parseP2PUuid(pendingUrl)
					if (uuid) {
						navigation.reset({
							index: 1,
							routes: [
								{ name: ROUTES.MAIN_STACK as never },
								{ name: ROUTES.P2P_OFFER_SCREEN as never, params: { p2p_uuid: uuid } as never },
							],
						})
						return
					}
				}
				navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_STACK as never }] })
			} else if (!isAuthenticated && !firstTime && currentRoute !== ROUTES.WELCOME_SCREEN) {
				// Capture the current deep link URL before resetting to Welcome
				Linking.getInitialURL().then((url) => {
					if (url && parseP2PUuid(url)) {
						pendingDeepLinkRef.current = url
						Toast.show({ type: 'info', text1: 'Inicia sesión para ver la oferta P2P' })
					}
				})
				navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN as never }] })
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [splashReady, authLoading, settingsLoading, isAuthenticated, firstTime])

	// Listen for foreground deep links while unauthenticated
	useEffect(() => {
		const subscription = Linking.addEventListener('url', ({ url }) => {
			if (!isAuthenticated && url && parseP2PUuid(url)) {
				pendingDeepLinkRef.current = url
				Toast.show({ type: 'info', text1: 'Inicia sesión para ver la oferta P2P' })
			}
		})
		return () => subscription.remove()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isAuthenticated])

	// Show splash screen if still loading or if minimum time hasn't passed
	if (authLoading || settingsLoading || !splashReady) { return <SplashScreen /> }

	// Show unauthenticated screens (welcome, login, register)
	return (
		<Stack.Navigator
			initialRouteName={firstTime ? ROUTES.ONBOARD_SCREEN : isAuthenticated ? ROUTES.MAIN_STACK : ROUTES.WELCOME_SCREEN}
			screenOptions={{
				headerShown: false,
				headerStyle: { backgroundColor: theme.colors.background },
				headerShadowVisible: false,
				headerBackButtonDisplayMode: 'minimal',
				headerTintColor: theme.colors.primaryText
			}}
		>
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
						<Pressable style={containerStyles.headerRight} onPress={() => { }}>
							<QPAvatar user={user} size={32} />
						</Pressable>
					),
					// iOS native header items (liquid glass compatible)
					...(Platform.OS === 'ios' && {
						unstable_headerRightItems: () => [{
							type: 'custom' as const,
							element: <QPAvatar user={user} size={28} />,
							hidesSharedBackground: true,
						}],
					}),
				}}
			/>

			{/* Settings Stack */}
			<Stack.Screen
				name={ROUTES.SETTINGS_STACK}
				component={SettingsStack}
				options={{
					animation: 'slide_from_bottom'
				}}
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
			<Stack.Screen name={ROUTES.RECEIVE} component={Receive} options={getHeaderOptions('Recibir')} />

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

			{/* QR Scan Screen */}
			<Stack.Screen
				name={ROUTES.SCAN_SCREEN}
				component={Scan}
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
				options={getHeaderOptions('')}
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
				options={getHeaderOptions('Recargas telefónicas')}
			/>
			<Stack.Screen
				name={ROUTES.PHONE_TOPUP_PURCHASE}
				component={PhoneTopupPurchase}
				options={getHeaderOptions('Comprar recarga')}
			/>

			{/* Gift Card Screens */}
			<Stack.Screen
				name={ROUTES.GIFT_CARDS}
				component={GiftCards}
				options={getHeaderOptions('Tarjetas de regalo')}
			/>
			<Stack.Screen
				name={ROUTES.GIFT_CARD_DETAIL}
				component={GiftCardDetail}
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

			{/* Accesible Screens */}
			<Stack.Screen name={ROUTES.HELP_SCREEN} component={HelpScreen} />

		</Stack.Navigator>
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

function App() {
	const pendingDeepLinkRef = useRef<string | null>(null)

	return (
		<ErrorBoundary>
			<SafeAreaProvider>
				<AuthProvider>
					<SettingsProvider>
						<ThemeProviderWithSettings>
							<AppLockProvider>
								<NavigationContainer linking={linking as any}>
									<AppNavigator pendingDeepLinkRef={pendingDeepLinkRef} />
									<Toast position="top" topOffset={40} />
								</NavigationContainer>
								<LockScreen />
							</AppLockProvider>
						</ThemeProviderWithSettings>
					</SettingsProvider>
				</AuthProvider>
			</SafeAreaProvider>
		</ErrorBoundary>
	)
}

export default App
