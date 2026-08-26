import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// Routes
import { ROUTES } from '../../routes'
import type { RootStackParamList } from '../../types/navigation'

// Settings Context
import { useSettings } from '../../settings/SettingsContext'

// Hero + CTAs compartidos
import WelcomeActions from './WelcomeActions'
import WelcomeKinetic from './WelcomeKinetic'

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>

/**
 * Unauthenticated landing screen. El hero es "Kinetic": wordmark QvaPay con
 * destello Skia, tipografía editorial con verbo rotatorio a color sobre
 * marquesinas diagonales infinitas (`WelcomeKinetic.tsx`); los CTAs
 * (Login / Register / términos / versión) viven en WelcomeActions.
 * Hidden gesture: long-press en el headline re-arma el onboarding
 * (`appearance.firstTime` + reset a Onboard).
 */
const WelcomeScreen = ({ navigation }: Props) => {

	// Settings context
	const { updateSetting } = useSettings()

	// Long press en el headline → re-armar el onboarding
	const handleSecretLongPress = async () => {
		try {
			await updateSetting('appearance', 'firstTime', true)
			navigation.reset({ index: 0, routes: [{ name: ROUTES.ONBOARD_SCREEN }] })
		} catch { /* error resetting app */ }
	}

	return (
		<WelcomeKinetic
			navigation={navigation}
			onSecretLongPress={handleSecretLongPress}
			actions={<WelcomeActions navigation={navigation} />}
		/>
	)
}

export default WelcomeScreen
