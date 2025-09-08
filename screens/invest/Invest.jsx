import { View, Text, StyleSheet } from 'react-native'

// LottieView
import LottieView from 'lottie-react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Coins and Stocks component
const Invest = () => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer, styles.container]}>
            <View style={styles.content}>
                {/* Growth Animation */}
                <LottieView
                    source={require('../../assets/lotties/growth.json')}
                    autoPlay
                    loop={false}
                    style={styles.animation}
                />

                {/* Coming Soon Text */}
                <View style={styles.textContainer}>
                    <Text style={[textStyles.h1, styles.title]}>Próximamente</Text>
                    <Text style={[textStyles.subtitle, styles.subtitle]}>
                        Estamos aun trabajando en esta funcionalidad, pronto estará disponible.
                    </Text>
                </View>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    animation: {
        width: 300,
        height: 300,
        marginBottom: 40,
    },
    textContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    title: {
        textAlign: 'center',
        marginBottom: 16,
    },
    subtitle: {
        textAlign: 'center',
        lineHeight: 24,
    },
})

export default Invest