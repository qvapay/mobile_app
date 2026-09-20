import { View, Text, StyleSheet } from 'react-native'

// Contexts
import { useTheme } from '../theme/ThemeContext'

// UI
import { createTextStyles } from '../theme/themeUtils'

// Particles
import SettingsItem from './particles/SettingsItem'
import SettingsToggleRow from './particles/SettingsToggleRow'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { SettingsStackParamList } from '../types/navigation'

/** Rutas navegables desde una fila de Ajustes (mismo contrato que SettingsItem). */
type SettingsScreenName = keyof SettingsStackParamList

/** Fila que navega a una pantalla (screens/settings/settings.ts). */
export type SettingsNavItem = {
	title: string
	icon?: FontAwesome6SolidIconName
	color?: string
	screen: SettingsScreenName
	enabled?: boolean
	showBadge?: boolean
	verified?: boolean
	pill?: string
}

/** Fila con interruptor (flags locales sin pantalla propia). */
export type SettingsToggleItem = {
	title: string
	subtitle?: string
	icon?: FontAwesome6SolidIconName
	color?: string
	enabled?: boolean
	toggle: {
		value: boolean
		onValueChange: (value: boolean) => void
		disabled?: boolean
	}
}

/** Definición de una fila del menú de Ajustes. */
export type SettingsSectionItem = SettingsNavItem | SettingsToggleItem

const isToggleItem = (item: SettingsSectionItem): item is SettingsToggleItem => 'toggle' in item

type SettingsSectionProps = {
	title: string
	items: SettingsSectionItem[]
	navigation: { navigate: (screen: SettingsScreenName) => void }
}

// Inset del separador: paddingHorizontal del box (16) + tile de icono (30) + gap (12),
// para que la línea arranque alineada con el texto como en iOS Settings
const SEPARATOR_INSET = 58

/**
 * Titled group of rows on the Settings menu: navigation rows (SettingsItem)
 * and toggle rows (SettingsToggleRow) share one box. Items with
 * `enabled: false` are filtered out before rendering, and each row receives
 * its index/total so only the group's outer corners are rounded.
 * Rows are divided by hairline separators inset to the text edge.
 *
 * @param props
 * @param props.title - Section heading (rendered as a spaced eyebrow).
 * @param props.items - Row definitions.
 * @param props.navigation - React Navigation object forwarded to each row.
 */
const SettingsSection = ({ title, items, navigation }: SettingsSectionProps) => {

	// Contexts
	const { theme } = useTheme()

	// Styles
	const textStyles = createTextStyles(theme)

	const enabledItems = items.filter(item => item.enabled !== false)

	return (
		<View style={styles.section}>
			<Text style={[textStyles.h7, styles.heading, { color: theme.colors.secondaryText }]}>{title}</Text>
			{enabledItems.map((item, index) => (
				<View key={isToggleItem(item) ? item.title : item.screen || item.title}>
					{index > 0 && (
						<View style={{ backgroundColor: theme.colors.elevation }}>
							<View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
						</View>
					)}
					{isToggleItem(item) ? (
						<SettingsToggleRow
							title={item.title}
							subtitle={item.subtitle}
							icon={item.icon}
							color={item.color}
							value={item.toggle.value}
							onValueChange={item.toggle.onValueChange}
							disabled={item.toggle.disabled}
							index={index}
							totalItems={enabledItems.length}
						/>
					) : (
						<SettingsItem
							title={item.title}
							icon={item.icon}
							color={item.color}
							screen={item.screen}
							index={index}
							totalItems={enabledItems.length}
							navigation={navigation}
							showBadge={item.showBadge}
							verified={item.verified}
							pill={item.pill}
						/>
					)}
				</View>
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginTop: 14,
	},
	heading: {
		marginBottom: 6,
		paddingHorizontal: 4,
		letterSpacing: 1,
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		marginLeft: SEPARATOR_INSET,
		opacity: 0.5,
	},
})

export default SettingsSection
