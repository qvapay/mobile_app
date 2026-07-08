import { View, StyleSheet } from 'react-native'

// LottieView
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

/**
 * Full-area centered loader: a 200x200 looping Lottie spinner on a themed
 * subContainer that flexes to fill its parent. The standard whole-screen
 * loading state — for inline placeholders use QPSkeleton instead.
 */
export default function QPLoader() {

    // Theme
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
            {/* <ActivityIndicator size="large" color={theme.colors.primary} /> */}
            <LottieView
                style={styles.loader}
                source={require('../../assets/lotties/spinner.json')}
                autoPlay
                loop
            />
        </View>
    )
}

const styles = StyleSheet.create({
    loader: {
        width: 200,
        height: 200
    }
})