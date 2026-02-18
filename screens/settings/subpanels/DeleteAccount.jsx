import { View, Text, ScrollView, Linking } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from '../../../ui/particles/QPButton'

const CONSEQUENCES = [
	{
		icon: 'wallet',
		text: 'Tu saldo disponible será eliminado permanentemente',
	},
	{
		icon: 'clock-rotate-left',
		text: 'Tu historial de transacciones se eliminará',
	},
	{
		icon: 'handshake',
		text: 'Todas tus ofertas P2P activas serán canceladas',
	},
	{
		icon: 'address-card',
		text: 'Tu verificación KYC y datos personales se borrarán',
	},
	{
		icon: 'user-slash',
		text: 'Tu nombre de usuario quedará disponible para otros',
	},
]

const DeleteAccount = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const handleOpenSupport = () => { Linking.openURL('https://support.qvapay.com') }

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>Eliminar cuenta</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					Esta acción es permanente e irreversible
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
						Al eliminar tu cuenta:
					</Text>
					{CONSEQUENCES.map((item, index) => (
						<View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: index < CONSEQUENCES.length - 1 ? 14 : 0 }}>
							<FontAwesome6 name={item.icon} size={16} color={theme.colors.danger} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								{item.text}
							</Text>
						</View>
					))}
				</View>

				{/* Support info */}
				<View style={[containerStyles.card, { marginBottom: 20 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
						<FontAwesome6 name="headset" size={16} color={theme.colors.primary} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
							Para solicitar la eliminación de tu cuenta, crea un ticket en nuestro centro de soporte. Nuestro equipo procesará tu solicitud en un plazo de 48 horas.
						</Text>
					</View>
				</View>

				<View style={containerStyles.bottomButtonContainer}>
					<QPButton
						title="Contactar soporte"
						onPress={handleOpenSupport}
						style={{ backgroundColor: theme.colors.danger }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				</View>

			</ScrollView>
		</View>
	)
}

export default DeleteAccount
