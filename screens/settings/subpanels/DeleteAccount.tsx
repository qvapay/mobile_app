import { View, Text, ScrollView, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from '../../../ui/particles/QPButton'

// Los text son claves de i18n resueltas en render (constante de módulo)
// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/** Consecuencias listadas antes de borrar: icono FA6 + clave i18n. */
type Consequence = { icon: FontAwesome6SolidIconName, text: string }

const CONSEQUENCES: Consequence[] = [
	{
		icon: 'wallet',
		text: 'settings.deleteAccount.consequences.balance',
	},
	{
		icon: 'clock-rotate-left',
		text: 'settings.deleteAccount.consequences.history',
	},
	{
		icon: 'handshake',
		text: 'settings.deleteAccount.consequences.p2pOffers',
	},
	{
		icon: 'address-card',
		text: 'settings.deleteAccount.consequences.kycData',
	},
	{
		icon: 'user-slash',
		text: 'settings.deleteAccount.consequences.username',
	},
]

const handleOpenSupport = () => { Linking.openURL('https://support.qvapay.com') }

const DeleteAccount = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>{t('settings.deleteAccount.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					{t('settings.deleteAccount.subtitle')}
				</Text>

				{/* Warning icon */}
				<View style={{ alignItems: 'center', paddingVertical: 30 }}>
					<View style={{
						width: 100,
						height: 100,
						borderRadius: 50,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: theme.colors.danger + '20',
					}}>
						<FontAwesome6 name="triangle-exclamation" size={48} color={theme.colors.danger} iconStyle="solid" />
					</View>
				</View>

				{/* Consequences */}
				<View style={[containerStyles.card, { marginBottom: 16 }]}>
					<Text style={[textStyles.h4, { marginBottom: 16 }]}>
						{t('settings.deleteAccount.consequencesTitle')}
					</Text>
					{CONSEQUENCES.map((item, index) => (
						<View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: index < CONSEQUENCES.length - 1 ? 14 : 0 }}>
							<FontAwesome6 name={item.icon} size={16} color={theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								{t(item.text)}
							</Text>
						</View>
					))}
				</View>

				{/* Support info */}
				<View style={containerStyles.card}>
					<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
						<FontAwesome6 name="headset" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
							{t('settings.deleteAccount.supportInfo')}
						</Text>
					</View>
				</View>

			</ScrollView>

			<View style={containerStyles.bottomButtonContainer}>
				<QPButton
					title={t('settings.deleteAccount.contactSupport')}
					onPress={handleOpenSupport}
					style={{ backgroundColor: theme.colors.danger }}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>
		</View>
	)
}

export default DeleteAccount
