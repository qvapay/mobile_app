import { StyleSheet, Text, View, Pressable, ScrollView, Switch, Image, Platform } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import { toast } from 'sonner-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme, ACCENT_COLORS } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles, hexToRgba } from '../../../theme/themeUtils'

// Settings Context
import { useSettings } from '../../../settings/SettingsContext'

// Auth Context (GOLD gate for the accent picker)
import { useAuth } from '../../../auth/AuthContext'

// Routes
import { ROUTES } from '../../../routes'

// App icon catalog + native bridge (GOLD)
import { APP_ICONS, changeAppIcon } from '../../../helpers/appIcon'

// Las opciones llevan CLAVES de i18n (settings.themePanel.options.<id>) resueltas
// en render, así el panel cambia de idioma en vivo
// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { ThemeMode } from '../../../theme/ThemeContext'

type ThemeOptionDef = { id: ThemeMode, icon: FontAwesome6SolidIconName }

const themeOptions: ThemeOptionDef[] = [
	{ id: 'auto', icon: 'circle-half-stroke' },
	{ id: 'light', icon: 'sun' },
	{ id: 'dark', icon: 'moon' },
]

// Theme Screen
const Theme = () => {

	// Idioma activo (re-renderiza este panel al cambiar)
	const { t } = useTranslation()

	// Settings Context
	const { settings, updateSettings } = useSettings()
	const currentTheme = settings.appearance.theme

	// Theme variables, dark and light modes with memoized styles
	const { theme, setThemeMode, accentKey, setAccentColor } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// GOLD gate for the accent picker
	const { user } = useAuth()
	const navigation = useNavigation()
	const isGold = !!user?.golden_check
	// Non-GOLD users always see the brand accent selected, even if an old choice persists
	const selectedAccentId = isGold ? accentKey : 'default'
	const currentAccent = ACCENT_COLORS.find(a => a.id === selectedAccentId) || ACCENT_COLORS[0]
	const goldTextColor = theme.isDark ? theme.colors.gold : '#8B6914'

	// Dark, Light and Auto theme selection
	const handleThemeSelect = async (themeId: ThemeMode) => {
		try {
			await setThemeMode(themeId)
		} catch (error) { /* error updating theme */ }
	}

	// Accent color selection — non-GOLD taps become an upsell to GoldCheck
	const handleAccentSelect = async (accentId: string) => {
		if (!isGold) {
			toast(t('settings.themePanel.toasts.accentGoldOnly'))
			navigation.navigate(ROUTES.GOLD_CHECK)
			return
		}
		try {
			await setAccentColor(accentId)
		} catch (error) { /* error updating accent */ }
	}

	// Ícono de la app (exclusivo GOLD). A diferencia del acento, el icono
	// seleccionado se muestra SIEMPRE tal cual está en el dispositivo (revertirlo
	// al expirar GOLD dispararía la alerta del sistema de iOS en un momento
	// arbitrario); si GOLD expira solo se bloquea elegir otro.
	const selectedIconId = settings.appearance.appIcon || 'default'
	const currentIconName = t(`settings.themePanel.icons.${selectedIconId}`)
	const handleIconSelect = async (iconId: string) => {
		if (!isGold) {
			toast(t('settings.themePanel.toasts.iconGoldOnly'))
			navigation.navigate(ROUTES.GOLD_CHECK)
			return
		}
		if (iconId === selectedIconId) return
		try {
			await changeAppIcon(iconId)
			await updateSettings('appearance', { appIcon: iconId })
		} catch (error) {
			// El SO rechazó el cambio (o el usuario canceló): no persistir nada
			toast(t('settings.themePanel.toasts.iconChangeFailed'))
		}
	}

	// Bottom bar labels toggle for Accessibility
	const handleBottomBarLabelsToggle = async (value: boolean) => {
		try {
			await updateSettings('appearance', { bottomBarLabels: value })
		} catch (error) { /* error updating bottom bar labels */ }
	}

	// Theme Option Component
	const ThemeOption = ({ option, isSelected, onPress }: { option: ThemeOptionDef, isSelected: boolean, onPress: () => void }) => {
		return (
			<Pressable style={[containerStyles.box, styles.themeOption, isSelected && { borderColor: theme.colors.primary, backgroundColor: hexToRgba(theme.colors.primary, 0.05) }]} onPress={onPress} >
				<View style={styles.optionContent}>
					<View style={[styles.iconContainer, { backgroundColor: hexToRgba(theme.colors.primary, 0.1) }]}>
						<FontAwesome6 name={option.icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
					</View>
					<View style={styles.textContainer}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
							{t(`settings.themePanel.options.${option.id}.title`)}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
							{t(`settings.themePanel.options.${option.id}.description`)}
						</Text>
					</View>
				</View>
			</Pressable>
		)
	}

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>{t('settings.themePanel.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.themePanel.subtitle')}</Text>
			</View>

			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 8, paddingHorizontal: 2 }]}>{t('settings.themePanel.appearanceLabel')}</Text>
			<View style={styles.optionsContainer}>
				{themeOptions.map((option, _index) => (
					<ThemeOption
						key={option.id}
						option={option}
						isSelected={currentTheme === option.id}
						onPress={() => handleThemeSelect(option.id)}
					/>
				))}
			</View>

			<View style={[styles.infoBox, { marginBottom: 24, backgroundColor: hexToRgba(theme.colors.primary, 0.05), borderColor: hexToRgba(theme.colors.primary, 0.1) }]}>
				<FontAwesome6 name="circle-info" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginLeft: 8 }]}>
					{t('settings.themePanel.appliedImmediately')}
				</Text>
			</View>

			{/** Color de acento (exclusivo GOLD) */}
			<View style={styles.accentHeader}>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText, paddingHorizontal: 2 }]}>{t('settings.themePanel.accentLabel')}</Text>
				<View style={[styles.goldBadge, { backgroundColor: hexToRgba(theme.colors.gold, 0.15) }]}>
					<FontAwesome6 name="crown" size={10} color={goldTextColor} iconStyle="solid" />
					<Text style={[styles.goldBadgeText, { color: goldTextColor, fontFamily: theme.typography.fontFamily.medium }]}>GOLD</Text>
				</View>
			</View>
			<View style={[containerStyles.box, styles.accentCard]}>
				<View style={styles.swatchGrid}>
					{ACCENT_COLORS.map((accent) => {
						const isSelected = selectedAccentId === accent.id
						return (
							<Pressable
								key={accent.id}
								onPress={() => handleAccentSelect(accent.id)}
								accessibilityRole="button"
								accessibilityLabel={t('settings.themePanel.accessibilityColor', { name: t(`settings.themePanel.accents.${accent.id}`) })}
								style={[styles.swatchRing, isSelected && { borderColor: accent.color }]}
							>
								<View style={[styles.swatch, { backgroundColor: accent.color }, !isGold && !isSelected && styles.swatchLocked]}>
									{isSelected && <FontAwesome6 name="check" size={13} color="#FFFFFF" iconStyle="solid" />}
								</View>
							</Pressable>
						)
					})}
				</View>
				<View style={styles.accentFooter}>
					{!isGold && <FontAwesome6 name="lock" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />}
					<Text style={[textStyles.caption, styles.accentFooterText, { color: theme.colors.tertiaryText }]}>
						{isGold ? t('settings.themePanel.currentColor', { name: t(`settings.themePanel.accents.${currentAccent.id}`) }) : t('settings.themePanel.accentUpsell')}
					</Text>
				</View>
			</View>

			{/** Ícono de la app (exclusivo GOLD) */}
			<View style={styles.accentHeader}>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText, paddingHorizontal: 2 }]}>{t('settings.themePanel.iconLabel')}</Text>
				<View style={[styles.goldBadge, { backgroundColor: hexToRgba(theme.colors.gold, 0.15) }]}>
					<FontAwesome6 name="crown" size={10} color={goldTextColor} iconStyle="solid" />
					<Text style={[styles.goldBadgeText, { color: goldTextColor, fontFamily: theme.typography.fontFamily.medium }]}>GOLD</Text>
				</View>
			</View>
			<View style={[containerStyles.box, styles.accentCard]}>
				<View style={styles.swatchGrid}>
					{APP_ICONS.map((icon) => {
						const isSelected = selectedIconId === icon.id
						return (
							<Pressable
								key={icon.id}
								onPress={() => handleIconSelect(icon.id)}
								accessibilityRole="button"
								accessibilityLabel={t('settings.themePanel.accessibilityIcon', { name: t(`settings.themePanel.icons.${icon.id}`) })}
								style={[styles.iconRing, isSelected && { borderColor: theme.colors.primary }]}
							>
								<Image source={icon.preview} style={[styles.iconTile, !isGold && !isSelected && styles.swatchLocked]} />
							</Pressable>
						)
					})}
				</View>
				<View style={styles.accentFooter}>
					{!isGold && <FontAwesome6 name="lock" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />}
					<Text style={[textStyles.caption, styles.accentFooterText, { color: theme.colors.tertiaryText }]}>
						{isGold ? t('settings.themePanel.currentIcon', { name: currentIconName }) : t('settings.themePanel.iconUpsell')}
					</Text>
				</View>
				{isGold && Platform.OS === 'ios' && (
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
						{t('settings.themePanel.iosIconAlert')}
					</Text>
				)}
			</View>

			{/** Barra de navegación */}
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 8, paddingHorizontal: 2 }]}>{t('settings.themePanel.navBarLabel')}</Text>
			<View style={[containerStyles.box, styles.settingRow]}>
				<View style={styles.settingContent}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{t('settings.themePanel.showLabelsTitle')}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
						{t('settings.themePanel.showLabelsDescription')}
					</Text>
				</View>
				<Switch
					value={settings.appearance.bottomBarLabels}
					onValueChange={handleBottomBarLabelsToggle}
					trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
					thumbColor={settings.appearance.bottomBarLabels ? '#FFFFFF' : theme.colors.secondaryText}
				/>
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
	themeOption: {
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
	},
	accentHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginBottom: 8,
	},
	goldBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 10,
	},
	goldBadgeText: {
		fontSize: 11,
	},
	accentCard: {
		flexDirection: 'column',
		alignItems: 'stretch',
		paddingHorizontal: 20,
		paddingVertical: 18,
		marginBottom: 24,
	},
	swatchGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	swatchRing: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 2,
		borderColor: 'transparent',
		alignItems: 'center',
		justifyContent: 'center',
	},
	swatch: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: 'center',
		justifyContent: 'center',
	},
	swatchLocked: {
		opacity: 0.4,
	},
	iconRing: {
		width: 68,
		height: 68,
		borderRadius: 20,
		borderCurve: 'continuous',
		borderWidth: 2,
		borderColor: 'transparent',
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconTile: {
		width: 56,
		height: 56,
		borderRadius: 16,
		borderCurve: 'continuous',
	},
	accentFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		marginTop: 16,
	},
	accentFooterText: {
		flexShrink: 1,
	},
	settingRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		paddingVertical: 16,
		marginBottom: 12,
	},
	settingContent: {
		flex: 1,
		paddingRight: 12,
	},
})

export default Theme