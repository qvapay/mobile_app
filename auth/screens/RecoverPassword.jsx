import { useState } from 'react'
import { View, Text, StyleSheet, Button, KeyboardAvoidingView, TouchableWithoutFeedback, ScrollView, Keyboard, Platform } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Recover Password Screen
const RecoverPasswordScreen = ({ navigation, route }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [email, setEmail] = useState(route.params.email || '')

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
                            label="Correo electrónico"
                            value={email}
                            onChangeText={setEmail}
                        />

                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title="Restaurar contraseña"
                            onPress={handleRestorePassword}
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