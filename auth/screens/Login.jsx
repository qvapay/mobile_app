import React, { useState } from 'react'
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Auth Context
import { useAuth } from '../AuthContext'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'

// Routes
import { ROUTES } from '../../routes'

// Login Screen
const LoginScreen = ({ navigation }) => {

    // Settings Context
    const { updateSettings } = useSettings()

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

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
            Alert.alert('Error', 'Please fill in all fields')
            return
        }

        clearError()
        setIsLoading(true)
        const result = await login({
            email,
            password,
            two_factor_code: twoFactorCode
        })
        setIsLoading(false)

        // After the first successful login, set firstTime to false
        if (result.success) { await updateSettings('appearance', { firstTime: false }) }
        if (!result.success) { Alert.alert('Login Failed', result.error || 'An error occurred during login') }
    }

    return (
        <SafeAreaView style={[containerStyles.subContainer, styles.container]}>

            <View style={styles.formContainer}>

                <Text style={styles.title}>Acceder a tu cuenta</Text>

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
                    maxLength={4}
                    secureTextEntry
                    prefixIconName="shield"
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                {isLoading && <ActivityIndicator style={styles.loader} />}

            </View>

            <QPButton
                title="Acceder"
                onPress={handleLogin}
                disabled={isLoading}
                style={{ borderRadius: 25 }}
            />

        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'space-between',
        paddingVertical: 20,
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