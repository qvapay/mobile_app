import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import Toast from 'react-native-toast-message'

const Password = () => {

    // Contexts
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)
    const textStyles = createTextStyles(theme)

    // States
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')

    // Loading state
    const [isLoading, setIsLoading] = useState(false)
    const [isButtonDisabled, setIsButtonDisabled] = useState(true)

    // Handle submit
    const handleSubmit = async () => {
        try {
            setIsLoading(true)
            const result = await userApi.changePassword(currentPassword, password)
            if (result.success) { Toast.show({ type: 'success', text1: 'Contraseña cambiada correctamente' }) }
        } catch (error) { Toast.show({ type: 'error', text1: 'Error al cambiar la contraseña', text2: error.message }) }
        finally { setIsLoading(false) }
    }

    // useEffect to disable QPButtin until both new passwords are filled and match
    useEffect(() => {
        if (password && confirmPassword && password === confirmPassword) { setIsButtonDisabled(false) }
        else { setIsButtonDisabled(true) }
    }, [password, confirmPassword])

    return (
        <KeyboardAvoidingView
            style={containerStyles.subContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" >

                    <Text style={textStyles.h1}>Cambiar contraseña</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Establece una nueva contraseña para tu cuenta</Text>

                    <View style={styles.formContainer}>

                        {/* Current Password */}
                        <QPInput
                            placeholder="Contraseña actual"
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            prefixIconName="lock"
                            autoCapitalize="none"
                            secureTextEntry
                        />

                        {/* New Password */}
                        <QPInput
                            placeholder="Nueva contraseña"
                            value={password}
                            onChangeText={setPassword}
                            prefixIconName="lock"
                            autoCapitalize="none"
                            secureTextEntry
                        />

                        {/* Confirm New Password */}
                        <QPInput
                            placeholder="Confirmar nueva contraseña"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            prefixIconName="lock"
                            autoCapitalize="none"
                            secureTextEntry
                        />

                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title="Cambiar contraseña"
                            onPress={handleSubmit}
                            disabled={isButtonDisabled || isLoading}
                            style={{ backgroundColor: isButtonDisabled ? theme.colors.secondaryText : theme.colors.primary, borderRadius: 25 }}
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
        marginVertical: 20
    },
})

export default Password