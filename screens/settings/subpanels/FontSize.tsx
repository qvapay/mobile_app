import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View, ScrollView } from 'react-native'
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import type { SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import type { Theme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles, useTextStyles } from '../../../theme/themeUtils'
import { createTheme, fontScaleMap } from '../../../theme/themeTokens'

// Slider
import { STEP_HIT, clampToTrack, nearestStep, stepCenterX } from './fontSizeSlider'

const fontSizeSteps = [
	{ key: 'extraSmall', label: 'XS' },
	{ key: 'small', label: 'S' },
	{ key: 'medium', label: 'M' },
	{ key: 'large', label: 'L' },
	{ key: 'extraLarge', label: 'XL' },
]
const STEP_COUNT = fontSizeSteps.length
const MEDIUM_INDEX = fontSizeSteps.findIndex(s => s.key === 'medium')

// Claves de i18n resueltas en render (constante de módulo)
// `fontSizeKey` del tema es un string libre: el mapa se indexa por string.
const fontSizeLabels: Record<string, string> = {
	extraSmall: 'settings.fontSize.labels.extraSmall',
	small: 'settings.fontSize.labels.small',
	medium: 'settings.fontSize.labels.medium',
	large: 'settings.fontSize.labels.large',
	extraLarge: 'settings.fontSize.labels.extraLarge',
}

// El control no escala con el tamaño elegido: si los «Aa» o las etiquetas crecieran,
// la pista cambiaría de ancho y los puntos se moverían respecto al dedo
const GLYPH_SMALL = 12
const GLYPH_LARGE = 22
const LABEL_SIZE = 12
const TRACK_HEIGHT = 28
const THUMB_SIZE = 22

const SPRING = { damping: 22, stiffness: 260, mass: 0.6 }
const HAPTIC_OPTIONS = { enableVibrateFallback: false, ignoreAndroidSystemSettings: false }

/**
 * Ajustes → Fuente: slider de 5 pasos + vista previa. El slider se arrastra (el
 * pulgar sigue al dedo y se ajusta al paso al soltar) o se toca en cualquier punto.
 * Mientras se arrastra solo se mueven el pulgar y los puntos (hilo de UI) y la vista
 * previa (estado local, con su propio tema); el tamaño se aplica a la app UNA vez, al
 * soltar. Aplicarlo en cada paso re-tematizaba la app entera por paso: el JS se
 * atascaba, los commits se encolaban y el pulgar volvía a pasos ya dejados atrás.
 */
const FontSize = () => {

	const { t } = useTranslation()
	const { theme, setFontSize, fontSizeKey } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Una clave desconocida se pinta como el Mediano, que es lo que aplica el tema
	const selectedIndex = useMemo(() => {
		const index = fontSizeSteps.findIndex(s => s.key === fontSizeKey)
		return index === -1 ? MEDIUM_INDEX : index
	}, [fontSizeKey])

	// Paso bajo el dedo mientras se arrastra (null = el aplicado)
	const [previewIndex, setPreviewIndex] = useState<number | null>(null)
	const [scrollLocked, setScrollLocked] = useState(false)
	const displayIndex = previewIndex ?? selectedIndex
	const displayKey = fontSizeSteps[displayIndex].key

	// La vista previa lleva su propio tema con el tamaño bajo el dedo: es lo único que
	// se re-renderiza al arrastrar
	const previewTheme: Theme = useMemo(() => (previewIndex === null ? theme : {
		...theme,
		typography: createTheme(theme.isDark, (fontScaleMap as Record<string, number>)[displayKey]).typography,
	}), [theme, previewIndex, displayKey])
	const previewText = useTextStyles(previewTheme)

	// Geometría en el hilo de UI: ancho medido, X del pulgar, paso bajo el dedo y paso aplicado
	const [width, setWidth] = useState(0)
	const lastWidth = useRef(0)
	const trackWidth = useSharedValue(0)
	const thumbX = useSharedValue(0)
	const dragging = useSharedValue(false)
	const activeStep = useSharedValue(selectedIndex)
	const committedStep = useSharedValue(selectedIndex)

	const onLayout = (event: LayoutChangeEvent) => {
		trackWidth.value = event.nativeEvent.layout.width
		setWidth(event.nativeEvent.layout.width)
	}

	// El pulgar va al paso aplicado: de golpe al medir la pista (o si cambia de ancho) y
	// animado si el tamaño cambia desde fuera (accesibilidad, importar ajustes). Tras
	// soltar ya está ahí (lo lleva el resorte), así que no se le vuelve a mover
	useEffect(() => {
		if (!width || dragging.value) return
		const target = stepCenterX(selectedIndex, width, STEP_COUNT)
		if (width !== lastWidth.current) thumbX.value = target
		else if (activeStep.value !== selectedIndex) thumbX.value = withTiming(target, { duration: 180 })
		lastWidth.current = width
		activeStep.value = selectedIndex
		committedStep.value = selectedIndex
	}, [selectedIndex, width, thumbX, dragging, activeStep, committedStep])

	const previewStep = (index: number) => {
		ReactNativeHapticFeedback.trigger('selection', HAPTIC_OPTIONS)
		setPreviewIndex(index)
	}

	// Al soltar: un único cambio de tamaño para toda la app (React agrupa los dos estados)
	const commitStep = (index: number) => {
		setScrollLocked(false)
		setPreviewIndex(null)
		if (index !== selectedIndex) setFontSize(fontSizeSteps[index].key)
	}

	const follow = (x: number) => {
		'worklet'
		thumbX.value = clampToTrack(x, trackWidth.value)
		const step = nearestStep(x, trackWidth.value, STEP_COUNT)
		if (step === activeStep.value) return
		activeStep.value = step
		scheduleOnRN(previewStep, step)
	}

	// minDistance 0: el toque ya mueve el pulgar, así que tocar un punto sigue sirviendo.
	// Un gesto cancelado (p. ej. por el swipe atrás) deja el tamaño que había
	const pan = usePanGesture({
		minDistance: 0,
		onBegin: event => {
			'worklet'
			dragging.value = true
			scheduleOnRN(setScrollLocked, true)
			follow(event.x)
		},
		onUpdate: event => {
			'worklet'
			follow(event.x)
		},
		onFinalize: event => {
			'worklet'
			const step = event.canceled ? committedStep.value : activeStep.value
			dragging.value = false
			activeStep.value = step
			thumbX.value = withSpring(stepCenterX(step, trackWidth.value, STEP_COUNT), SPRING)
			scheduleOnRN(commitStep, step)
		},
	})

	const thumbStyle = useAnimatedStyle(() => ({ opacity: thumbX.value === 0 ? 0 : 1, transform: [{ translateX: thumbX.value - THUMB_SIZE / 2 }] }))
	const fillStyle = useAnimatedStyle(() => ({ width: Math.max(thumbX.value - STEP_HIT / 2, 0) }))

	// VoiceOver / TalkBack: deslizar arriba o abajo sube o baja un paso
	const onAccessibilityAction = (event: AccessibilityActionEvent) => {
		const next = selectedIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1)
		if (next >= 0 && next < STEP_COUNT) setFontSize(fontSizeSteps[next].key)
	}

	return (
		<ScrollView style={containerStyles.subContainer} showsVerticalScrollIndicator={false} scrollEnabled={!scrollLocked}>

			<View style={styles.header}>
				<Text style={textStyles.h1}>{t('settings.fontSize.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.fontSize.subtitle')}</Text>
			</View>

			{/* Step slider: encima de la vista previa, que es lo único que crece al arrastrar */}
			<View style={[containerStyles.rowBetween, styles.sectionLabel]}>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{t('settings.fontSize.sizeLabel')}</Text>
				<Text style={[textStyles.caption, { color: theme.colors.primary }]}>{t(fontSizeLabels[displayKey])}</Text>
			</View>
			<View style={[containerStyles.box, styles.sliderBox]}>
				<View style={styles.glyph}>
					<Text style={{ fontSize: GLYPH_SMALL, color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }}>Aa</Text>
				</View>
				<GestureDetector gesture={pan}>
					<View
						style={styles.slider}
						onLayout={onLayout}
						accessible
						accessibilityRole="adjustable"
						accessibilityLabel={t('settings.fontSize.sizeLabel')}
						accessibilityValue={{ text: t(fontSizeLabels[displayKey]) }}
						accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
						onAccessibilityAction={onAccessibilityAction}
					>
						<View style={styles.stepTrack}>
							{/* Background track + filled track up to the thumb */}
							<View style={[styles.trackLine, { backgroundColor: theme.colors.border }]} />
							<Animated.View style={[styles.trackLine, styles.trackLineFilled, { backgroundColor: theme.colors.primary }, fillStyle]} />
							{/* Dots */}
							{fontSizeSteps.map((step, index) => (
								<StepDot key={step.key} index={index} thumbX={thumbX} trackWidth={trackWidth} on={theme.colors.primary} off={theme.colors.border} />
							))}
							<Animated.View style={[styles.thumb, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }, thumbStyle]} />
						</View>
						{/* Labels row below the track */}
						<View style={styles.labelsRow}>
							{fontSizeSteps.map((step, index) => {
								const isSelected = displayIndex === index
								return (
									<Text key={step.key} style={[styles.stepLabel, { color: isSelected ? theme.colors.primary : theme.colors.tertiaryText, fontFamily: isSelected ? theme.typography.fontFamily.semiBold : theme.typography.fontFamily.regular }]}>
										{step.label}
									</Text>
								)
							})}
						</View>
					</View>
				</GestureDetector>
				<View style={styles.glyph}>
					<Text style={{ fontSize: GLYPH_LARGE, color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium }}>Aa</Text>
				</View>
			</View>

			{/* Preview */}
			<Text style={[textStyles.h4, styles.sectionLabel, { color: theme.colors.secondaryText }]}>{t('settings.fontSize.preview')}</Text>
			<View style={[containerStyles.box, styles.previewBox]}>
				<Text style={[previewText.h2, styles.sampleTitle, { color: theme.colors.primaryText }]}>
					{t('settings.fontSize.sampleTitle')}
				</Text>
				<Text style={[previewText.h4, styles.sampleSubtitle, { color: theme.colors.secondaryText }]}>
					{t('settings.fontSize.sampleSubtitle')}
				</Text>
				<Text style={[previewText.body, { color: theme.colors.primaryText, lineHeight: previewTheme.typography.fontSize.md * 1.5 }]}>
					{t('settings.fontSize.sampleParagraph')}
				</Text>
				<Text style={[previewText.caption, styles.sampleCaption, { color: theme.colors.tertiaryText }]}>
					{t('settings.fontSize.sampleCaption')}
				</Text>
			</View>

		</ScrollView>
	)
}

type StepDotProps = {
	index: number
	thumbX: SharedValue<number>
	trackWidth: SharedValue<number>
	on: string
	off: string
}

/** Punto de un paso: se enciende en el hilo de UI en cuanto el pulgar lo alcanza. */
const StepDot = ({ index, thumbX, trackWidth, on, off }: StepDotProps) => {
	const dotStyle = useAnimatedStyle(() => ({
		backgroundColor: thumbX.value + 0.5 >= stepCenterX(index, trackWidth.value, STEP_COUNT) ? on : off,
	}))
	return (
		<View style={styles.stepSlot}>
			<Animated.View style={[styles.stepDot, dotStyle]} />
		</View>
	)
}

const styles = StyleSheet.create({
	header: {
		marginBottom: 24,
	},
	sectionLabel: {
		marginBottom: 5,
		paddingHorizontal: 2,
	},
	sliderBox: {
		alignItems: 'flex-start',
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 18,
		gap: 14,
		marginBottom: 20,
	},
	previewBox: {
		padding: 16,
		marginBottom: 24,
		flexDirection: 'column',
		alignItems: 'flex-start',
	},
	sampleTitle: {
		marginBottom: 6,
	},
	sampleSubtitle: {
		marginBottom: 10,
	},
	sampleCaption: {
		marginTop: 8,
	},
	glyph: {
		height: TRACK_HEIGHT,
		justifyContent: 'center',
	},
	slider: {
		flex: 1,
	},
	stepTrack: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		height: TRACK_HEIGHT,
	},
	trackLine: {
		position: 'absolute',
		left: STEP_HIT / 2,
		right: STEP_HIT / 2,
		height: 3,
		borderRadius: 1.5,
	},
	trackLineFilled: {
		right: undefined,
	},
	stepSlot: {
		alignItems: 'center',
		justifyContent: 'center',
		width: STEP_HIT,
		height: TRACK_HEIGHT,
	},
	stepDot: {
		width: 14,
		height: 14,
		borderRadius: 7,
	},
	thumb: {
		position: 'absolute',
		left: 0,
		top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
		width: THUMB_SIZE,
		height: THUMB_SIZE,
		borderRadius: THUMB_SIZE / 2,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.5,
		shadowRadius: 6,
		elevation: 4,
	},
	labelsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 6,
	},
	stepLabel: {
		width: STEP_HIT,
		textAlign: 'center',
		fontSize: LABEL_SIZE,
	},
})

export default FontSize
