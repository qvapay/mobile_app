import React, { useState } from 'react'
import { StyleSheet, View, Text } from 'react-native'

// Lottie
import LottieView from 'lottie-react-native'

// Context and Theme
import { useAuth } from '../../auth/authContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Routes
import { ROUTES } from '../../routes'

// Show a success message with a button to go back to the home screen
const SendSuccessScreen = ({ navigation }) => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Render
    return (
        <View style={[containerStyles.subContainer, styles.container]}>
            <View style={{ alignItems: 'center' }}>
                <LottieView source={require('../../assets/lotties/completed.json')} autoPlay loop={false} style={styles.loadingAnimation} />
                <Text style={textStyles.h2}>Pago completado</Text>
                <Text style={[textStyles.h6, { textAlign: 'center', paddingHorizontal: 20 }]}>Hemos procesado este pago y estará en su destino en pocos segundos.</Text>
            </View>
            <QPButton title="Volver al inicio" onPress={() => navigation.navigate(ROUTES.MAIN_STACK)} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    loadingAnimation: {
        width: 500,
        height: 350,
    }
})

export default SendSuccessScreen