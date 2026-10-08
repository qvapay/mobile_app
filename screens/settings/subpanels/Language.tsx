import { StyleSheet, Text, View, ScrollView } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles, hexToRgba } from '../../../theme/themeUtils'

// Settings Context
import { useSettings } from '../../../settings/SettingsContext'

import SettingsChoiceCard from './SettingsChoiceCard'

// Las opciones llevan CLAVES de i18n resueltas en render, así el propio panel
// cambia de idioma en vivo al tocar una opción. Los títulos de 'es'/'en' son
// idénticos en ambos bundles a propósito: cada idioma se muestra en sí mismo,
// como en los ajustes del sistema.
// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { Settings } from '../../../settings/settingsConstants'

/** Preferencia persistida: 'auto' + los idiomas soportados por el bundle. */
type LanguagePreference = Settings['language']['currentLanguage']

type LanguageOptionDef = { id: LanguagePreference, icon: FontAwesome6SolidIconName }

const languageOptions: LanguageOptionDef[] = [
	{ id: 'auto', icon: 'wand-magic-sparkles' },
	{ id: 'es', icon: 'earth-americas' },
	{ id: 'en', icon: 'globe' },
	{ id: 'pt', icon: 'earth-americas' },
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

	const handleLanguageSelect = async (languageId: LanguagePreference) => {
		try {
			await updateSettings('language', { currentLanguage: languageId })
		} catch (error) { /* error updating language */ }
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
					<SettingsChoiceCard
						key={option.id}
						icon={option.icon}
						title={t(`settings.language.options.${option.id}.title`)}
						description={t(`settings.language.options.${option.id}.description`)}
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
