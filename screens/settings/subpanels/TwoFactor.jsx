import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// Notifications
import Toast from 'react-native-toast-message'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Two Factor Component
const TwoFactor = () => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(true)
    const [twoFactor, setTwoFactor] = useState('')

    // User State

    // Load user data on component mount
    useEffect(() => {
        loadUserData()
    }, [])

    // Load user data from API
    const loadUserData = async () => {
        try {
            setIsLoadingData(true)
            const result = await userApi.getUserProfile()
            if (result.success && result.data) {
                
                console.log(result.data)

            }
        }
        catch (error) {
            Toast.show({ type: 'error', text1: 'Error al cargar datos del usuario', text2: error.message })
        } finally { setIsLoadingData(false) }
    }

    // Loading state
    if (isLoadingData) { return (<QPLoader />) }

    return (
        <KeyboardAvoidingView
            style={containerStyles.subContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" >

                    <Text style={textStyles.h1}>Datos personales</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Edita tus datos personales</Text>

                    <View style={styles.formContainer}>


                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title="Verificar OTP"
                            onPress={handleVerifyTwoFactor}
                            disabled={!twoFactor || isLoading}
                            style={styles.updateButton}
                            textStyle={{ color: theme.colors.almostWhite }}
                            loading={isLoading}
                        />
                    </View>

                </ScrollView>
            </TouchableWithoutFeedback>

        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({})

export default TwoFactor