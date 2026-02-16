import { useState } from 'react'
import { Text, View, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ROUTES } from '../../routes'
import { useSettings } from '../../settings/SettingsContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI Components
import QPButton from '../../ui/particles/QPButton'

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
        description: "Tu plataforma de pagos digitales segura y confiable"
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

// Onboard Screen
const Onboard = ({ navigation }) => {

    // States
    const [currentStep, setCurrentStep] = useState(0)
    const [isComplete, setIsComplete] = useState(false)

    // Theme Context
    const { theme } = useTheme()
    const fontStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Settings Context
    const { updateSetting } = useSettings()
    const handleCompleteOnboarding = async () => {
        await updateSetting('appearance', 'firstTime', false)
        navigation.navigate(ROUTES.WELCOME_SCREEN)
    }

    const handleNextStep = () => {
        if (currentStep < onboard_steps.length - 1) {
            setCurrentStep(currentStep + 1)
        }
    }

    const handlePreviousStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1)
        }
    }

    const currentStepData = onboard_steps[currentStep]

    return (
        <SafeAreaView style={[containerStyles.subContainer, { flex: 1, justifyContent: 'space-between', alignItems: 'center' }]}>

            {/* Step Indicator */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                {onboard_steps.map((_, index) => (
                    <View
                        key={index}
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: index === currentStep ? theme.colors.primary : theme.colors.border,
                            marginHorizontal: 4
                        }}
                    />
                ))}
            </View>

            {/* Main Content */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>

                {/* SVG Image */}
                <View style={{ marginBottom: 40 }}>
                    <Image source={onboardImages[currentStepData.asset]} style={{ width: 300, height: 300 }} resizeMode="contain" />
                </View>

                {/* Title */}
                <Text style={[fontStyles.h1, { textAlign: 'center', marginBottom: 16 }]}>
                    {currentStepData.title}
                </Text>

                {/* Description */}
                <Text style={[fontStyles.subtitle, { textAlign: 'center', lineHeight: 24 }]}>
                    {currentStepData.description}
                </Text>
            </View>

            {/* Navigation Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>

                {/* Previous Button */}
                {currentStep > 0 && (
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
                )}

                {/* Next/Finish Button */}
                <QPButton
                    title={currentStep === onboard_steps.length - 1 ? "Finalizar" : "Siguiente"}
                    onPress={currentStep === onboard_steps.length - 1 ? handleCompleteOnboarding : handleNextStep}
                    style={{ flex: 1 }}
                    textStyle={{ color: theme.colors.primaryText }}
                />
            </View>
        </SafeAreaView>
    )
}

export default Onboard