import { Text, View, StyleSheet, Linking } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import DeviceInfo from 'react-native-device-info'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Routes
import { ROUTES } from '../../routes'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

/**
 * Bloque de CTAs compartido por las variantes del WelcomeScreen: botón primario
 * (Comenzar → Login), secundario fantasma (Crear cuenta → Register), enlace a
 * los términos y la versión de la app. Entra con un FadeInDown retrasado para
 * ceder el protagonismo al hero de cada variante.
 *
 * @param {object} props
 * @param {object} props.navigation - Navigation del stack.
 */
const WelcomeActions = ({ navigation }) => {

	// Theme
	const { theme } = useTheme()

	return (
		<Animated.View entering={FadeInDown.delay(500).duration(700)} style={styles.container}>
			<View style={styles.buttons}>
				<QPButton
					title="Comenzar"
					onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}
					textStyle={{ fontSize: theme.typography.fontSize.lg }}
				/>
				<QPButton
					title="Crear cuenta"
					onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)}
					style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.primary + '60' }}
					textStyle={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.primaryText }}
				/>
			</View>

			<Text style={[styles.terms, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
				Al continuar, aceptas nuestros{' '}
				<Text
					style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }}
					onPress={() => Linking.openURL(ROUTES.TERMS_AND_CONDITIONS)}
				>
					Términos y Condiciones
				</Text>
			</Text>

			<Text style={[styles.version, { color: theme.colors.tertiaryText + '40', fontFamily: theme.typography.fontFamily.regular }]}>
				v{DeviceInfo.getVersion()}
			</Text>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 24,
	},
	buttons: {
		gap: 4,
	},
	terms: {
		textAlign: 'center',
		marginTop: 16,
		lineHeight: 18,
	},
	version: {
		fontSize: 9,
		textAlign: 'center',
		paddingVertical: 6,
	},
})

export default WelcomeActions
