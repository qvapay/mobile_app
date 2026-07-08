import { View, Text } from 'react-native'

// Contexts
import { useTheme } from '../theme/ThemeContext'

// UI
import { createTextStyles } from '../theme/themeUtils'

// Particles
import SettingsItem from './particles/SettingsItem'

/**
 * Titled group of SettingsItem rows on the Settings menu. Items with
 * `enabled: false` are filtered out before rendering, and each row receives
 * its index/total so SettingsItem can round only the group's outer corners.
 *
 * @param {object} props
 * @param {string} props.title - Section heading.
 * @param {{title: string, icon: string, screen: string, enabled?: boolean, showBadge?: boolean}[]} props.items - Row definitions.
 * @param {object} props.navigation - React Navigation object forwarded to each row.
 */
const SettingsSection = ({ title, items, navigation }) => {

	// Contexts
	const { theme } = useTheme()

	// Styles
	const textStyles = createTextStyles(theme)

	const enabledItems = items.filter(item => item.enabled !== false)

	return (
		<View style={{ marginTop: 10 }}>
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>{title}</Text>
			{enabledItems.map((item, index) => (
				<SettingsItem
					key={index}
					title={item.title}
					icon={item.icon}
					screen={item.screen}
					index={index}
					totalItems={enabledItems.length}
					navigation={navigation}
					showBadge={item.showBadge}
				/>
			))}
		</View>
	)
}

export default SettingsSection