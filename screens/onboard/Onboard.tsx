import { useState, useEffect, useLayoutEffect } from 'react'
import { Text, View, Image } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from 'react-native-reanimated'
import type { ImageSourcePropType } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { ROUTES } from '../../routes'
import { useSettings } from '../../settings/SettingsContext'
import type { RootStackParamList } from '../../types/navigation'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'
import PushPromptModal from '../../ui/PushPromptModal'

// Step transitions (direction-aware, shared with Register)
import useStepTransitions from '../../hooks/useStepTransitions'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Components
import QPPressable from '../../ui/particles/QPPressable'
import QPSplitButton from '../../ui/particles/QPSplitButton'
import QPStepDots from '../../ui/particles/QPStepDots'

// Static image mapping for React Native require
const onboardImages = {
	bot: require('../../assets/images/onboard/bot.png'),
	box: require('../../assets/images/onboard/box.png'),
	coins: require('../../assets/images/onboard/coins.png'),
	earn: require('../../assets/images/onboard/earn.png'),
	security: require('../../assets/images/onboard/security.png'),
	trade: require('../../assets/images/onboard/trade.png'),
	vault: require('../../assets/images/onboard/vault.png'),
} satisfies Record<string, ImageSourcePropType>

// Onboard steps: solo el id de asset a nivel de módulo — título y descripción
// se resuelven en render vía claves `welcome.onboard.steps.<asset>.*` (mismo
// patrón que las opciones de Language.jsx), así el carrusel cambia de idioma
// en vivo y ningún t() queda congelado a nivel de módulo.
const onboard_steps: { asset: keyof typeof onboardImages }[] = [
	{ asset: 'trade' },
	{ asset: 'bot' },
	{ asset: 'coins' },
	{ asset: 'earn' },
	{ asset: 'security' },
	{ asset: 'box' },
	{ asset: 'vault' },
]

// Ilustración con flotación sutil en loop
const FloatingImage = ({ source }: { source: ImageSourcePropType }) => {

	const floatY = useSharedValue(0)

	useEffect(() => {
		floatY.value = withRepeat(
			withSequence(
				withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
				withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) })
			),
			-1
		)
	}, [floatY])

	const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }))

	return (
		<Animated.View style={animatedStyle}>
			<Image source={source} style={{ width: 300, height: 300 }} resizeMode="contain" />
		</Animated.View>
	)
}

type Props = NativeStackScreenProps<RootStackParamList, 'Onboard'>

/**
 * First-launch onboarding carousel (7 feature slides), shown while
 * `appearance.firstTime` is true.
 * Uses the same direction-aware step transitions as the Register wizard
 * (`useStepTransitions`). Completing or skipping it clears the firstTime flag,
 * optionally shows the OneSignal push-permission prompt, then navigates to Welcome.
 */
const Onboard = ({ navigation }: Props) => {

	// States
	const [currentStep, setCurrentStep] = useState(0)
	const [showPushModal, setShowPushModal] = useState(false)

	// Idioma activo
	const { t } = useTranslation()

	// Transiciones direccionales de step (compartidas con el wizard de registro)
	const { direction, makeStepEnter, stepExit } = useStepTransitions()

	// Theme Context
	const { theme } = useTheme()
	const fontStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Push prompt
	const { shouldShowOnboardPrompt, enablePush, dismissOnboardPrompt } = usePushPrompt()

	// Settings Context
	const { updateSetting } = useSettings()
	const handleCompleteOnboarding = async () => {
		await updateSetting('appearance', 'firstTime', false)
		if (shouldShowOnboardPrompt) {
			setShowPushModal(true)
		} else {
			navigation.navigate(ROUTES.WELCOME_SCREEN)
		}
	}

	const handlePushAccept = async () => {
		await enablePush()
		await dismissOnboardPrompt()
		setShowPushModal(false)
		navigation.navigate(ROUTES.WELCOME_SCREEN)
	}

	const handlePushDismiss = async () => {
		await dismissOnboardPrompt()
		setShowPushModal(false)
		navigation.navigate(ROUTES.WELCOME_SCREEN)
	}

	const handleNextStep = () => {
		if (currentStep < onboard_steps.length - 1) {
			direction.value = 1
			setCurrentStep(prev => Math.min(prev + 1, onboard_steps.length - 1))
		}
	}

	const handlePreviousStep = () => {
		if (currentStep > 0) {
			direction.value = -1
			setCurrentStep(prev => Math.max(prev - 1, 0))
		}
	}

	const isLastStep = currentStep === onboard_steps.length - 1
	const currentStepData = onboard_steps[currentStep]

	// Dots + Saltar en el header nativo (mismo patrón que Register y
	// EnterpriseRegister). native-stack INVOCA headerTitle-como-función, así
	// que QPStepDots conserva identidad entre setOptions y la píldora anima
	// de paso a paso sin remontarse. El Saltar desaparece en el último paso.
	useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: () => <QPStepDots count={onboard_steps.length} activeIndex={currentStep} />,
			headerRight: () => isLastStep ? null : (
				<Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
					<QPPressable
						variant="opacity"
						onPress={handleCompleteOnboarding}
						hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
						<Text style={{ color: theme.colors.primary, fontSize: 13, fontFamily: theme.typography.fontFamily.medium, opacity: 0.7 }}>
							{t('welcome.onboard.skip')}
						</Text>
					</QPPressable>
				</Animated.View>
			),
		})
		// handleCompleteOnboarding se recrea en cada render — la dependencia real
		// es el paso activo, el tema y el idioma; incluirla forzaría setOptions
		// por render
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [navigation, currentStep, isLastStep, theme, t])

	return (
		<SafeAreaView edges={['bottom', 'left', 'right']} style={[containerStyles.subContainer, { flex: 1, justifyContent: 'space-between', alignItems: 'center' }]}>

			{/* Main Content — cada step se monta absoluto para que entrada y salida
                se solapen sin saltos de layout */}
			<View style={{ flex: 1, width: '100%' }}>
				<Animated.View
					key={currentStep}
					exiting={stepExit}
					style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>

					{/* SVG Image */}
					<Animated.View entering={makeStepEnter(0)} style={{ marginBottom: 40 }}>
						<FloatingImage source={onboardImages[currentStepData.asset]} />
					</Animated.View>

					{/* Title */}
					<Animated.View entering={makeStepEnter(70)}>
						<Text style={[fontStyles.h1, { textAlign: 'center', marginBottom: 16 }]}>
							{t(`welcome.onboard.steps.${currentStepData.asset}.title`)}
						</Text>
					</Animated.View>

					{/* Description */}
					<Animated.View entering={makeStepEnter(140)}>
						<Text style={[fontStyles.subtitle, { textAlign: 'center', lineHeight: 24 }]}>
							{t(`welcome.onboard.steps.${currentStepData.asset}.description`)}
						</Text>
					</Animated.View>
				</Animated.View>
			</View>

			{/* Navigation Buttons — split-button (patrón de reactiive.io/demos/steps) */}
			<QPSplitButton
				title={isLastStep ? t('welcome.onboard.finish') : t('welcome.onboard.next')}
				onPress={isLastStep ? handleCompleteOnboarding : handleNextStep}
				showBack={currentStep > 0}
				onBack={handlePreviousStep}
				check={isLastStep}
			/>
			<PushPromptModal
				visible={showPushModal}
				onAccept={handlePushAccept}
				onDismiss={handlePushDismiss}
			/>
		</SafeAreaView>
	)
}

export default Onboard
