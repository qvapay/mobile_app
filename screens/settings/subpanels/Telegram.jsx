import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, Alert, Linking } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import Toast from 'react-native-toast-message'

// API
import { userApi } from '../../../api/userApi'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Lottie
import LottieView from 'lottie-react-native'

// Get Telegram Verification Status and Verify it if not verified
const Telegram = () => {

    // Contexts
    const { updateUser } = useAuth()

    // Theme variables, dark and light modes with memoized styles
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(true)

    // Form fields
    const [telegram, setTelegram] = useState('')
    const [telegram_id, setTelegramId] = useState('')

    // Load user data on component mount
    useEffect(() => {
        loadUserData()
    }, [])

    // Verify Telegram
    const handleVerifyTelegram = async () => {

        try {

            setIsLoading(true)

            const result = await userApi.getTelegramVerificationLink()

            if (result.success) {
                console.log('Telegram verification link', result.data.verificationLink)
                Linking.openURL(result.data.verificationLink)
            }

            setIsLoading(false)

        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error al verificar la cuenta de Telegram', text2: error.message })
        } finally { setIsLoading(false) }

    }

    // Remove Telegram
    const handleRemoveTelegram = async () => {
        Alert.alert(
            'Eliminar Telegram',
            '¿Estás seguro de que quieres eliminar tu verificación de Telegram? Esta acción no se puede deshacer.',
            [
                {
                    text: 'Cancelar',
                    style: 'cancel'
                },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {

                        try {

                            setIsLoading(true)
                            const result = await userApi.removeTelegram()

                            if (result.success) {

                                // Update local state
                                setTelegram('')
                                setTelegramId('')

                                // Update user context
                                if (updateUser) { updateUser({ telegram: null, telegram_id: null, telegram_chat_id: null }) }

                                Toast.show({ type: 'success', text1: 'Éxito', text2: 'Cuenta de Telegram eliminada correctamente' })

                            } else { Toast.show({ type: 'error', text1: 'Error', text2: result.error || 'Error al eliminar la cuenta de Telegram' }) }

                        } catch (error) {
                            Toast.show({ type: 'error', text1: 'Error', text2: 'Error al eliminar la cuenta de Telegram. Intenta nuevamente.' })
                        } finally { setIsLoading(false) }
                    }
                }
            ]
        )
    }

    // Load user data from API
    const loadUserData = async () => {

        try {

            setIsLoadingData(true)
            const result = await userApi.getUserProfile()

            if (result.success && result.data) {
                setTelegram(result.data.telegram)
                setTelegramId(result.data.telegram_id)
            }

            setIsLoadingData(false)

        } catch (error) {
            setIsLoadingData(false)
        } finally { setIsLoadingData(false) }
    }

    // Loading state
    if (isLoadingData) { return (<QPLoader />) }

    return (
        <View style={containerStyles.subContainer}>
            <View style={containerStyles.scrollContainer}>

                <Text style={textStyles.h1}>Telegram</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    {telegram_id ? ('Tu cuenta de Telegram está verificada') : ('Verifica tu cuenta de Telegram')}
                </Text>

                <View style={styles.formContainer}>
                    {
                        telegram_id ? (
                            <LottieView source={require('../../../assets/lotties/telegram.json')} autoPlay loop={false} style={styles.loadingAnimation} />
                        ) : (
                            <Text style={[textStyles.h5, { color: theme.colors.tertiaryText, marginBottom: 4 }]}>No tienes Telegram verificado</Text>
                        )
                    }
                </View>

                <View style={containerStyles.bottomButtonContainer}>
                    {
                        telegram_id ? (
                            <QPButton
                                title="Eliminar Telegram"
                                onPress={handleRemoveTelegram}
                                loading={isLoading}
                                disabled={isLoading}
                                style={{ borderRadius: 25, backgroundColor: theme.colors.danger, marginBottom: 20 }}
                                textStyle={{ color: theme.colors.almostWhite }}
                            />
                        ) : (
                            <QPButton
                                title="Verificar"
                                onPress={handleVerifyTelegram}
                                loading={isLoading}
                                disabled={isLoading}
                                style={{ borderRadius: 25, backgroundColor: theme.colors.primary, marginBottom: 20 }}
                                textStyle={{ color: theme.colors.almostWhite }}
                            />
                        )
                    }
                </View>

            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    formContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingAnimation: {
        width: 500,
        height: 350,
    }
})

export default Telegram