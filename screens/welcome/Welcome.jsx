import { View, Text, StyleSheet, ImageBackground, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import LinearGradient from 'react-native-linear-gradient'

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

                <View style={styles.buttonContainer}>
                    <QPButton
                        title="Acceder"
                        onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}
                        style={[styles.actionButton, { backgroundColor: theme.colors.primary, borderRadius: 25, color: theme.colors.buttonText }]}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                    <View style={styles.actionButtonSpacer} />
                    <QPButton
                        title="Registrarse"
                        onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)}
                        style={[styles.actionButton, { backgroundColor: theme.colors.secondary, borderRadius: 25, color: theme.colors.buttonText }]}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                </View>

                {/** Terms and Conditions */}
                <View style={styles.termsContainer}>
                    <Text style={[textStyles.h6, { fontFamily: theme.typography.fontFamily.regular, color: theme.colors.tertiaryText, textAlign: 'center' }]}>
                        Al continuar, aceptas nuestros <Text style={{ fontFamily: theme.typography.fontFamily.medium, color: theme.colors.primary }} onPress={() => Linking.openURL(ROUTES.TERMS_AND_CONDITIONS)}>Términos y Condiciones</Text>
                    </Text>
                </View>

            </SafeAreaView>
        </ImageBackground>
    )
}

const styles = StyleSheet.create({
    titleContainer: {
        marginTop: 20,
        flex: 1,
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
        borderRadius: 12,
        minHeight: 56,
    },
})

export default WelcomeScreen