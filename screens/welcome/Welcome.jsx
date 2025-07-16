import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    // Safe area insets
    const insets = useSafeAreaInsets()

    // Theme variables, dark and light modes
    const { theme, isDark, toggleTheme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={[containerStyles.container, {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
        }]}>

            <View style={styles.navbar}>
                <Button title="Help" onPress={() => navigation.navigate(ROUTES.HELP_SCREEN)} />
            </View>

            <View style={styles.content}>
                <Text>Welcome Screen</Text>
                <Text>Slider like Revolut with features and stories</Text>
                <Text>Last Story has to be a dynamic story from API</Text>
                <Text>Stories are like a carousel</Text>
            </View>

            <View style={styles.buttonContainer}>
                <View style={{ flex: 1, marginRight: 5 }}>
                    <Button title="Login" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
                </View>
                <View style={{ flex: 1, marginLeft: 5 }}>
                    <Button title="Register" onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)} />
                </View>
            </View>

        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        backgroundColor: 'green',
    },
    navbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 10,
    }
})

export default WelcomeScreen