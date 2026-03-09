import { View, Text, ScrollView, Switch } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// API
import { userApi } from '../../../api/userApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

const Roundup = () => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { roundup, updateSettings } = useSettings()

	const handleToggleEnabled = async (value) => {
		const previous = { ...roundup }
		const newSettings = { enabled: value, destination: value ? (roundup.destination || 'savings') : null }
		updateSettings('roundup', newSettings)

		try {
			const result = await userApi.updateRoundupSettings(newSettings)
			if (!result.success) {
				updateSettings('roundup', previous)
				toast.error('No se pudo actualizar la configuración')
			}
		} catch {
			updateSettings('roundup', previous)
			toast.error('Error de conexión')
		}
	}

	const handleSetDestination = async (destination) => {
		if (!roundup.enabled) return
		const previous = { ...roundup }
		const newSettings = { ...roundup, destination }
		updateSettings('roundup', newSettings)

		try {
			const result = await userApi.updateRoundupSettings(newSettings)
			if (!result.success) {
				updateSettings('roundup', previous)
				toast.error('No se pudo actualizar la configuración')
			}
		} catch {
			updateSettings('roundup', previous)
			toast.error('Error de conexión')
		}
	}

	const options = [
		{
			key: 'enabled',
			label: 'Activar Micro pagos',
			description: 'Redondea hacia arriba tus pagos y guarda la diferencia',
			icon: 'coins',
			isToggle: true,
			value: roundup.enabled,
			onToggle: handleToggleEnabled,
		},
		{
			key: 'savings',
			label: 'Enviar a Ahorros',
			description: 'Los kilitos se envían a tu cuenta de ahorros',
			icon: 'piggy-bank',
			isToggle: true,
			value: roundup.enabled && roundup.destination === 'savings',
			onToggle: () => handleSetDestination('savings'),
			disabled: !roundup.enabled,
		},
		{
			key: 'donations',
			label: 'Enviar a Donaciones',
			description: 'Los kilitos se destinan a donaciones comunitarias',
			icon: 'hand-holding-heart',
			isToggle: true,
			value: roundup.enabled && roundup.destination === 'donations',
			onToggle: () => handleSetDestination('donations'),
			disabled: !roundup.enabled,
		},
	]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>Micro pagos</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					Redondea tus pagos y ahorra los kilitos
				</Text>

				<View style={{ marginTop: 20, gap: 10 }}>
					{options.map((option) => (
						<View
							key={option.key}
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								backgroundColor: theme.colors.surface,
								borderRadius: 12,
								padding: 16,
								opacity: option.disabled ? 0.5 : 1,
							}}
						>
							<View style={{
								width: 40,
								height: 40,
								borderRadius: 20,
								alignItems: 'center',
								justifyContent: 'center',
								backgroundColor: option.value ? theme.colors.primary + '20' : theme.colors.background,
								marginRight: 12,
							}}>
								<FontAwesome6
									name={option.icon}
									size={18}
									color={option.value ? theme.colors.primary : theme.colors.tertiaryText}
									iconStyle="solid"
								/>
							</View>

							<View style={{ flex: 1 }}>
								<Text style={[textStyles.h4, { marginBottom: 0 }]}>{option.label}</Text>
								<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 2 }]}>
									{option.description}
								</Text>
							</View>

							<Switch
								value={option.value}
								onValueChange={option.onToggle}
								disabled={option.disabled}
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
							Al pagar $4.30, se cobra $5.00 y los $0.70 restantes se envían al destino seleccionado. Aplica en cobros, facturas y compras de paquetes.
						</Text>
					</View>
				</View>

			</ScrollView>
		</View>
	)
}

export default Roundup
