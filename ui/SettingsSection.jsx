import { View, Text } from 'react-native'

// Contexts
import { useTheme } from '../theme/ThemeContext'

// UI
import { createTextStyles } from '../theme/themeUtils'

// Particles
import SettingsItem from './particles/SettingsItem'

// Settings Item
const SettingsSection = ({ title, items, navigation }) => {

	// Contexts
	const { theme } = useTheme()

	// Styles
	const textStyles = createTextStyles(theme)

	return (
		<View style={{ marginTop: 10 }}>
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText, marginBottom: 5, paddingHorizontal: 2 }]}>{title}</Text>
			{items.filter(item => item.enabled !== false).map((item, index, filtered) => (
				<SettingsItem
					key={index}
					title={item.title}
					icon={item.icon}
					screen={item.screen}
					index={index}
					totalItems={filtered.length}
					navigation={navigation}
					showBadge={item.showBadge}
				/>
			))}
		</View>
	)
}

export default SettingsSection