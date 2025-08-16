import { useState } from 'react'
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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

// Login Screen
const LoginScreen = () => {

    // Settings Context
    const { updateSettings } = useSettings()

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)
    const insets = useSafeAreaInsets()

    // Auth Context
    const { login, error, clearError } = useAuth()

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [twoFactorCode, setTwoFactorCode] = useState('')

    // Handle login, we set the loading to true, clear the error and call the login function
    // If login is successful, we set the loading to false
    // If login is not successful, we set the loading to false and show an error message
    const handleLogin = async () => {

        if (!email || !password) {
            Alert.alert('Error', 'Por favor completa todos los campos')
            return
        }

        try {

            clearError()
            setIsLoading(true)
            const result = await login({
                email,
                password,
                two_factor_code: twoFactorCode
            })

            // After the first successful login, set firstTime to false
            if (result.success) { await updateSettings('appearance', { firstTime: false }) }
            if (!result.success) {
                Toast.show({
                    type: 'error',
                    text1: result.error
                })
            }

        } catch (error) {
            Alert.alert('Error', 'Ha ocurrido un error durante el inicio de sesión')
        } finally { setIsLoading(false) }
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

                    <Text style={textStyles.h1}>Acceder a tu cuenta</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu correo electrónico y contraseña para acceder a tu cuenta</Text>

                    <View style={styles.formContainer}>

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

                        <QPInput
                            placeholder="Código 2FA"
                            value={twoFactorCode}
                            onChangeText={setTwoFactorCode}
                            keyboardType="numeric"
                            maxLength={6}
                            secureTextEntry
                            prefixIconName="shield"
                        />

                    </View>

                    <View style={{ marginBottom: 20 }}>
                        <QPButton
                            title="Acceder"
                            onPress={handleLogin}
                            disabled={!email || !password || !twoFactorCode}
                            style={{ borderRadius: 25 }}
                            textStyle={{ color: theme.colors.almostWhite }}
                            loading={isLoading}
                        />
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
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: 'white',
    },
    errorText: {
        color: 'red',
        textAlign: 'center',
        marginBottom: 15,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 10,
        borderRadius: 5,
    },
    loader: {
        marginTop: 10,
    },
})

export default LoginScreen