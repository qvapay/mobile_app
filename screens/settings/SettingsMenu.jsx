import { View, Text, Alert, ScrollView, Image, Pressable, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme 
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'
import SettingsSection from '../../ui/SettingsSection'

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

    // require('../../assets/images/ui/qvapay-logo-white.png' on theme depends
    const qvapayLogo = theme.mode === 'dark' ? require('../../assets/images/ui/qvapay-logo-white.png') : require('../../assets/images/ui/logo-qvapay.png')

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

            <View style={{ alignItems: 'center', marginVertical: 20 }}>
                <QPAvatar size={120} user={user} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 15 }}>
                    <Text style={[textStyles.h1, { marginVertical: 0, paddingVertical: 0 }]}>{user.name}</Text>
                    {user.kyc && (<Image source={require('../../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />)}
                    {user.golden_check && (<Image source={require('../../assets/images/ui/gold-badge.png')} style={{ width: 20, height: 20 }} />)}
                    {user.role == 'admin' && (<Image source={qvapayLogo} style={{ width: 20, height: 20 }} />)}
                </View>
                <Text style={[textStyles.h2, { color: theme.colors.secondaryText, marginVertical: 0, marginTop: -10, paddingVertical: 0 }]}>@{user.username}</Text>
            </View>

            {/* Gold Check Card */}
            <Pressable style={containerStyles.box} onPress={() => navigation.navigate(ROUTES.GOLD_CHECK)}>
                <Image source={require('../../assets/images/ui/gold-badge.png')} style={{ width: 80, height: 80 }} />
                <View>
                    <Text style={textStyles.h3}>GOLD CHECK</Text>
                    {user.golden_check ? <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>Ver mi suscripción</Text> : <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>Comprar GOLD Check</Text>}
                </View>
            </Pressable>

            {/* Referal invitation Card */}
            {/* TODO: Replace Image */}
            <Pressable style={[containerStyles.box, { marginVertical: 10 }]} onPress={() => navigation.navigate(ROUTES.REFERAL_INVITATION)}>
                <Image source={require('../../assets/images/ui/referals.png')} style={{ width: 80, height: 80 }} />
                <View>
                    <Text style={[textStyles.h3, { color: theme.colors.primaryText }]}>INVITAR AMIGOS</Text>
                    <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>Invita y gana premios únicos</Text>
                </View>
            </Pressable>

            {Object.entries(settings).map(([categoryKey, category]) => (
                <SettingsSection key={categoryKey} title={category.title} items={category.options} navigation={navigation} />
            ))}

            <QPButton title="Cerrar sesión" onPress={handleLogout} style={{ backgroundColor: theme.colors.danger, marginTop: 20 }} textStyle={{ color: theme.colors.primaryText }} />

            {/* Github, Twitter and Instagram accounts */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 20 }}>
                <Pressable onPress={() => Linking.openURL('https://github.com/qvapay/mobile_app')}>
                    <FontAwesome6 name="github" size={24} style={{ color: 'white' }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://twitter.com/qvapay')}>
                    <FontAwesome6 name="x-twitter" size={24} style={{ color: 'white' }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://instagram.com/qvapay')}>
                    <FontAwesome6 name="instagram" size={24} style={{ color: 'white' }} iconStyle="brand" />
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