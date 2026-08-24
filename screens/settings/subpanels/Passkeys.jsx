import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Alert, Pressable } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'

// i18n (call-time para el helper de módulo + locale de fechas)
import i18n, { getDateLocale } from '../../../i18n'

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

// Helpers (fuera de React: i18n.t en call-time, nunca congelado a nivel de módulo)
const timeAgo = (dateStr) => {
    if (!dateStr) return i18n.t('settings.passkeys.timeAgo.never')
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return i18n.t('settings.passkeys.timeAgo.justNow')
    if (mins < 60) return i18n.t('settings.passkeys.timeAgo.minutes', { mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return i18n.t('settings.passkeys.timeAgo.hours', { hours })
    const days = Math.floor(hours / 24)
    if (days < 30) return i18n.t('settings.passkeys.timeAgo.days', { days })
    return new Date(dateStr).toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

// Passkeys Settings Screen
const Passkeys = () => {

    const { t } = useTranslation()
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

            const optionsResult = await authApi.getPasskeyRegisterOptions(t('settings.passkeys.defaultName'))
            if (!optionsResult.success) {
                toast.error(optionsResult.error || t('settings.passkeys.toasts.optionsFailed'))
                return
            }

            const { Passkey } = require('react-native-passkey')
            const attestation = await Passkey.create(optionsResult.data)

            const verifyResult = await authApi.verifyPasskeyRegistration(attestation)
            if (!verifyResult.success) {
                toast.error(verifyResult.error || t('settings.passkeys.toasts.verifyFailed'))
                return
            }

            toast.success(t('settings.passkeys.toasts.registered'))
            fetchPasskeys()

        } catch (err) {
            if (err?.message?.includes('cancel') || err?.code === 'ERR_PASSKEY_CANCELLED') return
            if (err?.error === 'Unknown error' || err?.message?.includes('unknown')) {
                toast.error(t('settings.passkeys.toasts.alreadyRegistered'))
            } else {
                toast.error(t('settings.passkeys.toasts.registerError', { message: err?.message || t('settings.passkeys.toasts.registerFailed') }))
            }
        } finally { setIsRegistering(false) }
    }

    // Delete a passkey
    const handleDeletePasskey = (pk) => {
        Alert.alert(
            t('settings.passkeys.alerts.deleteTitle'),
            t('settings.passkeys.alerts.deleteBody', { name: pk.name }),
            [
                { text: t('common.actions.cancel'), style: 'cancel' },
                {
                    text: t('common.actions.delete'), style: 'destructive',
                    onPress: async () => {
                        const result = await authApi.deletePasskey(pk.id)
                        if (result.success) {
                            toast.success(t('settings.passkeys.toasts.deleted'))
                            fetchPasskeys()
                        } else { toast.error(result.error || t('settings.passkeys.toasts.deleteFailed')) }
                    }
                },
            ]
        )
    }

    if (isLoading) return <QPLoader />

    return (
        <View style={containerStyles.subContainer}>
            <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                <Text style={textStyles.h1}>{t('settings.passkeys.title')}</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    {t('settings.passkeys.subtitle')}
                </Text>

                {/* Registered passkeys */}
                {passkeys.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                        <Text style={[textStyles.h4, { marginBottom: 12, color: theme.colors.secondaryText }]}>{t('settings.passkeys.yourPasskeys')}</Text>
                        {passkeys.map((pk) => (
                            <View key={pk.id} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
                                    <FontAwesome6 name="key" size={16} color={theme.colors.primary} iconStyle="solid" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[textStyles.body, { fontFamily: theme.typography.fontFamily.medium }]}>{pk.name}</Text>
                                    <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
                                        {t('settings.passkeys.meta', { syncStatus: pk.backed_up ? t('settings.passkeys.status.synced') : t('settings.passkeys.status.thisDeviceOnly'), time: timeAgo(pk.last_used_at) })}
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
                        <Text style={[textStyles.h4, { marginBottom: 12 }]}>{t('settings.passkeys.howItWorks.title')}</Text>
                        {[
                            { icon: 'key', text: t('settings.passkeys.howItWorks.step1') },
                            { icon: 'right-to-bracket', text: t('settings.passkeys.howItWorks.step2') },
                            { icon: 'face-smile', text: t('settings.passkeys.howItWorks.step3') },
                            { icon: 'check', text: t('settings.passkeys.howItWorks.step4') },
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
                    title={isRegistering ? t('settings.passkeys.registering') : t('settings.passkeys.addButton')}
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
