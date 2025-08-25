import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native'

// Auth Context
import { useAuth } from '../AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'

// Notifications
import Toast from 'react-native-toast-message'

// Routes
import { ROUTES } from '../../routes'

// Login Screen
const LoginScreen = ({ navigation }) => {

    // Settings Context
    const { updateSettings } = useSettings()

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Auth Context
    const { login, requestPin, error, clearError } = useAuth()

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [twoFactorCode, setTwoFactorCode] = useState('')

    // Show PIN Input
    const [showPin, setShowPin] = useState(false)
    const [requestPINLabel, setRequestPINLabel] = useState('Solicitar PIN')
    const [requestingPIN, setRequestingPIN] = useState(false)

    // Countdown timer states
    const [countdown, setCountdown] = useState(0)
    const [isButtonDisabled, setIsButtonDisabled] = useState(false)
    const countdownRef = useRef(null)

    // Countdown timer effect
    useEffect(() => {
        if (countdown > 0) {
            countdownRef.current = setTimeout(() => {
                setCountdown(prev => prev - 1)
            }, 1000)
            // Update button label with formatted time
            const minutes = Math.floor(countdown / 60)
            const seconds = countdown % 60
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            setRequestPINLabel(timeString)
        } else if (countdown === 0 && isButtonDisabled) {
            setIsButtonDisabled(false)
            setRequestPINLabel('Solicitar PIN')
        }
        return () => { if (countdownRef.current) { clearTimeout(countdownRef.current) } }
    }, [countdown, isButtonDisabled])

    // Handle pre-login, we set the loading to true, clear the error and call the login function
    // If login is successful (HTTP response 202), we set the loading to false and show the PIN Input
    // If login is not successful (HTTP response 401), we set the loading to false and show an error message
    const handlePreLogin = async () => {

        if (!email || !password) {
            Toast.show({ type: 'error', text1: 'Por favor completa todos los campos' })
            return
        }

        try {

            clearError()
            setIsLoading(true)

            const result = await login({ email, password })
            if (!result.success) { Toast.show({ type: 'error', text1: result.error }) }

            // If Prelogin is successful, we set firstTime to false and show the PIN Input
            if (result.status === 202) {
                await updateSettings('appearance', { firstTime: false })
                setShowPin(true)
            }

        } catch (error) {
            Toast.show({ type: 'error', text1: 'Ha ocurrido un error durante el inicio de sesión' })
        } finally { setIsLoading(false) }
    }

    // Send all credentials to login
    const handleLogin = async () => {

        if (!email || !password || !twoFactorCode) {
            Toast.show({ type: 'error', text1: 'No es posible iniciar sesión sin completar todos los campos' })
            return
        }

        try {

            clearError()
            setIsLoading(true)

            const result = await login({ email, password, two_factor_code: twoFactorCode })
            if (!result.success) { Toast.show({ type: 'error', text1: result.error, text2: result.details }) }

        } catch (error) {
            Toast.show({ type: 'error', text1: 'Ha ocurrido un error durante el inicio de sesión, por favor intenta nuevamente' })
        } finally { setIsLoading(false) }
    }

    // Send a PIN request to email
    const handleRequestPin = async () => {

        try {

            setRequestingPIN(true)

            const result = await requestPin({ email, password })
            if (!result.success) { Toast.show({ type: 'error', text1: result.error }) }

            // Start countdown timer if request was successful
            if (result.success) {
                setCountdown(60) // 1 minute = 60 seconds
                setIsButtonDisabled(true)
                setRequestPINLabel('01:00')
            }

        } catch (error) { Toast.show({ type: 'error', text1: 'Ha ocurrido un error durante la solicitud de PIN, por favor intenta nuevamente' }) }
        finally { setRequestingPIN(false) }
    }

    // Handle restore password
    const handleRestorePassword = () => {
        console.log('🔐 Restore password')

        // Go to the restore password screen, we pass the email to the screen
        navigation.navigate(ROUTES.RECOVER_PASSWORD_SCREEN, { email })
    }

    return (
        <KeyboardAvoidingView
            style={containerStyles.subContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <ScrollView
                    contentContainerStyle={containerStyles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >

                    <Text style={textStyles.h1}>Acceder a tu cuenta</Text>
                    {
                        showPin ? (
                            <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Coloca tu PIN o 2FA para acceder a tu cuenta</Text>
                        ) : (
                            <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu correo electrónico y contraseña para acceder a tu cuenta</Text>
                        )
                    }

                    <View style={styles.formContainer}>
                        {
                            showPin ? (
                                <>
                                    <QPInput
                                        placeholder="PIN o 2FA"
                                        value={twoFactorCode}
                                        onChangeText={setTwoFactorCode}
                                        keyboardType="numeric"
                                        maxLength={6}
                                        secureTextEntry
                                        prefixIconName="shield"
                                    />
                                    <QPButton
                                        title={requestPINLabel}
                                        onPress={handleRequestPin}
                                        loading={requestingPIN}
                                        disabled={isButtonDisabled}
                                        style={{ backgroundColor: null }}
                                        textStyle={{ color: theme.colors.primary }}
                                    />
                                </>
                            ) : (
                                <>
                                    <QPInput
                                        placeholder="tucorreo@gmail.com"
                                        value={email}
                                        onChangeText={setEmail}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        prefixIconName="envelope"
                                    />

                                    <QPInput
                                        placeholder="Contraseña"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry
                                        prefixIconName="lock"
                                        suffixIconName="eye"
                                    />

                                    <QPButton
                                        title="Restaurar contraseña"
                                        style={{ backgroundColor: null }}
                                        textStyle={{ color: theme.colors.primary }}
                                        onPress={handleRestorePassword}
                                    />
                                </>
                            )
                        }
                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        {
                            showPin ? (
                                <QPButton
                                    title="Acceder"
                                    onPress={handleLogin}
                                    disabled={!email || !password || !twoFactorCode}
                                    style={{ borderRadius: 25 }}
                                    textStyle={{ color: theme.colors.almostWhite }}
                                    loading={isLoading}
                                />
                            ) : (
                                <QPButton
                                    title="Acceder"
                                    onPress={handlePreLogin}
                                    disabled={!email || !password}
                                    style={{ borderRadius: 25 }}
                                    textStyle={{ color: theme.colors.almostWhite }}
                                    loading={isLoading}
                                />
                            )
                        }
                    </View>

                </ScrollView>

            </TouchableWithoutFeedback>

        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    formContainer: {
        flex: 1,
        justifyContent: 'center'
    },
})

export default LoginScreen