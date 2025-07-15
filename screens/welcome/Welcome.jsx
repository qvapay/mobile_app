import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Routes
import { ROUTES } from '../../routes'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

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