import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'

const WAIT_TIME = 2500

// Splash Screen
const SplashScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Splash Screen</Text>

            <Button title="Go to Welcome" onPress={() => navigation.navigate('Welcome')} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
        backgroundColor: 'blue',
    },
    imageLogo: {
        width: 200,
        height: 200,
        alignSelf: 'center',
        resizeMode: 'contain',
    },
})

export default SplashScreen