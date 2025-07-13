import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'

// Routes
import { ROUTES } from '../../routes'

// Login Screen
const Recover2FAScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Recover 2FA Screen</Text>

            <Button title="Go to Login" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
        backgroundColor: 'green',
    },
    imageLogo: {
        width: 200,
        height: 200,
        alignSelf: 'center',
        resizeMode: 'contain',
    },
})

export default Recover2FAScreen