import { useMemo, type ReactNode } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

import NativeQPBlurView from '../specs/QPBlurViewNativeComponent'
import { useTheme } from '../theme/ThemeContext'
import { hexToRgba } from '../theme/themeUtils'
import { glassMaterial } from './glassTabBarMetrics'

/** Desenfoque real solo en iOS (`QPBlurView`); en Android el material es tinte. */
const BLURRED = Platform.OS === 'ios'

type GlassSurfaceProps = {
	/** Radio de las esquinas (para una cápsula, la mitad del alto). */
	radius: number,
	/** Posición y tamaño. La sombra va aquí: este contenedor NO recorta. */
	style?: StyleProp<ViewStyle>,
	children?: ReactNode,
}

/**
 * Material «glass» emulado para iOS < 26 y Android, donde no existe el liquid
 * glass nativo. Capas, de abajo arriba: desenfoque del sistema (solo iOS) →
 * tinte del tema → brillo superior → borde de brillo → hijos.
 *
 * Dos vistas a propósito: la de fuera lleva la sombra y la de dentro recorta.
 * En una sola, el recorte se llevaría la sombra. La sombra es `boxShadow` y no
 * `elevation`: la de `elevation` se transparenta bajo un fondo translúcido.
 *
 * El borde es parte del material (el brillo del canto, como en el del sistema),
 * no un borde de tarjeta.
 */
const GlassSurface = ({ radius, style, children }: GlassSurfaceProps) => {
	const { theme } = useTheme()

	const layers = useMemo(() => {
		const material = glassMaterial(theme.isDark, BLURRED)
		const base = theme.isDark ? theme.colors.elevation : theme.colors.background
		const tint = hexToRgba(base, material.tintAlpha)
		const round = { borderRadius: radius, borderCurve: 'continuous' as const }
		return {
			shadow: [round, { boxShadow: theme.isDark ? '0 10 30 0 rgba(0,0,0,0.45)' : '0 8 24 0 rgba(14,14,28,0.14)' }],
			// Con desenfoque el tinte va ENCIMA de él (vista aparte); sin él es el fondo
			clip: [styles.clip, round, !BLURRED && { backgroundColor: tint }],
			fill: [StyleSheet.absoluteFill, round],
			tint: [StyleSheet.absoluteFill, { backgroundColor: tint }],
			// El degradado acaba en el MISMO color con alfa 0: hacia `transparent` pasa por negro
			highlight: [material.highlight, material.highlight.replace(/[\d.]+\)$/, '0)')],
			rim: [StyleSheet.absoluteFill, round, { borderWidth: StyleSheet.hairlineWidth, borderColor: material.rim }],
		}
	}, [theme, radius])

	return (
		<View style={[layers.shadow, style]}>
			<View style={layers.clip}>
				{BLURRED && (
					<>
						<NativeQPBlurView style={[layers.fill, styles.hidden]} blurStyle={theme.isDark ? 'dark' : 'light'} />
						<View style={layers.tint} pointerEvents="none" />
					</>
				)}
				<LinearGradient colors={layers.highlight} style={styles.highlight} pointerEvents="none" />
				<View style={layers.rim} pointerEvents="none" />
				{children}
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	clip: {
		flex: 1,
		overflow: 'hidden',
	},
	hidden: {
		overflow: 'hidden',
	},
	highlight: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: '55%',
	},
})

export default GlassSurface
