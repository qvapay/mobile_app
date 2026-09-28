import { Text, View, Image, StyleSheet } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

const LOGO_SIZE = 30

/**
 * Marca del welcome: isotipo (doble check) + "QvaPay" en texto plano, sin
 * halo ni animación — el movimiento de la pantalla es del hero (verbo
 * rotatorio + marquesinas). Logo blanco en dark / violeta en light.
 */
const BrandMark = () => {

	// Theme
	const { theme } = useTheme()

	return (
		<View style={styles.row}>
			<Image
				source={theme.isDark
					? require('../../assets/images/ui/qvapay-logo-white.png')
					: require('../../assets/images/ui/logo-qvapay.png')}
				style={styles.logo}
				resizeMode="contain"
			/>

			<Text style={[styles.name, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.semiBold }]}>
				QvaPay
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	logo: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
	},
	name: {
		fontSize: 21,
		letterSpacing: -0.4,
	},
})

export default BrandMark
