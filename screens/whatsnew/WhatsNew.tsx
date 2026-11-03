import { useLayoutEffect, useMemo, useState } from 'react'
import { Text, View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { useSettings } from '../../settings/SettingsContext'
import type { RootStackParamList } from '../../types/navigation'

// Manifiesto y héroes
import { RELEASES } from '../../whatsnew/releases'
import { releaseForVersion } from '../../whatsnew/whatsNewGate'
import WhatsNewHeroView from '../../whatsnew/heroes'
import type { WhatsNewSlide } from '../../whatsnew/releases'

// Step transitions (las del Onboard y el Register)
import useStepTransitions from '../../hooks/useStepTransitions'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { scaleType, useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// UI
import QPPressable from '../../ui/particles/QPPressable'
import QPSplitButton from '../../ui/particles/QPSplitButton'
import QPStepDots from '../../ui/particles/QPStepDots'

type Props = NativeStackScreenProps<RootStackParamList, 'WhatsNew'>

/**
 * Novedades de una versión: pager a pantalla completa con el kit del Onboard
 * (transiciones direccionales, dots en el header, split-button). La presenta
 * la reconciliación de navegación UNA vez por versión (ver `whatsNewGate`) y
 * se puede repetir desde el pie de Ajustes. Cerrarla, por «Saltar», «Entendido»
 * o el CTA, graba la versión como vista.
 */
const WhatsNew = ({ navigation, route }: Props) => {

	const { version } = route.params
	const slides: WhatsNewSlide[] = useMemo(() => releaseForVersion(version, RELEASES)?.slides ?? [], [version])

	const [step, setStep] = useState(0)
	const { t } = useTranslation()
	const { direction, makeStepEnter, stepExit } = useStepTransitions()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { updateSetting } = useSettings()

	const isLast = step >= slides.length - 1
	const slide = slides[step]

	const dismiss = async (cta?: WhatsNewSlide['cta']) => {
		await updateSetting('appearance', 'lastSeenWhatsNew', version)
		navigation.goBack()
		// La ruta llega como string del manifiesto: no casa con RootStackParamList en compilación
		if (cta) (navigation as unknown as { navigate: (route: string, params?: Record<string, unknown>) => void }).navigate(cta.target.route, cta.target.params)
	}

	const next = () => {
		if (isLast) { dismiss(slide?.cta); return }
		direction.value = 1
		setStep(s => Math.min(s + 1, slides.length - 1))
	}
	const back = () => {
		if (step === 0) return
		direction.value = -1
		setStep(s => Math.max(s - 1, 0))
	}

	// Dots + Saltar en el header nativo (mismo patrón que Onboard)
	useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: () => <QPStepDots count={slides.length} activeIndex={step} />,
			headerRight: () => isLast ? null : (
				<Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
					<QPPressable variant="opacity" testID="whatsnew-skip" onPress={() => dismiss()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
						<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium, opacity: 0.7 }}>
							{t('whatsnew.common.skip')}
						</Text>
					</QPPressable>
				</Animated.View>
			),
		})
		// dismiss se recrea por render; lo que cambia de verdad es el paso, el tema y el idioma
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [navigation, step, isLast, slides.length, theme, t])

	if (!slide) return null

	return (
		<SafeAreaView edges={['bottom', 'left', 'right']} style={[containerStyles.subContainer, styles.root]}>
			<View style={styles.stage}>
				<Animated.View key={`${version}-${step}`} exiting={stepExit} style={styles.slide}>
					<Animated.View entering={makeStepEnter(0)} style={styles.hero}>
						<WhatsNewHeroView hero={slide.hero} />
					</Animated.View>
					<Animated.View entering={makeStepEnter(70)}>
						<Text style={[textStyles.h1, styles.title]}>{t(slide.titleKey)}</Text>
					</Animated.View>
					<Animated.View entering={makeStepEnter(140)}>
						<Text style={[textStyles.subtitle, styles.body, { lineHeight: scaleType(theme, 24) }]}>{t(slide.bodyKey)}</Text>
					</Animated.View>
				</Animated.View>
			</View>

			<QPSplitButton
				title={isLast ? (slide.cta ? t(slide.cta.labelKey) : t('whatsnew.common.gotIt')) : t('whatsnew.common.next')}
				onPress={next}
				showBack={step > 0}
				onBack={back}
				check={isLast && !slide.cta}
			/>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	root: { flex: 1, justifyContent: 'space-between', alignItems: 'center' },
	stage: { flex: 1, width: '100%' },
	slide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
	hero: { marginBottom: 36 },
	title: { textAlign: 'center', marginBottom: 14 },
	body: { textAlign: 'center' },
})

export default WhatsNew
