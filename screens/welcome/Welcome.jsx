import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Welcome Screen
const WelcomeScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Welcome Screen</Text>
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