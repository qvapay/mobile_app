import { useEffect } from 'react'
import { Text } from 'react-native'
import {
	Easing,
	cancelAnimation,
	useDerivedValue,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated'
import { Canvas, Text as SkiaText, LinearGradient as SkiaLinearGradient, useFont, vec } from '@shopify/react-native-skia'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Métricas del canvas (Rubik-SemiBold 27 — "QvaPay" ocupa ~118pt de ancho)
const FONT_SIZE = 27
const WIDTH = 150
const HEIGHT = 36
const BASELINE = 27

// Ciclo completo del destello: barre en el primer ~35% y descansa fuera de
// cámara el resto — el wrap 1→0 teletransporta la banda de un lado invisible
// al otro, así el loop no tiene costura.
const SWEEP_CYCLE_MS = 4600
const SWEEP_FRACTION = 0.35
const BAND_HALF = 55

/**
 * Wordmark "QvaPay" con destello: el texto se pinta en un canvas Skia con un
 * gradiente lineal diagonal enmascarado a los glifos, cuyo centro barre las
 * letras periódicamente — un glint metálico del acento de marca que RN puro no
 * puede hacer (el gradiente vive DENTRO de las letras). Mientras la fuente
 * carga (o bajo reduced-motion) se muestra el wordmark plano equivalente.
 */
const BrandWordmark = () => {

	// Theme
	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()

	const font = useFont(require('../../assets/fonts/Rubik-SemiBold.ttf'), FONT_SIZE)
	const progress = useSharedValue(0)

	useEffect(() => {
		if (reducedMotion) {
			return
		}
		progress.value = 0
		progress.value = withRepeat(withTiming(1, { duration: SWEEP_CYCLE_MS, easing: Easing.linear }), -1, false)
		return () => cancelAnimation(progress)
	}, [reducedMotion, progress])

	// Centro de la banda de brillo, compartido por start/end del gradiente
	const sweepX = useDerivedValue(() => {
		const p = Math.min(progress.value / SWEEP_FRACTION, 1)
		return -BAND_HALF - 20 + p * (WIDTH + 2 * (BAND_HALF + 20))
	})
	const gradStart = useDerivedValue(() => vec(sweepX.value - BAND_HALF, 0))
	const gradEnd = useDerivedValue(() => vec(sweepX.value + BAND_HALF, HEIGHT))

	const base = theme.colors.primaryText
	const shine = theme.colors.primary

	if (!font || reducedMotion) {
		return (
			<Text style={{ fontSize: FONT_SIZE, lineHeight: HEIGHT, color: base, fontFamily: theme.typography.fontFamily.semiBold }}>
				QvaPay
			</Text>
		)
	}

	return (
		<Canvas style={{ width: WIDTH, height: HEIGHT }}>
			<SkiaText x={0} y={BASELINE} text="QvaPay" font={font}>
				<SkiaLinearGradient
					start={gradStart}
					end={gradEnd}
					colors={[base, shine, base]}
					positions={[0.2, 0.5, 0.8]}
				/>
			</SkiaText>
		</Canvas>
	)
}

export default BrandWordmark
