import React from 'react'
import { View, Text, StyleSheet, Button } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Routes
import { ROUTES } from '../../routes'

const HelpScreen = ({ navigation }) => {

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Text>Help Screen</Text>
            </View>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: 'white',
    },
})

export default HelpScreen