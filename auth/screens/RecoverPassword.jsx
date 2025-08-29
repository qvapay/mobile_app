import { useState } from 'react'
import { View, Text, StyleSheet, Button, KeyboardAvoidingView, TouchableWithoutFeedback, ScrollView, Keyboard, Platform } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Routes
// import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPInput from '../../ui/particles/QPInput'

// Recover Password Screen
const RecoverPasswordScreen = ({ navigation, route }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [email, setEmail] = useState(route.params.email || '')

    // Loading state
    const [isLoading, setIsLoading] = useState(false)

    // Handle restore password
    const handleRestorePassword = () => {
        console.log('🔐 Restore password')
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

                    <Text style={textStyles.h1}>Restaurar contraseña</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu correo electrónico para restaurar tu contraseña</Text>

                    <View style={styles.formContainer}>

                        <QPInput
                            placeholder="Correo electrónico"
                            autoComplete="email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            prefixIconName="envelope"
                        />

                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title="Restablecer contraseña"
                            onPress={handleRestorePassword}
                            style={{ borderRadius: 25, backgroundColor: theme.colors.danger }}
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
    formContainer: {
        flex: 1,
        justifyContent: 'center'
    },
})

export default RecoverPasswordScreen