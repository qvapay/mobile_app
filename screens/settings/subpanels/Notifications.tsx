import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Switch } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// API
import { userApi } from '../../../api/userApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Notifications
import { toast } from 'sonner-native'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// UI
import QPLoader from '../../../ui/particles/QPLoader'

// Channel config — el copy vive en claves i18n (settings.notifications.channels.<id>)
// resueltas en render, así el panel cambia de idioma en vivo
// Tipos
import type { FontAwesome6SolidIconName, FontAwesome6BrandIconName } from '@react-native-vector-icons/fontawesome6'

/** Flags de canal que devuelve/acepta el backend. */
type NotificationChannels = {
	email_enabled: boolean
	telegram_enabled: boolean
	push_enabled: boolean
	sms_enabled: boolean
}

type NotificationChannelKey = keyof NotificationChannels

/** Fila de canal del panel (algunos aún no existen: comingSoon + disabled). */
type NotificationChannel = {
	/** Sufijo de las claves i18n settings.notifications.channels.<id>.* */
	id: string
	key: NotificationChannelKey
	icon: FontAwesome6SolidIconName | FontAwesome6BrandIconName
	iconStyle?: 'solid' | 'brand'
	comingSoon?: boolean
}

const CHANNELS: NotificationChannel[] = [
	{
		id: 'email',
		key: 'email_enabled',
		icon: 'envelope',
	},
	{
		id: 'telegram',
		key: 'telegram_enabled',
		icon: 'telegram',
		iconStyle: 'brand',
	},
	{
		id: 'push',
		key: 'push_enabled',
		icon: 'bell',
	},
	// {
	// 	id: 'sms',
	// 	key: 'sms_enabled',
	// 	icon: 'comment-sms',
	// 	comingSoon: true,
	// },
]

const Notifications = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const [isLoading, setIsLoading] = useState(true)
	const [settings, setSettings] = useState<NotificationChannels>({
		email_enabled: true,
		telegram_enabled: true,
		push_enabled: true,
		sms_enabled: false,
	})

	useEffect(() => {
		const fetchSettings = async () => {
			try {
				const result = await userApi.getNotificationSettings()
				if (result.success && result.data) {
					// getNotificationSettings declara `ApiResult<unknown>`: forma local del envelope.
					const payload = result.data as Partial<NotificationChannels>
					setSettings({
						email_enabled: !!payload.email_enabled,
						telegram_enabled: !!payload.telegram_enabled,
						push_enabled: !!payload.push_enabled,
						sms_enabled: !!payload.sms_enabled,
					})
				}
			} catch (error) { /* fetch failed silently */ }
			finally { setIsLoading(false) }
		}
		fetchSettings()
	}, [])

	const handleToggle = async (key: NotificationChannelKey, value: boolean) => {
		const previous = settings[key]
		setSettings(prev => ({ ...prev, [key]: value }))

		// Sync push subscription with OneSignal
		if (key === 'push_enabled') {
			if (value) {
				OneSignal.Notifications.requestPermission(true)
				OneSignal.User.pushSubscription.optIn()
			} else {
				OneSignal.User.pushSubscription.optOut()
			}
		}

		try {
			const result = await userApi.updateNotificationSettings({ [key]: value })
			if (!result.success) {
				setSettings(prev => ({ ...prev, [key]: previous }))
				// Rollback OneSignal state
				if (key === 'push_enabled') {
					if (previous) { OneSignal.User.pushSubscription.optIn() }
					else { OneSignal.User.pushSubscription.optOut() }
				}
				toast.error(t('settings.notifications.toasts.updateFailed'))
			}
		} catch (error) {
			setSettings(prev => ({ ...prev, [key]: previous }))
			// Rollback OneSignal state
			if (key === 'push_enabled') {
				if (previous) { OneSignal.User.pushSubscription.optIn() }
				else { OneSignal.User.pushSubscription.optOut() }
			}
			toast.error(t('settings.notifications.toasts.connectionError'))
		}
	}

	if (isLoading) return <QPLoader />

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>{t('settings.notifications.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					{t('settings.notifications.subtitle')}
				</Text>

				<View style={{ marginTop: 20, gap: 10 }}>
					{CHANNELS.map((channel) => (
						<View
							key={channel.key}
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								backgroundColor: theme.colors.surface,
								borderRadius: 12,
								padding: 16,
								opacity: channel.comingSoon ? 0.5 : 1,
							}}
						>
							<View style={{
								width: 40,
								height: 40,
								borderRadius: 20,
								alignItems: 'center',
								justifyContent: 'center',
								backgroundColor: settings[channel.key] && !channel.comingSoon ? theme.colors.primary + '20' : theme.colors.background,
								marginRight: 12,
							}}>
								{/* name/iconStyle son dinámicos: los casts fijan la rama 'solid' de la
								    unión discriminada de FontAwesome6 (el valor real puede ser brand). */}
								<FontAwesome6
									name={channel.icon as FontAwesome6SolidIconName}
									size={18}
									color={settings[channel.key] && !channel.comingSoon ? theme.colors.primary : theme.colors.tertiaryText}
									iconStyle={(channel.iconStyle || 'solid') as 'solid'}
								/>
							</View>

							<View style={{ flex: 1 }}>
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
									<Text style={[textStyles.h4, { marginBottom: 0 }]}>{t(`settings.notifications.channels.${channel.id}.label`)}</Text>
									{channel.comingSoon && (
										<View style={{ backgroundColor: theme.colors.warning + '30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
											<Text style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.warning, fontWeight: '600' }}>{t('settings.notifications.comingSoon')}</Text>
										</View>
									)}
								</View>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
									{t(`settings.notifications.channels.${channel.id}.description`)}
								</Text>
							</View>

							<Switch
								value={settings[channel.key]}
								onValueChange={(value) => handleToggle(channel.key, value)}
								disabled={channel.comingSoon}
								trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }}
							/>
						</View>
					))}
				</View>

				{/* Info card */}
				<View style={[containerStyles.card, { marginTop: 20 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
						<FontAwesome6 name="circle-info" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
							{t('settings.notifications.info')}
						</Text>
					</View>
				</View>

			</ScrollView>
		</View>
	)
}

export default Notifications
