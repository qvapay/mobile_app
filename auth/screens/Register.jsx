import { useState } from 'react'
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
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

    // Handle registration
    const handleRegister = async () => {

        // Validation
        if (!name || !lastname || !email || !password || !confirmPassword) {
            Alert.alert('Error', 'Por favor completa todos los campos')
            return
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Las contraseñas no coinciden')
            return
        }

        if (password.length < 8) {
            Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres')
            return
        }

        if (!termsAccepted) {
            Alert.alert('Error', 'Debes aceptar los términos y condiciones')
            return
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            Alert.alert('Error', 'Por favor ingresa un email válido')
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

            if (result.success) {
                Alert.alert(
                    'Registro Exitoso',
                    'Tu cuenta ha sido creada exitosamente. Por favor inicia sesión.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                navigation.navigate('Login')
                            }
                        }
                    ]
                )
            }

            if (!result.success) { Alert.alert('Error', result.error || 'Ocurrió un error durante el registro. Por favor intenta de nuevo.') }

        } catch (error) {
            Alert.alert('Error', 'Ocurrió un error durante el registro. Por favor intenta de nuevo.')
        } finally { setIsLoading(false) }
    }

    return (
        <View style={[containerStyles.subContainer, { paddingBottom: insets.bottom }]}>

            <Text style={textStyles.h1}>Crear cuenta</Text>

            <View style={styles.formContainer}>

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

                {isLoading && <ActivityIndicator style={styles.loader} />}

            </View>

            <View style={styles.loginLink}>
                <Text style={{ textAlign: 'center', color: theme.colors.primaryText }}>
                    ¿Ya tienes una cuenta?{' '}
                    <Text style={{ color: theme.colors.primary, textDecorationLine: 'underline' }} onPress={() => navigation.navigate('Login')} >
                        Inicia sesión
                    </Text>
                </Text>
            </View>

            <View style={{ marginBottom: 10 }}>
                <QPButton
                    title="Crear cuenta"
                    onPress={handleRegister}
                    disabled={isLoading || !termsAccepted}
                    style={{ borderRadius: 25 }}
                    textStyle={{ color: theme.colors.almostWhite }}
                />
            </View>

        </View>
    )
}

const styles = StyleSheet.create({
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