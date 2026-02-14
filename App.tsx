// React Components
import { Pressable } from 'react-native'
import React, { useEffect, useState } from 'react'

// Navigation Components
import { NavigationContainer, useNavigation } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

// Auth Context
import { AuthProvider, useAuth } from './auth/AuthContext'

// Settings Context
import { SettingsProvider, useSettings } from './settings/SettingsContext'

// Theme Provider
import { ThemeProvider } from './theme/ThemeContext'
import { useTheme } from './theme/ThemeContext'
import { createContainerStyles } from './theme/themeUtils'

// Routes
import { ROUTES } from './routes'

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

// Settings Stack
import SettingsStack from './screens/settings/SettingsStack'

// Notifications
import Toast from 'react-native-toast-message'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI Components
import QPAvatar from './ui/particles/QPAvatar'

// Custom Back Button Component for consistent navigation
const BackButton = ({ onPress, color }: { onPress: () => void; color: string }) => (
	<Pressable onPress={onPress} style={{ padding: 8, marginLeft: -8 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} >
		<FontAwesome6 name="arrow-left" size={22} color={color} iconStyle="solid" />
	</Pressable>
)

// Main App Navigator Component
const AppNavigator = () => {

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)

	// Consistent header options with custom back button
	const getHeaderOptions = (title: string, options?: {
		animation?: 'slide_from_right' | 'slide_from_bottom' | 'slide_from_left' | 'none';
		headerRight?: () => React.ReactNode;
	}) => ({
		headerTitle: title,
		headerTitleAlign: 'center' as const,
		headerShown: true,
		headerBackVisible: false,
		headerShadowVisible: false,
		animation: options?.animation || 'slide_from_right' as const,
		headerLeft: () => (
			<BackButton onPress={() => navigation.goBack()} color={theme.colors.primaryText} />
		),
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
				navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_STACK as never }] })
			} else if (!isAuthenticated && !firstTime && currentRoute !== ROUTES.WELCOME_SCREEN) {
				navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN as never }] })
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [splashReady, authLoading, settingsLoading, isAuthenticated, firstTime])

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
				options={getHeaderOptions('', {
					headerRight: () => (
						<Pressable style={containerStyles.headerRight} onPress={() => { }}>
							<QPAvatar user={user} size={32} />
						</Pressable>
					)
				})}
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
				options={getHeaderOptions('Transacciones', {
					headerRight: () => (
						<Pressable style={containerStyles.headerRight} onPress={(() => { })}>
							<FontAwesome6 name="filter" size={20} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					)
				})}
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
					headerTitle: '',
					animation: 'slide_from_bottom',		// slide_from_left but check white background issue
					headerShown: false,
					headerBackVisible: false,
					headerShadowVisible: false,
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
	return (
		<AuthProvider>
			<SettingsProvider>
				<ThemeProviderWithSettings>
					<NavigationContainer>
						<AppNavigator />
						<Toast position="top" topOffset={40} />
					</NavigationContainer>
				</ThemeProviderWithSettings>
			</SettingsProvider>
		</AuthProvider>
	)
}

export default App
