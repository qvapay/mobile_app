import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
    const { updateSetting } = useSettings()
    const setFirstTimeUser = async () => {
        await updateSetting('appearance', 'firstTime', true)
        console.log('firstTime set to true')
    }

    return (
        <SafeAreaView style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

            <View style={styles.titleContainer}>
                <Text style={textStyles.title}>Welcome Screen</Text>
                <Text style={textStyles.subtitle}>Slider with features and stories</Text>

                <QPButton
                    title="Set first time user"
                    onPress={setFirstTimeUser}
                    style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                />

            </View>

            <View>
                <View style={styles.buttonContainer}>
                    <QPButton
                        title="Acceder"
                        onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}
                        style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                    />
                    <View style={styles.actionButtonSpacer} />
                    <QPButton
                        title="Registrarse"
                        onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)}
                        style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                    />
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