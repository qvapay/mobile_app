import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'

// Routes
import { ROUTES } from './routes'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Welcome Screen</Text>

            <Button title="Go to Splash" onPress={() => navigation.navigate(ROUTES.SPLASH_SCREEN)} />
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

export default WelcomeScreen