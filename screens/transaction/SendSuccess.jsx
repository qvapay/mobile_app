import { useState, useEffect } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Lottie
import LottieView from 'lottie-react-native'

// Context and Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Settings
import { useSettings } from '../../settings/SettingsContext'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Sound
import playSound from '../../helpers/playSound'

// Routes
import { ROUTES } from '../../routes'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'
import PushPromptModal from '../../ui/PushPromptModal'

// In-app review
import { maybeRequestReview } from '../../helpers/inAppReview'

// Show a success message with a button to go back to the home screen
const SendSuccess = ({ navigation }) => {

	// Contexts
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const { sounds } = useSettings()
	const { shouldShowPostTxPrompt, enablePush, dismissPostTxPrompt } = usePushPrompt()

	// Push prompt state
	const [showPushPrompt, setShowPushPrompt] = useState(false)

	// Play money out sound on mount
	useEffect(() => {
		if (sounds.enabled && sounds.transactionSound) {
			playSound('money_out')
		}
	}, [sounds.enabled, sounds.transactionSound])

	// Show push prompt with delay after mount
	useEffect(() => {
		if (!shouldShowPostTxPrompt) return
		const timer = setTimeout(() => setShowPushPrompt(true), 1500)
		return () => clearTimeout(timer)
	}, [shouldShowPostTxPrompt])

	// Request in-app review — only if push prompt isn't taking this slot
	useEffect(() => {
		if (shouldShowPostTxPrompt) return
		const timer = setTimeout(() => { maybeRequestReview() }, 2500)
		return () => clearTimeout(timer)
	}, [shouldShowPostTxPrompt])

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

			<PushPromptModal
				visible={showPushPrompt}
				onAccept={() => {
					enablePush()
					dismissPostTxPrompt()
					setShowPushPrompt(false)
				}}
				onDismiss={() => {
					dismissPostTxPrompt()
					setShowPushPrompt(false)
				}}
			/>
		</View>
	)
}

export default SendSuccess