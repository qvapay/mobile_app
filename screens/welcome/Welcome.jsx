import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
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

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    return (
        <SafeAreaView style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

            <View style={styles.titleContainer}>
                <Text style={textStyles.title}>Welcome Screen</Text>
                <Text style={textStyles.subtitle}>Slider with features and stories</Text>
            </View>

            <View style={styles.buttonContainer}>
                <QPButton title="Acceder" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
                <QPButton title="Registrarse" onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)} style={{ backgroundColor: theme.colors.secondary }} />
            </View>

        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        justifyContent: 'space-between',
    },
    titleContainer: {
        marginTop: 20,
    },
    buttonContainer: {
        marginBottom: 10,
    }
})

export default WelcomeScreen