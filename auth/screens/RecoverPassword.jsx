import { useState } from 'react'
import { View, Text, StyleSheet, KeyboardAvoidingView, TouchableWithoutFeedback, ScrollView, Keyboard, Platform } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Routes
// import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'

// API
import { authApi } from '../../api/authApi'

// Recover Password Screen
const RecoverPasswordScreen = ({ navigation, route }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [email, setEmail] = useState(route.params.email || '')
    const [emailError, setEmailError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    // Loading state
    const [isLoading, setIsLoading] = useState(false)

    // Email validation function
    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    // Handle restore password
    const handleRestorePassword = async () => {

        // Clear previous errors and success message
        setEmailError('')
        setSuccessMessage('')

        // Validate email
        if (!email.trim()) {
            setEmailError('El correo electrónico es requerido')
            return
        }

        if (!validateEmail(email.trim())) {
            setEmailError('Por favor ingrese un correo electrónico válido')
            return
        }

        setIsLoading(true)

        try {
            const result = await authApi.resetPassword({ email: email.trim() })

            if (result.success) {
                setSuccessMessage('Se ha enviado un correo electrónico con las instrucciones para restablecer tu contraseña. Por favor revisa tu bandeja de entrada.')
            } else { setEmailError(result.error || 'Ha ocurrido un error al solicitar el restablecimiento de contraseña') }

        } catch (error) {
            setEmailError('Ha ocurrido un error inesperado')
        } finally { setIsLoading(false) }
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

                    <Text style={textStyles.h1}>Restablecer contraseña</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu correo electrónico para restaurar tu contraseña</Text>

                    <View style={styles.formContainer}>

                        <QPInput
                            placeholder="Correo electrónico"
                            autoComplete="email"
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text)
                                if (emailError) setEmailError('')
                            }}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            prefixIconName="envelope"
                        />

                        {emailError ? (
                            <Text style={[textStyles.error, { marginTop: 5, marginLeft: 5 }]}>
                                {emailError}
                            </Text>
                        ) : null}

                        {successMessage ? (
                            <View style={[styles.successContainer, { backgroundColor: theme.colors.success + '20', borderColor: theme.colors.success }]}>
                                <Text style={[textStyles.caption, { color: theme.colors.success, textAlign: 'center' }]}>
                                    {successMessage}
                                </Text>
                            </View>
                        ) : null}

                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        {successMessage ? (
                            <QPButton
                                title="Volver al inicio de sesión"
                                onPress={() => navigation.goBack()}
                                style={{ borderRadius: 25, backgroundColor: theme.colors.primary, marginTop: 10 }}
                                textStyle={{ color: theme.colors.almostWhite }}
                            />
                        ) : (
                            <QPButton
                                title="Restablecer contraseña"
                                onPress={handleRestorePassword}
                                style={{ borderRadius: 25, backgroundColor: theme.colors.danger }}
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
    formContainer: {
        flex: 1,
        marginVertical: 20
    },
    successContainer: {
        marginTop: 15,
        padding: 15,
        borderRadius: 10,
        borderWidth: 1,
    },
})

export default RecoverPasswordScreen