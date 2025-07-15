import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Routes
import { ROUTES } from '../../routes'

// Register Screen
const RegisterScreen = ({ navigation }) => {

    return (
        <SafeAreaView style={styles.safeArea}>
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
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: 'green',
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