import React from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'

import { ROUTES } from '../../routes'

const Onboard = ({ navigation }) => {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Onboard</Text>
            <Button title="Welcome Screen" onPress={() => navigation.navigate(ROUTES.WELCOME_SCREEN)} />
            <Button title="Main Stack" onPress={() => navigation.navigate(ROUTES.MAIN_STACK)} />
        </View>
    )
}

const styles = StyleSheet.create({})

export default Onboard