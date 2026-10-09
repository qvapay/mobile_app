import { StyleSheet, Text, View, Pressable } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useTextStyles, useContainerStyles, hexToRgba } from '../../../theme/themeUtils'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

type SettingsChoiceCardProps = {
	icon: FontAwesome6SolidIconName
	title: string
	description: string
	isSelected: boolean
	onPress: () => void
}

/**
 * Tarjeta de opción única (icono + título + descripción, borde de acento al
 * estar elegida) de los paneles Idioma y Tema. Vive a nivel de módulo: definida
 * dentro del panel era un tipo de componente nuevo en cada render y React
 * desmontaba y remontaba todas las tarjetas en vez de actualizarlas.
 */
const SettingsChoiceCard = ({ icon, title, description, isSelected, onPress }: SettingsChoiceCardProps) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	return (
		<Pressable style={[containerStyles.box, styles.card, isSelected && { borderColor: theme.colors.primary, backgroundColor: hexToRgba(theme.colors.primary, 0.05) }]} onPress={onPress} >
			<View style={styles.content}>
				<View style={[styles.iconContainer, { backgroundColor: hexToRgba(theme.colors.primary, 0.1) }]}>
					<FontAwesome6 name={icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.secondaryText} iconStyle="solid" />
				</View>
				<View style={styles.textContainer}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>
						{title}
					</Text>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 4 }]}>
						{description}
					</Text>
				</View>
			</View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	card: {
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: 'transparent',
	},
	content: {
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
})

export default SettingsChoiceCard
