import React, { useState } from 'react'
import { View, Text, StyleSheet, Button, TextInput, Alert, ActivityIndicator } from 'react-native'

// Auth Context
import { useAuth } from '../authContext'

// Routes
import { ROUTES } from '../../routes'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Login Screen
const LoginScreen = ({ navigation }) => {

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

        if (!result.success) { Alert.alert('Login Failed', result.error || 'An error occurred during login') }
    }

    return (
        <View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

            <View style={styles.formContainer}>
                <Text style={styles.title}>Acceder a tu cuenta</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TextInput
                    style={styles.input}
                    placeholder="2FA Code (1234 for testing)"
                    value={twoFactorCode}
                    onChangeText={setTwoFactorCode}
                    keyboardType="numeric"
                    maxLength={4}
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                {isLoading && <ActivityIndicator style={styles.loader} />}
            </View>

            <QPButton title="Acceder" onPress={handleLogin} disabled={isLoading} />

        </View>
    )
}

const styles = StyleSheet.create({
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: 'white',
    },
    input: {
        backgroundColor: 'white',
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderRadius: 8,
        marginBottom: 15,
        fontSize: 16,
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