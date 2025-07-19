import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Routes
import { ROUTES } from '../../routes'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// Register Screen
const RegisterScreen = ({ navigation }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)

    return (
        <View style={styles.container}>

            <View style={styles.navbar}>
                <Button title="Back" onPress={() => navigation.goBack()} />
                <Button title="Help" onPress={() => navigation.navigate(ROUTES.HELP_SCREEN)} />
            </View>

            <View style={styles.content}>
                <Text>Register Screen</Text>
                <Text>Register Screen</Text>
                <Text>Register Screen</Text>
                <Text>Register Screen</Text>
            </View>

            <View style={styles.buttonContainer}>
                <Button title="Register" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    imageLogo: {
        width: 200,
        height: 200,
        alignSelf: 'center',
        resizeMode: 'contain',
    },
    navbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    buttonContainer: {
        paddingBottom: 10,
    },
})

export default RegisterScreen