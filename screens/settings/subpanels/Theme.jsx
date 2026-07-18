import { StyleSheet, Text, View, Pressable, ScrollView, Switch } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useNavigation } from '@react-navigation/native'
import { toast } from 'sonner-native'

// Theme
import { useTheme, ACCENT_COLORS } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles, hexToRgba } from '../../../theme/themeUtils'

// Settings Context
import { useSettings } from '../../../settings/SettingsContext'

// Auth Context (GOLD gate for the accent picker)
import { useAuth } from '../../../auth/AuthContext'

// Routes
import { ROUTES } from '../../../routes'

const themeOptions = [
	{
		id: 'auto',
		title: 'Automático',
		icon: 'circle-half-stroke',
		description: 'Ajuste automático según el sistema'
	},
	{
		id: 'light',
		title: 'Claro',
		icon: 'sun',
		description: 'Usar el tema claro en todo momento'
	},
	{
		id: 'dark',
		title: 'Oscuro',
		icon: 'moon',
		description: 'Usar el tema oscuro en todo momento'
	}
]

// Theme Screen
const Theme = () => {

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
	const handleThemeSelect = async (themeId) => {
		try {
			await setThemeMode(themeId)
		} catch (error) { /* error updating theme */ }
	}

	// Accent color selection — non-GOLD taps become an upsell to GoldCheck
	const handleAccentSelect = async (accentId) => {
		if (!isGold) {
			toast('El color de acento es exclusivo de QvaPay GOLD')
			navigation.navigate(ROUTES.GOLD_CHECK)
			return
		}
		try {
			await setAccentColor(accentId)
		} catch (error) { /* error updating accent */ }
	}

	// Bottom bar labels toggle for Accessibility
	const handleBottomBarLabelsToggle = async (value) => {
		try {
			await updateSettings('appearance', { bottomBarLabels: value })
		} catch (error) { /* error updating bottom bar labels */ }
	}

	// Theme Option Component
	const ThemeOption = ({ option, isSelected, onPress }) => {
		return (
			<Pressable style={[containerStyles.box, styles.themeOption, isSelected && { borderColor: theme.colors.primary, backgroundColor: hexToRgba(theme.colors.primary, 0.05) }]} onPress={onPress} >
				<View style={styles.optionContent}>
					<View style={[styles.iconContainer, { backgroundColor: hexToRgba(theme.colors.primary, 0.1) }]}>
						<FontAwesome6 name={option.icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
					</View>
					<View style={styles.textContainer}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
							{option.title}
						</Text>
						<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
							{option.description}
						</Text>
					</View>
				</View>
			</Pressable>
		)
	}

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>Tema</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Personaliza la apariencia de la aplicación</Text>
			</View>

			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>Apariencia</Text>
			<View style={styles.optionsContainer}>
				{themeOptions.map((option, index) => (
					<ThemeOption
						key={option.id}
						option={option}
						isSelected={currentTheme === option.id}
						onPress={() => handleThemeSelect(option.id)}
					/>
				))}
			</View>

			<View style={[styles.infoBox, { marginBottom: 20, backgroundColor: hexToRgba(theme.colors.primary, 0.05), borderColor: hexToRgba(theme.colors.primary, 0.1) }]}>
				<FontAwesome6 name="circle-info" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginLeft: 8 }]}>
					Los cambios se aplican inmediatamente
				</Text>
			</View>

			{/** Color de acento (exclusivo GOLD) */}
			<View style={styles.accentHeader}>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText, paddingHorizontal: 2 }]}>Color de acento</Text>
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
								accessibilityLabel={`Color ${accent.name}`}
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
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
						{isGold ? `Color actual: ${currentAccent.name}` : 'Personaliza el color de la app con QvaPay GOLD'}
					</Text>
				</View>
			</View>

			{/** Ícono */}
			{/* <Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>Ícono</Text> */}

			{/** Barra de navegación */}
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2, marginTop: 20 }]}>Barra de navegación</Text>
			<View style={[containerStyles.box, styles.settingRow]}>
				<View style={styles.settingContent}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Mostrar texto</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
						Mostrar etiquetas en la barra de navegación
					</Text>
				</View>
				<View style={{ width: 50, height: 30 }}>
					<Switch
						value={settings.appearance.bottomBarLabels}
						onValueChange={handleBottomBarLabelsToggle}
						trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
						thumbColor={settings.appearance.bottomBarLabels ? '#FFFFFF' : theme.colors.secondaryText}
					/>
				</View>
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
		marginBottom: 5,
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
		padding: 16,
		marginBottom: 20,
	},
	swatchGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
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
	accentFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		marginTop: 12,
	},
	settingRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 16,
		marginBottom: 12,
	},
	settingContent: {
		flex: 1,
	},
})

export default Theme