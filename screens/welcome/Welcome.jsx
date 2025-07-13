import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'

// Routes
import { ROUTES } from '../../routes'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Welcome Screen</Text>
            <Button title="Login" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
            <View style={{ height: 16 }} />
            <Button title="Register" onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
        backgroundColor: 'green',
    }
})

export default WelcomeScreen