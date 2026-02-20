import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Switch } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// API
import { userApi } from '../../../api/userApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Notifications
import Toast from 'react-native-toast-message'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// UI
import QPLoader from '../../../ui/particles/QPLoader'

// Channel config
const CHANNELS = [
	{
		key: 'email_enabled',
		label: 'Correo electrónico',
		description: 'Recibe notificaciones de transacciones, seguridad y ofertas P2P por email',
		icon: 'envelope',
	},
	{
		key: 'telegram_enabled',
		label: 'Telegram',
		description: 'Recibe alertas instantáneas en tu cuenta de Telegram vinculada',
		icon: 'telegram',
		iconStyle: 'brand',
	},
	{
		key: 'push_enabled',
		label: 'Notificaciones push',
		description: 'Recibe notificaciones en tiempo real en tu dispositivo',
		icon: 'bell',
	},
	{
		key: 'sms_enabled',
		label: 'SMS',
		description: 'Recibe notificaciones por mensaje de texto',
		icon: 'comment-sms',
		comingSoon: true,
	},
]

const Notifications = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const [isLoading, setIsLoading] = useState(true)
	const [settings, setSettings] = useState({
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
					setSettings({
						email_enabled: !!result.data.email_enabled,
						telegram_enabled: !!result.data.telegram_enabled,
						push_enabled: !!result.data.push_enabled,
						sms_enabled: !!result.data.sms_enabled,
					})
				}
			} catch (error) { /* fetch failed silently */ }
			finally { setIsLoading(false) }
		}
		fetchSettings()
	}, [])

	const handleToggle = async (key, value) => {
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
				Toast.show({ type: 'error', text1: 'No se pudo actualizar la configuración' })
			}
		} catch (error) {
			setSettings(prev => ({ ...prev, [key]: previous }))
			// Rollback OneSignal state
			if (key === 'push_enabled') {
				if (previous) { OneSignal.User.pushSubscription.optIn() }
				else { OneSignal.User.pushSubscription.optOut() }
			}
			Toast.show({ type: 'error', text1: 'Error de conexión' })
		}
	}

	if (isLoading) return <QPLoader />

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>Notificaciones</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					Configura cómo quieres recibir tus alertas
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
								<FontAwesome6
									name={channel.icon}
									size={18}
									color={settings[channel.key] && !channel.comingSoon ? theme.colors.primary : theme.colors.tertiaryText}
									iconStyle={channel.iconStyle || 'solid'}
								/>
							</View>

							<View style={{ flex: 1 }}>
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
									<Text style={[textStyles.h4, { marginBottom: 0 }]}>{channel.label}</Text>
									{channel.comingSoon && (
										<View style={{ backgroundColor: theme.colors.warning + '30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
											<Text style={{ fontSize: 10, color: theme.colors.warning, fontWeight: '600' }}>Próximamente</Text>
										</View>
									)}
								</View>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
									{channel.description}
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
							Las notificaciones de seguridad (inicio de sesión, cambio de contraseña) siempre se envían por email independientemente de esta configuración.
						</Text>
					</View>
				</View>

			</ScrollView>
		</View>
	)
}

export default Notifications
