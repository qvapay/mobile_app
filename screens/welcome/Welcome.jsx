import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SafeAreaView } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    // Safe area insets
    const insets = useSafeAreaInsets()

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)
    const textStyles = createTextStyles(theme)

    return (
        <SafeAreaView style={[containerStyles.container]}>

            <View style={styles.content}>

                <Text style={textStyles.title}>Welcome Screen</Text>
                <Text style={textStyles.subtitle}>Slider like Revolut with features and stories</Text>

                <View style={styles.buttonContainer}>
                    <QPButton title="Acceder" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
                    <QPButton title="Registrarse" onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)} style={{ backgroundColor: theme.colors.secondary }} />
                </View>

            </View>

        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        justifyContent: 'space-between',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 5,
        marginBottom: 10,
    }
})

export default WelcomeScreen