import { View, Image, Animated } from 'react-native'
import { useEffect, useRef } from 'react'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

/**
 * Animated splash: logo fade-in followed by a bounce, over the brand purple.
 * Purely presentational — no navigation or API calls. App.tsx renders it while
 * auth/settings state initializes (and a minimum display time elapses) before
 * choosing between the authenticated and unauthenticated stacks.
 */
const SplashScreen = () => {

    // theme
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    // Animated values
    const scaleAnim = useRef(new Animated.Value(0.8)).current
    const opacityAnim = useRef(new Animated.Value(0)).current

    useEffect(() => {
        // Initial fade in
        Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start()

        // Bounce animation after fade in
        setTimeout(() => {
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.95,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1.05,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 100,
                    useNativeDriver: true,
                }),
            ]).start()
        }, 800)

    }, [opacityAnim, scaleAnim])

    return (
        <View style={[containerStyles.subContainer, { backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' }]}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
                <Image source={require('../../assets/images/ui/qvapay-logo-white.png')} style={{ width: 100, height: 100 }} />
            </Animated.View>
        </View>
    )
}

export default SplashScreen