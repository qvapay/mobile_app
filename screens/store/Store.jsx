import { View, Text, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles } from '../../theme/themeUtils'

// User Context
import { useAuth } from '../../auth/AuthContext'

// Store component
const Store = () => {

	// Contexts
	const { user } = useAuth()
	const { theme } = useTheme()
	const containerStyles = createContainerStyles(theme)

	return (
		<View style={[styles.container, { backgroundColor: theme.colors.background }]}>
			<Text>Store Screen</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingHorizontal: 20,
	},
})

export default Store