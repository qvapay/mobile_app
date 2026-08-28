import { useState, useEffect } from 'react'
import { Text, View, ScrollView, Alert, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import { toast } from 'sonner-native'

// API
import { userApi } from '../../../api/userApi'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/** Fila de beneficios: icono FA6 solid + copy ya resuelto. */
type IconItem = { icon: FontAwesome6SolidIconName, text: string }

// Telegram Component
const Telegram = () => {

    // Contexts
    const { t } = useTranslation()
    const { updateUser } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(true)
    const [telegram, setTelegram] = useState('')
    const [telegram_id, setTelegramId] = useState('')

    // Load user data on component mount
    useEffect(() => {
        loadUserData()
    }, [])

    // Verify Telegram
    const handleVerifyTelegram = async () => {
        try {
            setIsLoading(true)
            const result = await userApi.getTelegramVerificationLink()
            if (result.success && result.data) {
                // getTelegramVerificationLink declara `ApiResult<unknown>`: el backend ha
                // mandado el enlace bajo cuatro nombres distintos — forma local del envelope.
                const payload = result.data as { verificationLink?: string, link?: string, url?: string, data?: { verificationLink?: string } }
                const link = payload.verificationLink || payload.link || payload.url || payload.data?.verificationLink
                if (link) {
                    await Linking.openURL(link)
                } else {
                    toast.error(t('settings.telegram.toasts.linkFailed'))
                }
                // La guarda de arriba mezcla `success` y `data`, así que aquí TS no estrecha a ApiFailure.
            } else { toast.error((result as { error?: string }).error || t('settings.telegram.toasts.verifyFailed')) }
        } catch (error) {
            toast.error(t('settings.telegram.toasts.verifyFailed'))
        } finally { setIsLoading(false) }
    }

    // Remove Telegram
    const handleRemoveTelegram = async () => {
        Alert.alert(
            t('settings.telegram.alerts.removeTitle'),
            t('settings.telegram.alerts.removeBody'),
            [
                { text: t('common.actions.cancel'), style: 'cancel' },
                {
                    text: t('common.actions.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsLoading(true)
                            const result = await userApi.removeTelegram()
                            if (result.success) {
                                setTelegram('')
                                setTelegramId('')
                                if (updateUser) { updateUser({ telegram: null, telegram_id: null, telegram_chat_id: null }) }
                                toast.success(t('settings.telegram.toasts.unlinked'))
                            } else { toast.error(result.error || t('settings.telegram.toasts.unlinkFailed')) }
                        } catch (error) {
                            toast.error(t('settings.telegram.toasts.unlinkFailed'))
                        } finally { setIsLoading(false) }
                    }
                }
            ]
        )
    }

    // Load user data from API
    const loadUserData = async () => {
        try {
            setIsLoadingData(true)
            const result = await userApi.getUserProfile()
            if (result.success && result.data) {
                // `User` (types/domain) declara `telegram` en su índice unknown y
                // `telegram_id` como string|number|null — aquí ambos se guardan como texto.
                setTelegram(result.data.telegram as string)
                setTelegramId(result.data.telegram_id as string)
            }
        } catch (error) { /* error loading */ }
        finally { setIsLoadingData(false) }
    }

    // Loading state
    if (isLoadingData) { return (<QPLoader />) }

    return (
        <View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
            <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                <Text style={textStyles.h1}>Telegram</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    {telegram_id ? t('settings.telegram.subtitleLinked') : t('settings.telegram.subtitleUnlinked')}
                </Text>

                {/* Status icon */}
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                    <View style={{
                        width: 100,
                        height: 100,
                        borderRadius: 50,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: telegram_id ? theme.colors.successFill + '20' : theme.colors.warning + '20',
                    }}>
                        <FontAwesome6
                            name="telegram"
                            size={48}
                            color={telegram_id ? theme.colors.successText : theme.colors.warning}
                            iconStyle="brand"
                        />
                    </View>
                    {telegram_id && telegram && (
                        <Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 16 }]}>
                            @{telegram.replace('@', '')}
                        </Text>
                    )}
                </View>

                {telegram_id ? (
                    <>
                        {/* Benefits when connected */}
                        <View style={containerStyles.card}>
                            <Text style={[textStyles.h4, { marginBottom: 12 }]}>{t('settings.telegram.linked.title')}</Text>
                            {([
                                { icon: 'arrow-right-arrow-left', text: t('settings.telegram.linked.item1') },
                                { icon: 'shield-halved', text: t('settings.telegram.linked.item2') },
                                { icon: 'handshake', text: t('settings.telegram.linked.item3') },
                            ] as IconItem[]).map((item, index) => (
                                <View key={item.text} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: index < 2 ? 10 : 0 }}>
                                    <FontAwesome6 name={item.icon} size={14} color={theme.colors.successText} iconStyle="solid" />
                                    <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                                        {item.text}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </>
                ) : (
                    <>
                        {/* Benefits when not connected */}
                        <View style={containerStyles.card}>
                            <Text style={[textStyles.h4, { marginBottom: 12 }]}>{t('settings.telegram.unlinked.title')}</Text>
                            {([
                                { icon: 'bolt', text: t('settings.telegram.unlinked.item1') },
                                { icon: 'bell', text: t('settings.telegram.unlinked.item2') },
                                { icon: 'handshake', text: t('settings.telegram.unlinked.item3') },
                            ] as IconItem[]).map((item, index) => (
                                <View key={item.text} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: index < 2 ? 10 : 0 }}>
                                    <FontAwesome6 name={item.icon} size={14} color={theme.colors.primary} iconStyle="solid" />
                                    <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                                        {item.text}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* How it works */}
                        <View style={[containerStyles.card, { marginTop: 10 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <FontAwesome6 name="circle-info" size={16} color={theme.colors.primary} iconStyle="solid" />
                                <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                                    {t('settings.telegram.unlinked.info')}
                                </Text>
                            </View>
                        </View>
                    </>
                )}

            </ScrollView>

            <View style={containerStyles.bottomButtonContainer}>
                {telegram_id ? (
                    <QPButton
                        title={t('settings.telegram.unlinkButton')}
                        onPress={handleRemoveTelegram}
                        loading={isLoading}
                        disabled={isLoading}
                        style={{ backgroundColor: theme.colors.danger }}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                ) : (
                    <QPButton
                        title={t('settings.telegram.linkButton')}
                        onPress={handleVerifyTelegram}
                        loading={isLoading}
                        disabled={isLoading}
                        textStyle={{ color: theme.colors.buttonText }}
                    />
                )}
            </View>
        </View>
    )
}

export default Telegram
