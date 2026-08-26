import { Text, View, StyleSheet, Linking } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import DeviceInfo from 'react-native-device-info'
import { Trans, useTranslation } from 'react-i18next'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Routes
import { ROUTES } from '../../routes'
import type { RootStackParamList } from '../../types/navigation'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

type WelcomeActionsProps = {
	navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>
}

/**
 * Bloque de CTAs compartido por las variantes del WelcomeScreen: botón primario
 * (Comenzar → Login), secundario fantasma (Crear cuenta → Register), enlace a
 * los términos y la versión de la app. Entra con un FadeInDown retrasado para
 * ceder el protagonismo al hero de cada variante.
 *
 * @param props
 * @param props.navigation - Navigation del stack.
 */
const WelcomeActions = ({ navigation }: WelcomeActionsProps) => {

	// Theme
	const { theme } = useTheme()

	// Idioma activo
	const { t } = useTranslation()

	return (
		<Animated.View entering={FadeInDown.delay(500).duration(700)} style={styles.container}>
			<View style={styles.buttons}>
				<QPButton
					title={t('welcome.actions.start')}
					onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)}
					textStyle={{ fontSize: theme.typography.fontSize.lg }}
				/>
				<QPButton
					title={t('welcome.actions.createAccount')}
					onPress={() => navigation.navigate(ROUTES.REGISTER_SCREEN)}
					style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.primary + '60' }}
					textStyle={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.primaryText }}
				/>
			</View>

			{/* La frase de términos vive en UNA sola clave (el enlace va como <0> vía
			    Trans) — nunca partir la oración en claves por el Text anidado */}
			<Text style={[styles.terms, { color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }]}>
				<Trans
					i18nKey="welcome.actions.terms"
					components={[
						<Text
							style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }}
							onPress={() => Linking.openURL(ROUTES.TERMS_AND_CONDITIONS)}
						/>,
					]}
				/>
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
