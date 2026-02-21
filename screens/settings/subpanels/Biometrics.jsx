import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Alert, Switch } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// Biometric utilities
import { getSupportedBiometryType, hasBiometricCredentials, removeBiometricCredentials } from '../../../api/client'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import FaceIDIcon from '../../../ui/particles/FaceIDIcon'

// Notifications
import Toast from 'react-native-toast-message'

// UI
import QPLoader from '../../../ui/particles/QPLoader'

// Biometrics Settings Screen
const Biometrics = () => {

    // Contexts
    const { theme } = useTheme()
    const { updateSettings } = useSettings()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [isLoading, setIsLoading] = useState(true)
    const [biometryType, setBiometryType] = useState(null)
    const [biometricsActive, setBiometricsActive] = useState(false)

    useEffect(() => {
        const checkBiometrics = async () => {
            const type = await getSupportedBiometryType()
            const has = await hasBiometricCredentials()
            setBiometryType(type)
            setBiometricsActive(has)
            setIsLoading(false)
        }
        checkBiometrics()
    }, [])

    const biometricLabel = biometryType === 'FaceID' ? 'Face ID' : biometryType === 'TouchID' ? 'Touch ID' : 'Huella Digital'
    const biometricIcon = biometryType === 'FaceID' ? 'face-smile' : 'fingerprint'

    // Toggle biometrics
    const handleToggle = async (value) => {
        if (!value) {
            Alert.alert(
                `Desactivar ${biometricLabel}`,
                `Ya no podrás usar ${biometricLabel} para iniciar sesión. ¿Continuar?`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Desactivar',
                        style: 'destructive',
                        onPress: async () => {
                            await removeBiometricCredentials()
                            await updateSettings('security', { biometricsEnabled: false })
                            setBiometricsActive(false)
                            Toast.show({ type: 'success', text1: `${biometricLabel} desactivado` })
                        }
                    }
                ]
            )
        } else {
            Alert.alert(biometricLabel, `Para activar ${biometricLabel}, cierra sesión e inicia sesión nuevamente. Se te ofrecerá activarlo después del login.`)
        }
    }

    if (isLoading) return <QPLoader />

    // Device doesn't support biometrics
    if (!biometryType) {
        return (
            <View style={containerStyles.subContainer}>
                <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>
                    <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                        <View style={{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.warning + '20' }}>
                            <FontAwesome6 name="fingerprint" size={48} color={theme.colors.warning} iconStyle="solid" />
                        </View>
                        <Text style={[textStyles.h2, { color: theme.colors.warning, marginTop: 20 }]}>No disponible</Text>
                        <Text style={[textStyles.h4, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 10 }]}>
                            Tu dispositivo no soporta autenticación biométrica
                        </Text>
                    </View>
                </ScrollView>
            </View>
        )
    }

    return (
        <View style={containerStyles.subContainer}>
            <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                <Text style={textStyles.h1}>{biometricLabel}</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    Accede a tu cuenta de forma rápida y segura
                </Text>

                {/* Status icon */}
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                    <View style={{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: biometricsActive ? theme.colors.success + '20' : theme.colors.surface }}>
                        {biometryType === 'FaceID' ? (
                            <FaceIDIcon size={48} color={biometricsActive ? theme.colors.success : theme.colors.tertiaryText} />
                        ) : (
                            <FontAwesome6 name="fingerprint" size={48} color={biometricsActive ? theme.colors.success : theme.colors.tertiaryText} iconStyle="solid" />
                        )}
                    </View>
                    <Text style={[textStyles.h2, { color: biometricsActive ? theme.colors.success : theme.colors.tertiaryText, marginTop: 20 }]}>
                        {biometricsActive ? 'Activo' : 'Inactivo'}
                    </Text>
                </View>

                {/* Toggle */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        {biometryType === 'FaceID' ? (
                            <View style={{ marginRight: 12 }}><FaceIDIcon size={20} color={theme.colors.primary} /></View>
                        ) : (
                            <FontAwesome6 name="fingerprint" size={18} style={{ color: theme.colors.primary, marginRight: 12 }} />
                        )}
                        <Text style={[textStyles.h4, { marginBottom: 0 }]}>Acceder con {biometricLabel}</Text>
                    </View>
                    <Switch value={biometricsActive} onValueChange={handleToggle} trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }} />
                </View>

                {/* Info */}
                <View style={[containerStyles.card, { marginTop: 20 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                        <FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
                        <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                            Tus credenciales se almacenan de forma segura en el dispositivo, protegidas por {biometricLabel}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                        <FontAwesome6 name="bolt" size={16} color={theme.colors.primary} iconStyle="solid" />
                        <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                            Inicia sesión al instante sin escribir tu correo y contraseña
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <FontAwesome6 name="circle-info" size={16} color={theme.colors.primary} iconStyle="solid" />
                        <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                            Si cambias tu contraseña, deberás activar {biometricLabel} de nuevo
                        </Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    )
}

export default Biometrics
