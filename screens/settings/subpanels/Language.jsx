import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles, hexToRgba } from '../../../theme/themeUtils'

// Settings Context
import { useSettings } from '../../../settings/SettingsContext'

// Las opciones llevan CLAVES de i18n resueltas en render, así el propio panel
// cambia de idioma en vivo al tocar una opción. Los títulos de 'es'/'en' son
// idénticos en ambos bundles a propósito: cada idioma se muestra en sí mismo,
// como en los ajustes del sistema.
const languageOptions = [
	{ id: 'auto', icon: 'wand-magic-sparkles' },
	{ id: 'es', icon: 'earth-americas' },
	{ id: 'en', icon: 'globe' },
]

// Language Screen
const Language = () => {

	// Settings Context — persiste la preferencia; LanguageSync (App.tsx) la
	// aplica a i18next y toda la app se re-renderiza en el idioma nuevo
	const { settings, updateSettings } = useSettings()
	const currentLanguage = settings.language?.currentLanguage || 'auto'

	// Idioma activo (re-renderiza este panel al cambiar)
	const { t } = useTranslation()

	// Theme variables, dark and light modes
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const handleLanguageSelect = async (languageId) => {
		try {
			await updateSettings('language', { currentLanguage: languageId })
		} catch (error) { /* error updating language */ }
	}

	// Language Option Component
	const LanguageOption = ({ option, isSelected, onPress }) => {
		return (
			<Pressable style={[containerStyles.box, styles.languageOption, isSelected && { borderColor: theme.colors.primary, backgroundColor: hexToRgba(theme.colors.primary, 0.05) }]} onPress={onPress} >
				<View style={styles.optionContent}>
					<View style={[styles.iconContainer, { backgroundColor: hexToRgba(theme.colors.primary, 0.1) }]}>
						<FontAwesome6 name={option.icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
					</View>
					<View style={styles.textContainer}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
							{t(`settings.language.options.${option.id}.title`)}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
							{t(`settings.language.options.${option.id}.description`)}
						</Text>
					</View>
				</View>
			</Pressable>
		)
	}

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>{t('settings.language.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.language.subtitle')}</Text>
			</View>

			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 8, paddingHorizontal: 2 }]}>{t('settings.language.sectionLabel')}</Text>
			<View style={styles.optionsContainer}>
				{languageOptions.map((option) => (
					<LanguageOption
						key={option.id}
						option={option}
						isSelected={currentLanguage === option.id}
						onPress={() => handleLanguageSelect(option.id)}
					/>
				))}
			</View>

			<View style={[styles.infoBox, { backgroundColor: hexToRgba(theme.colors.primary, 0.05), borderColor: hexToRgba(theme.colors.primary, 0.1) }]}>
				<FontAwesome6 name="circle-info" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginLeft: 8 }]}>
					{t('settings.language.appliedImmediately')}
				</Text>
			</View>

		</ScrollView>
	)
}

const styles = StyleSheet.create({
	header: {
		marginBottom: 24,
	},
	optionsContainer: {
		gap: 12,
		marginBottom: 12,
	},
	languageOption: {
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: 'transparent',
	},
	optionContent: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	iconContainer: {
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 16,
	},
	textContainer: {
		flex: 1,
	},
	infoBox: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		marginBottom: 24,
	},
})

export default Language
