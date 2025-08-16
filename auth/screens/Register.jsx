import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../AuthContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import BouncyCheckbox from 'react-native-bouncy-checkbox'

// Notifications
import Toast from 'react-native-toast-message'

// Register Screen
const RegisterScreen = ({ navigation }) => {

    // Auth Context
    const { register, clearError, error } = useAuth()

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [lastname, setLastname] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [termsAccepted, setTermsAccepted] = useState(false)
    const [invite, setInvite] = useState('')

    // Pin State
    const [pinEnabled, setPinEnabled] = useState(false)
    const [pinError, setPinError] = useState(false)
    const [pin, setPin] = useState('')
    const [requestPin, setRequestPin] = useState(false)

    // Handle registration
    const handleRegister = async () => {

        // Validation
        if (!name || !lastname || !email || !password || !confirmPassword) {
            Toast.show({
                type: 'error',
                text1: 'Por favor completa todos los campos'
            })
            return
        }

        if (password !== confirmPassword) {
            Toast.show({
                type: 'error',
                text1: 'Las contraseñas no coinciden'
            })
            return
        }

        if (password.length < 8) {
            Toast.show({
                type: 'error',
                text1: 'La contraseña debe tener al menos 8 caracteres'
            })
            return
        }

        if (!termsAccepted) {
            Toast.show({
                type: 'error',
                text1: 'Debes aceptar los términos y condiciones'
            })
            return
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            Toast.show({
                type: 'error',
                text1: 'Por favor ingresa un email válido'
            })
            return
        }

        try {

            clearError()
            setIsLoading(true)
            const result = await register({
                name,
                lastname,
                email,
                password,
                invite: invite.trim() || undefined,
                terms: termsAccepted
            })

            if (result.success) { setRequestPin(true) }
            if (!result.success) { Alert.alert('Error', result.error || 'Ocurrió un error durante el registro. Por favor intenta de nuevo.') }

        } catch (error) {
            Alert.alert('Error', 'Ocurrió un error durante el registro. Por favor intenta de nuevo.')
        } finally { setIsLoading(false) }
    }

    // Handle PIN input
    useEffect(() => {
        if (pin.length === 6) {
            setPinEnabled(true)
        } else {
            setPinEnabled(false)
        }
    }, [pin])

    // Verify PIN
    const handleVerifyPin = async () => {

        // Send via API the email and PIN received by email
        setIsLoading(true)
        console.log('Sending PIN to API', pin)

        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Send API to verify PIN
        // If success, send APi to Login

        // Navigate to the main stack
        console.log('PIN sent to API', pin)
        setIsLoading(false)
    }

    return (
        <KeyboardAvoidingView
            style={[containerStyles.subContainer]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >

                    <Text style={textStyles.h1}>{requestPin ? 'Verificar PIN' : 'Crear cuenta'}</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{requestPin ? 'Verifica el código que has recibido por correo electrónico' : 'Completa los siguientes campos para crear tu cuenta'}</Text>

                    <View style={styles.formContainer}>

                        {requestPin ? (
                            <>
                                <QPInput
                                    placeholder="PIN"
                                    value={pin}
                                    onChangeText={setPin}
                                    keyboardType="numeric"
                                    autoCapitalize="none"
                                    prefixIconName="lock"
                                    maxLength={6}
                                    disabled={!pinEnabled}
                                />
                            </>
                        ) : (
                            <>
                                <QPInput
                                    placeholder="Nombre"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                    prefixIconName="user"
                                />

                                <QPInput
                                    placeholder="Apellidos"
                                    value={lastname}
                                    onChangeText={setLastname}
                                    autoCapitalize="words"
                                    prefixIconName="user"
                                />

                                <QPInput
                                    placeholder="tucorreo@gmail.com"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    prefixIconName="envelope"
                                />

                                <QPInput
                                    placeholder="Código de referido (opcional)"
                                    value={invite}
                                    onChangeText={setInvite}
                                    autoCapitalize="none"
                                    prefixIconName="gift"
                                />

                                <QPInput
                                    placeholder="Contraseña"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    prefixIconName="lock"
                                    suffixIconName="eye"
                                />

                                <QPInput
                                    placeholder="Confirmar contraseña"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry
                                    prefixIconName="lock"
                                    suffixIconName="eye"
                                />

                                {/* Terms and Conditions Checkbox */}
                                <View style={styles.termsContainer}>
                                    <BouncyCheckbox
                                        size={22}
                                        fillColor={theme.colors.primary}
                                        unFillColor={theme.colors.secondaryText}
                                        text="Acepto los términos y condiciones"
                                        iconStyle={{ borderColor: theme.colors.primary }}
                                        innerIconStyle={{ borderWidth: 2 }}
                                        textStyle={{ color: theme.colors.secondaryText, textDecorationLine: 'none' }}
                                        onPress={() => setTermsAccepted(!termsAccepted)}
                                    />
                                </View>
                            </>
                        )}
                    </View>

                    {!requestPin && (
                        <View style={styles.loginLink}>
                            <Text style={{ textAlign: 'center', color: theme.colors.primaryText }}>
                                ¿Ya tienes una cuenta?{' '}
                                <Text style={{ color: theme.colors.primary }} onPress={() => navigation.navigate('Login')} >
                                    Inicia sesión
                                </Text>
                            </Text>
                        </View>
                    )}

                    <View style={{ marginBottom: 10 }}>
                        {requestPin ? (
                            <QPButton
                                title="Verificar PIN"
                                onPress={handleVerifyPin}
                                disabled={!pinEnabled}
                                style={{ borderRadius: 25 }}
                                textStyle={{ color: theme.colors.almostWhite }}
                                loading={isLoading}
                            />
                        ) : (
                            <QPButton
                                title="Crear cuenta"
                                onPress={handleRegister}
                                disabled={!termsAccepted || !name || !lastname || !email || !password || !confirmPassword}
                                style={{ borderRadius: 25 }}
                                textStyle={{ color: theme.colors.almostWhite }}
                                loading={isLoading}
                            />
                        )}
                    </View>

                </ScrollView>

            </TouchableWithoutFeedback>

        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingVertical: 20
    },
    formContainer: {
        flex: 1,
        justifyContent: 'center'
    },
    loader: {
        marginTop: 10,
    },
    loginLink: {
        marginVertical: 10,
        paddingHorizontal: 20,
    },
    termsContainer: {
        marginTop: 10,
        paddingHorizontal: 5,
        alignItems: 'center',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: '#ccc',
        borderRadius: 4,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmark: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    termsText: {
        flex: 1,
        lineHeight: 20,
    },
})

export default RegisterScreen