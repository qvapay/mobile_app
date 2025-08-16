import { Pressable } from 'react-native'

// Navigation   
import { createNativeStackNavigator } from '@react-navigation/native-stack'
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
import Referal from './subpanels/Referal'
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

// Settings Stack
const SettingsStack = ({ navigation }) => {

    // Contexts
    const { theme } = useTheme()

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
                headerLeft: () => (
                    <Pressable onPress={() => navigation.goBack()}>
                        <FontAwesome6 name="arrow-left" size={24} color={theme.colors.primaryText} iconStyle="solid" />
                    </Pressable>
                )
            }}
        >

            <Stack.Screen
                name={ROUTES.SETTINGS_MENU}
                component={SettingsMenu}
            />

            <Stack.Screen
                name={ROUTES.GOLD_CHECK}
                component={GoldCheck}
            />

            <Stack.Screen
                name={ROUTES.REFERAL}
                component={Referal}
            />

            <Stack.Screen
                name={ROUTES.THEME}
                component={Theme}
            />

            <Stack.Screen
                name={ROUTES.USERDATA}
                component={Userdata}
            />

            <Stack.Screen
                name={ROUTES.PHONE}
                component={Phone}
            />

            <Stack.Screen
                name={ROUTES.TELEGRAM}
                component={Telegram}
            />

            <Stack.Screen
                name={ROUTES.PASSWORD}
                component={Password}
            />

            <Stack.Screen
                name={ROUTES.TWO_FACTOR}
                component={TwoFactor}
            />

            <Stack.Screen
                name={ROUTES.KYC}
                component={KYC}
            />

            <Stack.Screen
                name={ROUTES.DELETE_ACCOUNT}
                component={DeleteAccount}
            />

            <Stack.Screen
                name={ROUTES.NOTIFICATIONS}
                component={Notifications}
            />

            <Stack.Screen
                name={ROUTES.PAYMENT_METHODS}
                component={PaymentMethods}
            />

            <Stack.Screen
                name={ROUTES.CONTACTS}
                component={Contacts}
            />

        </Stack.Navigator>
    )
}

export default SettingsStack