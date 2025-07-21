import React, { useState } from 'react'
import { View, Text, Alert, StyleSheet, ScrollView, Image, Pressable } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme 
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'

// Import settings
import settings from './settings'

// Routes
import { ROUTES } from '../../routes'

// Settings Menu
const SettingsMenu = ({ navigation }) => {

    // Contexts
    const { user, logout } = useAuth()
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

            <View style={{ alignItems: 'center', marginVertical: 20 }}>
                <QPAvatar size={120} user={user} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 15 }}>
                    <Text style={[textStyles.h1, { marginVertical: 0, paddingVertical: 0 }]}>{user.name}</Text>
                    {user.kyc && (
                        <Image source={require('../../assets/images/ui/blue-badge.png')} style={{ width: 20, height: 20 }} />
                    )}
                    {user.golden_check && (
                        <Image source={require('../../assets/images/ui/gold-badge.png')} style={{ width: 20, height: 20 }} />
                    )}
                    {user.role == 'admin' && (
                        <Image source={require('../../assets/images/ui/qvapay-logo-white.png')} style={{ width: 20, height: 20 }} />
                    )}
                </View>
                <Text style={[textStyles.h2, { color: theme.colors.secondaryText, marginVertical: 0, marginTop: -10, paddingVertical: 0 }]}>@{user.username}</Text>
            </View>

            <Pressable style={[styles.box, { backgroundColor: theme.colors.elevation, flexDirection: 'row', alignContent: 'center', alignItems: 'center', overflow: 'hidden' }]} onPress={() => navigation.navigate(ROUTES.GOLD_CHECK)}>
                <Image source={require('../../assets/images/ui/gold-badge.png')} style={{ width: 80, height: 80 }} />
                <View>
                    <Text style={textStyles.h3}>GOLD CHECK</Text>
                    {user.golden_check ? <Text style={textStyles.h4}>Ver mi suscripción</Text> : <Text style={textStyles.h4}>Comprar GOLD Check</Text>}
                </View>
            </Pressable>


            <View style={{ marginVertical: 80 }}>
                <Text style={textStyles.h2}>GENERAL</Text>
            </View>

            <QPButton title="Cerrar sesión" onPress={handleLogout} style={{ backgroundColor: theme.colors.danger }} />
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    box: {
        flexDirection: 'row',
        alignContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        gap: 10,
    }
})

export default SettingsMenu