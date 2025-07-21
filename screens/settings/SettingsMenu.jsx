import React, { useState } from 'react'
import { View, Text, Alert, StyleSheet, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme 
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'

// Import settings
import settings from './settings'

// Settings Menu
const SettingsMenu = () => {

    // Contexts
    const { logout } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // State
    const [isLoading, setIsLoading] = useState(false)

    // Logout function
    const handleLogout = async () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Estás seguro de querer cerrar sesión?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Cerrar sesión',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true)
                        const result = await logout()
                        setIsLoading(false)
                        if (!result.success) { Alert.alert('Error', 'No se pudo cerrar sesión. Por favor, inténtalo de nuevo.') }
                    }
                }
            ]
        )
    }

    return (
        <ScrollView style={containerStyles.subContainer}>

            <View style={{ alignItems: 'center', marginVertical: 80 }}>
                <Text style={textStyles.h2}>PROFILE PIC AND DATA</Text>
            </View>

            <View style={{ marginVertical: 80 }}>
                <Text style={textStyles.h2}>GENERAL</Text>
            </View>

            <QPButton title="Cerrar sesión" onPress={handleLogout} style={{ backgroundColor: theme.colors.danger }} />
        </ScrollView>
    )
}

const styles = StyleSheet.create({

})

export default SettingsMenu