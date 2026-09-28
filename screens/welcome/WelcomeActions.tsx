import { Text, View, StyleSheet, Linking } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import DeviceInfo from 'react-native-device-info'
import { Trans, useTranslation } from 'react-i18next'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Routes
import { ROUTES } from '../../routes'
import type { RootStackParamList } from '../../types/navigation'

// Wallet self-custody (no depende de la cuenta)
import { useWallet } from '../../wallet/WalletContext'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPPressable from '../../ui/particles/QPPressable'

type WelcomeActionsProps = {
	navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>
}

/**
 * Bloque de CTAs compartido por las variantes del WelcomeScreen: botón primario
 * (Comenzar → Login), secundario fantasma (Crear cuenta → Register), un enlace
 * terciario al modo wallet (wallet self-custody sin cuenta), los términos y la
 * versión de la app. Entra con un FadeInDown retrasado para
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

	// Wallet sin cuenta: alta nueva (con PIN) o, si la seed ya está en el
	// teléfono (alta a medias o logout), directo al modo wallet
	const { hasWallet } = useWallet()
	const openWallet = () => {
		if (hasWallet) { navigation.reset({ index: 0, routes: [{ name: ROUTES.WALLET_ONLY }] }); return }
		navigation.navigate(ROUTES.WALLET_ONBOARDING, { guest: true })
	}

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
				{/* Terciario y ligero: la cuenta sigue siendo el camino principal */}
				<QPPressable onPress={openWallet} testID="welcome-wallet-link" style={styles.walletLink} accessibilityRole="button">
					<FontAwesome6 name="wallet" size={13} color={theme.colors.secondaryText} iconStyle="solid" />
					<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }}>
						{t(hasWallet ? 'welcome.actions.openWallet' : 'welcome.actions.walletOnly')}
					</Text>
				</QPPressable>
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
	// Aspecto de enlace, caja de botón: mismo alto y margen que QPButton (56 +
	// 5 arriba/abajo), así ocupa un hueco más de la botonera y el área táctil
	// es la de un botón
	walletLink: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		height: 56,
		marginVertical: 5,
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
