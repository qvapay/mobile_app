import { useState, useEffect } from 'react'
import { Text, View, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	FadeOutLeft,
	ZoomIn,
	LinearTransition,
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from 'react-native-reanimated'

import { ROUTES } from '../../routes'
import { useSettings } from '../../settings/SettingsContext'

// Push prompt
import usePushPrompt from '../../hooks/usePushPrompt'
import PushPromptModal from '../../ui/PushPromptModal'

// Step transitions (direction-aware, shared with Register)
import useStepTransitions from '../../hooks/useStepTransitions'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import QPPressable from '../../ui/particles/QPPressable'

// Static image mapping for React Native require
const onboardImages = {
	bot: require('../../assets/images/onboard/bot.png'),
	box: require('../../assets/images/onboard/box.png'),
	coins: require('../../assets/images/onboard/coins.png'),
	earn: require('../../assets/images/onboard/earn.png'),
	security: require('../../assets/images/onboard/security.png'),
	trade: require('../../assets/images/onboard/trade.png'),
	vault: require('../../assets/images/onboard/vault.png'),
}

// Onboard Images and Descriptions
const onboard_steps = [
	{
		asset: 'trade',
		title: "Bienvenido a QvaPay",
		description: "Tu plataforma de pagos digitales en USD"
	},
	{
		asset: 'bot',
		title: "Finanzas Inteligentes",
		description: "Gestiona tus finanzas con facilidad y sin complicaciones"
	},
	{
		asset: 'coins',
		title: "Múltiples Monedas",
		description: "Maneja diferentes divisas con facilidad y sin comisiones ocultas"
	},
	{
		asset: 'earn',
		title: "Gana Dinero",
		description: "Invierte y haz crecer tu dinero con nuestras opciones de inversión"
	},
	{
		asset: 'security',
		title: "Seguridad Total",
		description: "Tus datos y transacciones están protegidos con la más alta seguridad"
	},
	{
		asset: 'box',
		title: "Envíos Rápidos",
		description: "Transfiere dinero de forma instantánea a cualquier parte del mundo"
	},
	{
		asset: 'vault',
		title: "Billetera Digital",
		description: "Guarda y gestiona todos tus activos digitales en un solo lugar"
	}
]

// Dot del indicador: el activo se estira a píldora con color primario
const StepDot = ({ active, theme }) => {
	const progress = useSharedValue(active ? 1 : 0)
	useEffect(() => {
		progress.value = withSpring(active ? 1 : 0, { mass: 0.6, damping: 16, stiffness: 200 })
	}, [active, progress])
	const animatedStyle = useAnimatedStyle(() => ({
		width: 8 + progress.value * 16,
		backgroundColor: interpolateColor(progress.value, [0, 1], [theme.colors.border, theme.colors.primary]),
	}))
	return <Animated.View style={[{ height: 8, borderRadius: 4, marginHorizontal: 4 }, animatedStyle]} />
}

// Ilustración con flotación sutil en loop
const FloatingImage = ({ source }) => {
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

// Onboard Screen
const Onboard = ({ navigation }) => {

	// States
	const [currentStep, setCurrentStep] = useState(0)
	const [showPushModal, setShowPushModal] = useState(false)

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

	return (
		<SafeAreaView style={[containerStyles.subContainer, { flex: 1, justifyContent: 'space-between', alignItems: 'center' }]}>

			{/* Step Indicator + Skip */}
			<View style={{ width: '100%', minHeight: 32, justifyContent: 'center' }}>
				<View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
					{onboard_steps.map((_, index) => (
						<StepDot key={index} active={index === currentStep} theme={theme} />
					))}
				</View>

				{!isLastStep && (
					<Animated.View
						entering={FadeIn.duration(250)}
						exiting={FadeOut.duration(200)}
						style={{ position: 'absolute', right: 0 }}>
						<QPPressable
							variant="opacity"
							onPress={handleCompleteOnboarding}
							hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
							<Text style={{ color: theme.colors.primary, fontSize: 13, fontFamily: theme.typography.fontFamily.medium, opacity: 0.7 }}>
								Saltar
							</Text>
						</QPPressable>
					</Animated.View>
				)}
			</View>

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
							{currentStepData.title}
						</Text>
					</Animated.View>

					{/* Description */}
					<Animated.View entering={makeStepEnter(140)}>
						<Text style={[fontStyles.subtitle, { textAlign: 'center', lineHeight: 24 }]}>
							{currentStepData.description}
						</Text>
					</Animated.View>
				</Animated.View>
			</View>

			{/* Navigation Buttons */}
			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>

				{/* Previous Button */}
				{currentStep > 0 && (
					<Animated.View
						entering={ZoomIn.duration(220)}
						exiting={FadeOutLeft.duration(180)}>
						<QPButton
							icon="chevron-left"
							onPress={handlePreviousStep}
							style={{
								width: 60,
								borderRadius: 30,
								paddingHorizontal: 0,
								marginRight: 10,
								backgroundColor: theme.colors.secondary
							}}
							textStyle={{ color: theme.colors.primaryText }}
						/>
					</Animated.View>
				)}

				{/* Next/Finish Button */}
				<Animated.View layout={LinearTransition.springify().mass(0.7).damping(18)} style={{ flex: 1 }}>
					<QPButton
						title={isLastStep ? "Finalizar" : "Siguiente"}
						onPress={isLastStep ? handleCompleteOnboarding : handleNextStep}
						textStyle={{ color: theme.colors.primaryText }}
					/>
				</Animated.View>
			</View>
			<PushPromptModal
				visible={showPushModal}
				onAccept={handlePushAccept}
				onDismiss={handlePushDismiss}
			/>
		</SafeAreaView>
	)
}

export default Onboard
