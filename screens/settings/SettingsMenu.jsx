import { View, Text, Alert, ScrollView, Pressable, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme 
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import SettingsSection from '../../ui/SettingsSection'
import ProfileContainer from '../../ui/ProfileContainer'

// Import settings
import settings from './settings'

// Routes
import { ROUTES } from '../../routes'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Constants
import DeviceInfo from 'react-native-device-info'
const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()

// Settings Menu
const SettingsMenu = ({ navigation }) => {

    // Contexts
    const { user, logout } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // Logout function
    const handleLogout = async () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Estás seguro de querer cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Salir',
                    style: 'destructive',
                    onPress: async () => {
                        const result = await logout()
                        console.log('🔐 Logout result:', result)
                        navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
                        if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión. Por favor, inténtalo de nuevo.') }
                    }
                }
            ]
        )
    }

    return (
        <ScrollView style={containerStyles.subContainer}>

            <ProfileContainer user={user} />

            {Object.entries(settings).map(([categoryKey, category]) => (
                <SettingsSection key={categoryKey} title={category.title} items={category.options} navigation={navigation} />
            ))}

            <QPButton title="Cerrar sesión" onPress={handleLogout} style={{ backgroundColor: theme.colors.danger, marginTop: 20 }} textStyle={{ color: theme.colors.almostWhite }} />

            {/* Github, Twitter and Instagram accounts */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 20 }}>
                <Pressable onPress={() => Linking.openURL('https://t.me/qvapay')}>
                    <FontAwesome6 name="telegram" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://github.com/qvapay/mobile_app')}>
                    <FontAwesome6 name="github" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://twitter.com/qvapay')}>
                    <FontAwesome6 name="x-twitter" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://instagram.com/qvapay')}>
                    <FontAwesome6 name="instagram" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://youtube.com/@qvapay')}>
                    <FontAwesome6 name="youtube" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
                </Pressable>
            </View>

            <Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 20, marginBottom: insets.bottom }]}>
                {`QvaPay © ${new Date().getFullYear()} \n`}
                {`v ${version} build ${buildNumber}\n`}
                {`Todos los derechos reservados`}
            </Text>

        </ScrollView>
    )
}

export default SettingsMenu