import { useState, useEffect } from 'react'
import { View, Text, Alert, ScrollView, Pressable, Linking, Platform, ActionSheetIOS } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import SettingsSection from '../../ui/SettingsSection'
import ProfileContainer from '../../ui/ProfileContainer'

// Biometric utilities
import { hasBiometricCredentials, removeBiometricCredentials } from '../../api/client'

// API
import { userApi } from '../../api/userApi'

// Image Picker
import { launchCamera, launchImageLibrary } from 'react-native-image-picker'

// Import settings
import settings from './settings'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'

// Routes
import { ROUTES } from '../../routes'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// Constants
import DeviceInfo from 'react-native-device-info'
const version = DeviceInfo.getVersion()
const buildNumber = DeviceInfo.getBuildNumber()

// Settings Menu
const SettingsMenu = ({ navigation }) => {

    // Contexts
    const { user, logout, updateUser } = useAuth()
    const { updateSettings } = useSettings()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // Push prompt
    const { shouldShowRedDot } = usePushPrompt()

    // Biometric state for logout flow
    const [biometricsActive, setBiometricsActive] = useState(false)

    useEffect(() => {
        const checkBiometrics = async () => {
            const has = await hasBiometricCredentials()
            setBiometricsActive(has)
        }
        checkBiometrics()
    }, [])

    // Image picker options
    const imagePickerOptions = { mediaType: 'photo', maxWidth: 512, maxHeight: 512, quality: 0.8, includeBase64: false }

    // Handle avatar upload from picker result
    const processAvatarUpload = async (response) => {
        if (response.didCancel || response.errorCode) return
        const asset = response.assets?.[0]
        if (!asset) return

        Toast.show({ type: 'info', text1: 'Subiendo foto...', autoHide: false })
        const result = await userApi.uploadAvatar({
            file: { uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'avatar.jpg' }
        })
        Toast.hide()

        if (result.success) {
            updateUser({ image: result.data?.data?.path })
            Toast.show({ type: 'success', text1: 'Foto actualizada' })
        } else {
            Toast.show({ type: 'error', text1: 'Error', text2: result.error || 'No se pudo subir la imagen' })
        }
    }

    // Edit avatar handler
    const handleEditAvatar = () => {
        const options = ['Tomar foto', 'Elegir de galería', 'Cancelar']
        const cancelButtonIndex = 2

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options, cancelButtonIndex },
                (buttonIndex) => {
                    if (buttonIndex === 0) launchCamera(imagePickerOptions, processAvatarUpload)
                    else if (buttonIndex === 1) launchImageLibrary(imagePickerOptions, processAvatarUpload)
                }
            )
        } else {
            Alert.alert('Cambiar foto de perfil', null, [
                { text: 'Tomar foto', onPress: () => launchCamera(imagePickerOptions, processAvatarUpload) },
                { text: 'Elegir de galería', onPress: () => launchImageLibrary(imagePickerOptions, processAvatarUpload) },
                { text: 'Cancelar', style: 'cancel' },
            ])
        }
    }

    // Logout function
    const handleLogout = async () => {
        if (biometricsActive) {
            Alert.alert(
                'Cerrar sesión',
                '¿Deseas mantener el acceso biométrico para la próxima vez?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Mantener biometría',
                        onPress: async () => {
                            const result = await logout()
                            navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
                            if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión.') }
                        }
                    },
                    {
                        text: 'Eliminar todo',
                        style: 'destructive',
                        onPress: async () => {
                            await removeBiometricCredentials()
                            await updateSettings('security', { biometricsEnabled: false })
                            const result = await logout()
                            navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
                            if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión.') }
                        }
                    }
                ]
            )
        } else {
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
                            navigation.reset({ index: 0, routes: [{ name: ROUTES.WELCOME_SCREEN }] })
                            if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión. Por favor, inténtalo de nuevo.') }
                        }
                    }
                ]
            )
        }
    }

    return (
        <ScrollView style={containerStyles.subContainer}>

            <ProfileContainer user={user} onEditAvatar={handleEditAvatar} />

            {Object.entries(settings).map(([categoryKey, category]) => {
                const items = categoryKey === 'notifications' && shouldShowRedDot
                    ? category.options.map(opt => ({ ...opt, showBadge: true }))
                    : category.options
                return <SettingsSection key={categoryKey} title={category.title} items={items} navigation={navigation} />
            })}

            <QPButton title="Cerrar sesión" onPress={handleLogout} style={{ backgroundColor: theme.colors.danger, marginTop: 20 }} textStyle={{ color: theme.colors.almostWhite }} />

            {/* Github, Twitter and Instagram accounts */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 20 }}>
                <Pressable onPress={() => Linking.openURL('https://t.me/qvapay')}>
                    <FontAwesome6 name="telegram" size={24} style={{ color: theme.colors.contrast }} iconStyle="brand" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL('https://github.com/qvapay')}>
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