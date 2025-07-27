import React from 'react'
import { View, Text, StyleSheet, ImageBackground } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LinearGradient from 'react-native-linear-gradient'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Set first time user to true
    const { updateSettings } = useSettings()
    // const setFirstTimeUser = async () => {
    //     await updateSettings('appearance', { firstTime: true })
    //     console.log('firstTime set to true')
    // }

    return (
        <ImageBackground source={require('../../assets/images/welcome/qp-bck.png')} style={{ flex: 1 }}>
            <SafeAreaView style={[containerStyles.subContainer, { justifyContent: 'space-between', backgroundColor: 'transparent' }]}>

                <LinearGradient
                    colors={[theme.colors.background, 'transparent']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80%' }}
                />
                <LinearGradient
                    colors={['transparent', theme.colors.background]}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' }}
                />

                <View style={styles.titleContainer}>
                    <Text style={textStyles.h1}>Bienvenido a QvaPay</Text>
                    <Text style={textStyles.subtitle}>Tu plataforma de pagos digitales y P2P</Text>
                </View>

                <View>
                    <View style={styles.buttonContainer}>
                        <QPButton
                            title="Acceder"
                            onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}
                            style={[styles.actionButton, { backgroundColor: theme.colors.primary, borderRadius: 25 }]}
                        />
                        <View style={styles.actionButtonSpacer} />
                        <QPButton
                            title="Registrarse"
                            onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)}
                            style={[styles.actionButton, { backgroundColor: theme.colors.secondary, borderRadius: 25 }]}
                        />
                    </View>
                </View>

            </SafeAreaView>
        </ImageBackground>
    )
}

const styles = StyleSheet.create({
    titleContainer: {
        marginTop: 20,
    },
    buttonContainer: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    actionButtonSpacer: {
        width: 10,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        minHeight: 56,
    },
})

export default WelcomeScreen