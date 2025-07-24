import React from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'

import { ROUTES } from '../../routes'
import { useSettings } from '../../settings/SettingsContext'

const Onboard = ({ navigation }) => {
    
    const { updateSettings } = useSettings()

    const handleCompleteOnboarding = async () => {
        // Set firstTime to false when onboarding is completed
        await updateSettings('appearance', { firstTime: false })
        navigation.navigate(ROUTES.WELCOME_SCREEN)
    }

    const handleSkipToMain = async () => {
        // Set firstTime to false when skipping onboarding
        await updateSettings('appearance', { firstTime: false })
        navigation.navigate(ROUTES.MAIN_STACK)
    }

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Onboard</Text>
            <Button title="Complete Onboarding" onPress={handleCompleteOnboarding} />
            <Button title="Skip to Main" onPress={handleSkipToMain} />
        </View>
    )
}

const styles = StyleSheet.create({})

export default Onboard