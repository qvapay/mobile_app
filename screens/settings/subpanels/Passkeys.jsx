import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Alert, Pressable } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// API
import { authApi } from '../../../api/authApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Notifications
import { toast } from 'sonner-native'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// Helpers
const timeAgo = (dateStr) => {
    if (!dateStr) return 'Nunca'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Justo ahora'
    if (mins < 60) return `hace ${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `hace ${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 30) return `hace ${days}d`
    return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Passkeys Settings Screen
const Passkeys = () => {

    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    const [passkeys, setPasskeys] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRegistering, setIsRegistering] = useState(false)

    // Fetch passkeys on screen focus
    const fetchPasskeys = useCallback(async () => {
        const result = await authApi.getPasskeys()
        if (result.success) { setPasskeys(result.data) }
        setIsLoading(false)
    }, [])

    useFocusEffect(useCallback(() => { fetchPasskeys() }, [fetchPasskeys]))

    // Register a new passkey
    const handleRegisterPasskey = async () => {
        try {
            setIsRegistering(true)

            const optionsResult = await authApi.getPasskeyRegisterOptions('Mi Passkey')
            if (!optionsResult.success) {
                toast.error(optionsResult.error || 'Error al obtener opciones')
                return
            }

            const { Passkey } = require('react-native-passkey')
            const attestation = await Passkey.create(optionsResult.data)

            const verifyResult = await authApi.verifyPasskeyRegistration(attestation)
            if (!verifyResult.success) {
                toast.error(verifyResult.error || 'Error al verificar')
                return
            }

            toast.success('Passkey registrada correctamente')
            fetchPasskeys()

        } catch (err) {
            if (err?.message?.includes('cancel') || err?.code === 'ERR_PASSKEY_CANCELLED') return
            if (err?.error === 'Unknown error' || err?.message?.includes('unknown')) {
                toast.error('Ya tienes una passkey registrada en este dispositivo')
            } else {
                toast.error(`Error: ${err?.message || 'Error al registrar passkey'}`)
            }
        } finally { setIsRegistering(false) }
    }

    // Delete a passkey
    const handleDeletePasskey = (pk) => {
        Alert.alert(
            'Eliminar Passkey',
            `¿Seguro que quieres eliminar "${pk.name}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar', style: 'destructive',
                    onPress: async () => {
                        const result = await authApi.deletePasskey(pk.id)
                        if (result.success) {
                            toast.success('Passkey eliminada')
                            fetchPasskeys()
                        } else { toast.error(result.error || 'Error al eliminar') }
                    }
                },
            ]
        )
    }

    if (isLoading) return <QPLoader />

    return (
        <View style={containerStyles.subContainer}>
            <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                <Text style={textStyles.h1}>Passkeys</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    Inicia sesión de forma segura sin contraseña, usando Face ID, huella o tu dispositivo
                </Text>

                {/* Registered passkeys */}
                {passkeys.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                        <Text style={[textStyles.h4, { marginBottom: 12, color: theme.colors.secondaryText }]}>TUS PASSKEYS</Text>
                        {passkeys.map((pk) => (
                            <View key={pk.id} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
                                    <FontAwesome6 name="key" size={16} color={theme.colors.primary} iconStyle="solid" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[textStyles.body, { fontFamily: theme.typography.fontFamily.medium }]}>{pk.name}</Text>
                                    <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
                                        {pk.backed_up ? 'Sincronizada' : 'Solo este dispositivo'} · Último uso: {timeAgo(pk.last_used_at)}
                                    </Text>
                                </View>
                                <Pressable onPress={() => handleDeletePasskey(pk)} hitSlop={10}>
                                    <FontAwesome6 name="trash-can" size={16} color={theme.colors.danger} iconStyle="solid" />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}

                {/* How it works */}
                {passkeys.length === 0 && (
                    <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, marginTop: 16 }}>
                        <Text style={[textStyles.h4, { marginBottom: 12 }]}>Como funciona</Text>
                        {[
                            { icon: 'key', text: 'Registra una passkey en este dispositivo' },
                            { icon: 'right-to-bracket', text: 'En el login, toca el botón de llave' },
                            { icon: 'face-smile', text: 'Confirma con Face ID o huella digital' },
                            { icon: 'check', text: 'Accedes sin escribir contraseña ni PIN' },
                        ].map((step, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: i < 3 ? 12 : 0 }}>
                                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
                                    <FontAwesome6 name={step.icon} size={14} color={theme.colors.primary} iconStyle="solid" />
                                </View>
                                <Text style={[textStyles.body, { marginLeft: 12, flex: 1 }]}>{step.text}</Text>
                            </View>
                        ))}
                    </View>
                )}

            </ScrollView>

            {/* Register button anchored to bottom */}
            <View style={containerStyles.bottomButtonContainer}>
                <QPButton
                    title={isRegistering ? 'Registrando...' : 'Agregar Passkey'}
                    onPress={handleRegisterPasskey}
                    loading={isRegistering}
                    disabled={isRegistering}
                    textStyle={{ color: theme.colors.almostWhite }}
                />
            </View>
        </View>
    )
}

export default Passkeys
