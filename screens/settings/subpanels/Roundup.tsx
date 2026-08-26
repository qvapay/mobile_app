import { useEffect } from 'react'
import { View, Text, ScrollView, Switch } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Settings
import { useSettings } from '../../../settings/SettingsContext'

// API
import { savingApi } from '../../../api/savingApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/** Fila del panel de redondeo (las que aún no existen llegan disabled/comingSoon). */
type RoundupOption = {
	key: string
	label: string
	description: string
	icon: FontAwesome6SolidIconName
	value: boolean
	onToggle?: (value: boolean) => void
	disabled?: boolean
	comingSoon?: boolean
}

const Roundup = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const { roundup, updateSettings } = useSettings()

	// Sync local state with the backend flag (savings_roundup) on mount
	useEffect(() => {
		const syncFromBackend = async () => {
			const result = await savingApi.getSummary()
			// OJO: `SavingsSummary` (types/domain) no declara `savings_roundup`; el endpoint
			// SÍ lo manda. Forma local mientras no se amplíe el tipo compartido.
			if (result.success && typeof (result.data as { savings_roundup?: boolean } | undefined)?.savings_roundup === 'boolean') {
				const enabled = (result.data as unknown as { savings_roundup: boolean }).savings_roundup
				if (enabled !== roundup.enabled) {
					updateSettings('roundup', { enabled, destination: enabled ? 'savings' : null })
				}
			}
		}
		syncFromBackend()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const handleToggleEnabled = async (value: boolean) => {
		const previous = { ...roundup }
		updateSettings('roundup', { enabled: value, destination: value ? 'savings' : null })

		try {
			const result = await savingApi.updateRoundup(value)
			if (!result.success) {
				updateSettings('roundup', previous)
				toast.error(result.error || t('settings.roundup.toasts.updateFailed'))
			}
		} catch {
			updateSettings('roundup', previous)
			toast.error(t('settings.roundup.toasts.connectionError'))
		}
	}

	const options: RoundupOption[] = [
		{
			key: 'enabled',
			label: t('settings.roundup.options.enable.label'),
			description: t('settings.roundup.options.enable.description'),
			icon: 'coins',
			value: roundup.enabled,
			onToggle: handleToggleEnabled,
		},
		{
			key: 'savings',
			label: t('settings.roundup.options.savings.label'),
			description: t('settings.roundup.options.savings.description'),
			icon: 'piggy-bank',
			value: roundup.enabled,
			onToggle: handleToggleEnabled,
			disabled: !roundup.enabled,
		},
		{
			key: 'donations',
			label: t('settings.roundup.options.donations.label'),
			description: t('settings.roundup.options.donations.description'),
			icon: 'hand-holding-heart',
			value: false,
			comingSoon: true,
			disabled: true,
		},
	]

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

				<Text style={textStyles.h1}>{t('settings.roundup.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
					{t('settings.roundup.subtitle')}
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
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
									<Text style={[textStyles.h4, { marginBottom: 0 }]}>{option.label}</Text>
									{option.comingSoon && (
										<View style={{
											paddingHorizontal: 8,
											paddingVertical: 2,
											borderRadius: 10,
											backgroundColor: theme.colors.background,
										}}>
											<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs }]}>
												{t('settings.roundup.comingSoon')}
											</Text>
										</View>
									)}
								</View>
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
							{t('settings.roundup.info')}
						</Text>
					</View>
				</View>

			</ScrollView>
		</View>
	)
}

export default Roundup
