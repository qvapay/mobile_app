import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Splash Screen
const SplashScreen = () => {

    return (
        <View style={styles.container}>
            <Text>Splash Screen</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: 'red',
    },
})

export default SplashScreen