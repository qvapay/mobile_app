import { View, ActivityIndicator, StyleSheet } from 'react-native'

// LottieView
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

export default function QPLoader() {

    // Theme
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.subContainer, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
            {/* <ActivityIndicator size="large" color={theme.colors.primary} /> */}
            <LottieView
                style={styles.loader}
                source={require('../../assets/lotties/loader.json')}
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