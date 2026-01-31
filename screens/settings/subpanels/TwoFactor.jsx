import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, Alert, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import Toast from 'react-native-toast-message'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'

// Clipboard
import { copyTextToClipboard } from '../../../helpers'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Two Factor Component
const TwoFactor = () => {

    // Contexts
    const { updateUser } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(true)
    const [is2FAEnabled, setIs2FAEnabled] = useState(false)

    // Setup states
    const [isSettingUp, setIsSettingUp] = useState(false)
    const [secret, setSecret] = useState('')
    const [otpauthUrl, setOtpauthUrl] = useState('')
    const [verificationCode, setVerificationCode] = useState('')

    // Load user data on component mount
    useEffect(() => {
        loadUserData()
    }, [])

    // Load user data from API
    const loadUserData = async () => {
        try {
            setIsLoadingData(true)
            const result = await userApi.getUserProfile()
            if (result.success && result.data) {
                // Check if 2FA is enabled (two_factor_secret is '***' if enabled)
                setIs2FAEnabled(result.data.two_factor_secret === '***')
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error al cargar datos', text2: error.message })
        } finally {
            setIsLoadingData(false)
        }
    }

    // Generate 2FA secret
    const handleGenerate2FA = async () => {
        try {
            setIsLoading(true)
            const result = await userApi.generate2FA()

            if (result.success && result.data) {
                setSecret(result.data.secret)
                setOtpauthUrl(result.data.otpauth_url)
                setIsSettingUp(true)
                Toast.show({ type: 'success', text1: 'Secreto generado', text2: 'Escanea el código QR con tu app de autenticación' })
            } else {
                Toast.show({ type: 'error', text1: 'Error', text2: result.error || 'No se pudo generar el código 2FA' })
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    // Activate 2FA
    const handleActivate2FA = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Ingresa un código de 6 dígitos' })
            return
        }

        try {
            setIsLoading(true)
            const result = await userApi.activate2FA({ code: verificationCode, secret })

            if (result.success) {
                setIs2FAEnabled(true)
                setIsSettingUp(false)
                setSecret('')
                setOtpauthUrl('')
                setVerificationCode('')

                // Update user context
                if (updateUser) {
                    updateUser({ two_factor_secret: '***' })
                }

                Toast.show({ type: 'success', text1: '2FA Activado', text2: 'Tu cuenta ahora está protegida con autenticación de dos factores' })
            } else {
                Toast.show({ type: 'error', text1: 'Código inválido', text2: result.error || 'El código ingresado no es válido' })
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    // Deactivate 2FA
    const handleDeactivate2FA = async () => {
        Alert.alert(
            'Desactivar 2FA',
            '¿Estás seguro de que quieres desactivar la autenticación de dos factores? Tu cuenta será menos segura.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desactivar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsLoading(true)
                            const result = await userApi.deactivate2FA()

                            if (result.success) {
                                setIs2FAEnabled(false)

                                // Update user context
                                if (updateUser) {
                                    updateUser({ two_factor_secret: null })
                                }

                                Toast.show({ type: 'success', text1: '2FA Desactivado', text2: 'La autenticación de dos factores ha sido desactivada' })
                            } else {
                                Toast.show({ type: 'error', text1: 'Error', text2: result.error || 'No se pudo desactivar el 2FA' })
                            }
                        } catch (error) {
                            Toast.show({ type: 'error', text1: 'Error', text2: error.message })
                        } finally {
                            setIsLoading(false)
                        }
                    }
                }
            ]
        )
    }

    // Cancel setup
    const handleCancelSetup = () => {
        setIsSettingUp(false)
        setSecret('')
        setOtpauthUrl('')
        setVerificationCode('')
    }

    // Copy secret to clipboard
    const handleCopySecret = () => {
        copyTextToClipboard(secret)
        Toast.show({ type: 'success', text1: 'Copiado', text2: 'Secreto copiado al portapapeles' })
    }

    // Loading state
    if (isLoadingData) {
        return <QPLoader />
    }

    // 2FA is enabled - show status
    if (is2FAEnabled && !isSettingUp) {
        return (
            <View style={containerStyles.subContainer}>
                <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                    <View style={styles.statusContainer}>
                        <View style={[styles.statusIcon, { backgroundColor: theme.colors.success + '20' }]}>
                            <FontAwesome6 name="shield-halved" size={48} color={theme.colors.success} iconStyle="solid" />
                        </View>

                        <Text style={[textStyles.h1, { color: theme.colors.success, marginTop: 20 }]}>
                            2FA Activo
                        </Text>

                        <Text style={[textStyles.h4, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 10 }]}>
                            Tu cuenta está protegida con autenticación de dos factores
                        </Text>
                    </View>

                    <View style={[containerStyles.card, { marginTop: 30 }]}>
                        <View style={styles.infoRow}>
                            <FontAwesome6 name="circle-check" size={20} color={theme.colors.success} iconStyle="solid" />
                            <Text style={[textStyles.body, { color: theme.colors.primaryText, marginLeft: 12, flex: 1 }]}>
                                Cada vez que inicies sesión, necesitarás un código de tu app de autenticación
                            </Text>
                        </View>
                    </View>

                    <View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
                        <QPButton
                            title="Desactivar 2FA"
                            onPress={handleDeactivate2FA}
                            loading={isLoading}
                            disabled={isLoading}
                            style={{ backgroundColor: theme.colors.danger }}
                            textStyle={{ color: theme.colors.almostWhite }}
                        />
                    </View>

                </ScrollView>
            </View>
        )
    }

    // Setting up 2FA - show QR code
    if (isSettingUp) {
        return (
            <View style={containerStyles.subContainer}>
                <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                    <Text style={textStyles.h1}>Configurar 2FA</Text>
                    <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>
                        Escanea el código QR con tu app de autenticación (Google Authenticator, Authy, etc.)
                    </Text>

                    {/* QR Code */}
                    <View style={[styles.qrContainer, { backgroundColor: theme.colors.almostWhite }]}>
                        <QRCodeStyled
                            data={otpauthUrl}
                            style={{ backgroundColor: 'white' }}
                            pieceSize={6}
                            padding={20}
                            color={theme.colors.almostBlack}
                        />
                    </View>

                    {/* Manual secret */}
                    <View style={[containerStyles.card, { marginTop: 20 }]}>
                        <Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
                            O ingresa este código manualmente:
                        </Text>
                        <Pressable onPress={handleCopySecret} style={styles.secretContainer}>
                            <Text style={[styles.secretText, { color: theme.colors.primary }]} selectable>
                                {secret}
                            </Text>
                            <FontAwesome6 name="copy" size={16} color={theme.colors.primary} iconStyle="regular" />
                        </Pressable>
                    </View>

                    {/* Verification code input */}
                    <View style={{ marginTop: 20 }}>
                        <Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
                            Ingresa el código de 6 dígitos de tu app:
                        </Text>
                        <QPInput
                            value={verificationCode}
                            onChangeText={(text) => setVerificationCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                            placeholder="000000"
                            keyboardType="number-pad"
                            maxLength={6}
                            prefixIconName="key"
                            style={styles.codeInput}
                        />
                    </View>

                    <View style={[containerStyles.bottomButtonContainer, { gap: 10, paddingBottom: insets.bottom + 16 }]}>
                        <QPButton
                            title="Activar 2FA"
                            onPress={handleActivate2FA}
                            loading={isLoading}
                            disabled={isLoading || verificationCode.length !== 6}
                            textStyle={{ color: theme.colors.almostWhite }}
                        />
                        <QPButton
                            title="Cancelar"
                            onPress={handleCancelSetup}
                            disabled={isLoading}
                            style={{ backgroundColor: theme.colors.surface }}
                            textStyle={{ color: theme.colors.primaryText }}
                        />
                    </View>

                </ScrollView>
            </View>
        )
    }

    // 2FA not enabled - show setup option
    return (
        <View style={containerStyles.subContainer}>
            <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                <Text style={textStyles.h1}>Autenticación de Dos Factores</Text>
                <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>
                    Añade una capa extra de seguridad a tu cuenta
                </Text>

                <View style={[styles.statusContainer, { marginTop: 30 }]}>
                    <View style={[styles.statusIcon, { backgroundColor: theme.colors.warning + '20' }]}>
                        <FontAwesome6 name="shield" size={48} color={theme.colors.warning} iconStyle="solid" />
                    </View>

                    <Text style={[textStyles.h2, { color: theme.colors.warning, marginTop: 20 }]}>
                        2FA No Activo
                    </Text>
                </View>

                <View style={[containerStyles.card, { marginTop: 30 }]}>
                    <Text style={[textStyles.h4, { color: theme.colors.primaryText, marginBottom: 12 }]}>
                        Beneficios del 2FA:
                    </Text>

                    <View style={styles.benefitRow}>
                        <FontAwesome6 name="lock" size={16} color={theme.colors.primary} iconStyle="solid" />
                        <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                            Protege tu cuenta incluso si alguien conoce tu contraseña
                        </Text>
                    </View>

                    <View style={styles.benefitRow}>
                        <FontAwesome6 name="mobile-screen" size={16} color={theme.colors.primary} iconStyle="solid" />
                        <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                            Usa apps como Google Authenticator o Authy
                        </Text>
                    </View>

                    <View style={styles.benefitRow}>
                        <FontAwesome6 name="clock" size={16} color={theme.colors.primary} iconStyle="solid" />
                        <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                            Códigos que cambian cada 30 segundos
                        </Text>
                    </View>
                </View>

                <View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
                    <QPButton
                        title="Configurar 2FA"
                        onPress={handleGenerate2FA}
                        loading={isLoading}
                        disabled={isLoading}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                </View>

            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    statusContainer: {
        alignItems: 'center',
        paddingVertical: 30
    },
    statusIcon: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center'
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12
    },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        padding: 20,
        borderRadius: 16,
        alignSelf: 'center'
    },
    secretContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(103, 89, 239, 0.1)'
    },
    secretText: {
        fontFamily: 'Rubik-Medium',
        fontSize: 14,
        letterSpacing: 1,
        flex: 1,
        marginRight: 10
    },
    codeInput: {
        textAlign: 'center',
        fontSize: 24,
        letterSpacing: 8
    }
})

export default TwoFactor
