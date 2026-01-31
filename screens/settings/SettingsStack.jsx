import { Pressable } from 'react-native'

// Navigation
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
const Stack = createNativeStackNavigator()

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Settings Menu
import SettingsMenu from './SettingsMenu'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Gold Check Screens
import GoldCheck from './subpanels/GoldCheck'
import Referals from './subpanels/Referals'
import Theme from './subpanels/Theme'
import Userdata from './subpanels/Userdata'
import Phone from './subpanels/Phone'
import Telegram from './subpanels/Telegram'
import Password from './subpanels/Password'
import TwoFactor from './subpanels/TwoFactor'
import KYC from './subpanels/KYC'
import DeleteAccount from './subpanels/DeleteAccount'
import Notifications from './subpanels/Notifications'
import PaymentMethods from './subpanels/PaymentMethods'
import Contacts from './subpanels/Contacts'

// Custom Back Button Component
const BackButton = ({ color }) => {
	const navigation = useNavigation()
	return (
		<Pressable onPress={() => navigation.goBack()} style={{ padding: 8, marginLeft: -8 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} >
			<FontAwesome6 name="arrow-left" size={22} color={color} iconStyle="solid" />
		</Pressable>
	)
}

// Settings Stack
const SettingsStack = ({ navigation }) => {

	// Contexts
	const { theme } = useTheme()

	// Common header options with custom back button
	const headerWithBack = {
		headerLeft: () => <BackButton color={theme.colors.primaryText} />
	}

	return (
		<Stack.Navigator
			initialRouteName={ROUTES.SETTINGS_MENU}
			screenOptions={{
				headerTitle: '',
				headerShown: true,
				headerStyle: {
					backgroundColor: theme.colors.background,
				},
				headerTintColor: theme.colors.primaryText,
				headerShadowVisible: false,
				headerBackVisible: false,
			}}
		>

			<Stack.Screen
				name={ROUTES.SETTINGS_MENU}
				component={SettingsMenu}
				options={{
					...headerWithBack,
					headerRight: () => (
						<Pressable onPress={() => navigation.navigate(ROUTES.SCAN_SCREEN, { view: 'show' })}>
							<FontAwesome6 name="qrcode" size={24} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					)
				}}
			/>

			<Stack.Screen
				name={ROUTES.GOLD_CHECK}
				component={GoldCheck}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.REFERALS}
				component={Referals}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.THEME}
				component={Theme}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.USERDATA}
				component={Userdata}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.PHONE}
				component={Phone}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.TELEGRAM}
				component={Telegram}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.PASSWORD}
				component={Password}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.TWO_FACTOR}
				component={TwoFactor}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.KYC}
				component={KYC}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.DELETE_ACCOUNT}
				component={DeleteAccount}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.NOTIFICATIONS}
				component={Notifications}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.PAYMENT_METHODS}
				component={PaymentMethods}
				options={headerWithBack}
			/>

			<Stack.Screen
				name={ROUTES.CONTACTS}
				component={Contacts}
				options={headerWithBack}
			/>

		</Stack.Navigator>
	)
}

export default SettingsStack