import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Lottie
import LottieView from 'lottie-react-native'

// Context and Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Routes
import { ROUTES } from '../../routes'

// Show a success message with a button to go back to the home screen
const SendSuccess = ({ navigation }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()

	// Render
	return (
		<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>

			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<LottieView source={require('../../assets/lotties/completed.json')} autoPlay loop={false} style={{ width: 500, height: 350 }} />
				<Text style={textStyles.h2}>Pago completado</Text>
				<Text style={[textStyles.h6, { textAlign: 'center', paddingHorizontal: 20, color: theme.colors.secondaryText }]}>
					Hemos procesado este pago y estará en su destino en pocos segundos.
				</Text>
			</View>

			<View style={[containerStyles.bottomButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
				<QPButton
					title="Volver al inicio"
					onPress={() => navigation.navigate(ROUTES.MAIN_STACK)}
					textStyle={{ color: theme.colors.buttonText }}
				/>
			</View>
		</View>
	)
}

export default SendSuccess