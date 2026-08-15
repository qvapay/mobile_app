import { useEffect } from 'react'
import { View } from 'react-native'
import { CartesianChart, Line, Area } from 'victory-native'
import { Circle, DashPathEffect, LinearGradient, vec, useFont } from '@shopify/react-native-skia'
import {
	cancelAnimation,
	useDerivedValue,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Labels compactos del eje de precios: $43.2k / $102.35 / $0.0842
export const formatAxisPrice = (value) => {
	const n = Number(value || 0)
	if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
	if (n >= 1) return '$' + n.toFixed(2)
	return '$' + n.toFixed(4)
}

// Normaliza el historial del backend ({ time, value }) a números
export const toChartPoints = (data) =>
	(data || [])
		.map((point) => ({ time: Number(point.time), value: Number(point.value) }))
		.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))

// Punto "live" en la punta de la línea: anillo pulsante (ciclo 1.5s como la
// web) con el color semántico de tendencia — la línea se queda en el violeta
// de marca, el momentum vive solo en el dot (identidad del chart de qpweb)
export const LiveDot = ({ x, y, color, reducedMotion }) => {
	const pulse = useSharedValue(0)

	useEffect(() => {
		if (reducedMotion) return
		pulse.value = 0
		pulse.value = withRepeat(withTiming(1, { duration: 1500 }), -1, false)
		return () => cancelAnimation(pulse)
	}, [reducedMotion, pulse])

	const ringR = useDerivedValue(() => 4.5 + 11 * pulse.value)
	const ringOpacity = useDerivedValue(() => 0.45 * (1 - pulse.value))

	return (
		<>
			{!reducedMotion && <Circle cx={x} cy={y} r={ringR} color={color} opacity={ringOpacity} />}
			<Circle cx={x} cy={y} r={4.5} color={color} />
		</>
	)
}

/**
 * Gráfico de precios básico (victory-native sobre Skia + Reanimated), espejo
 * móvil del chart `liveline` de la web: línea suavizada SIEMPRE en el violeta
 * de marca con área de gradiente (12% → 0), grid punteado con el rango de
 * precios en el eje Y, y un dot live pulsante en la punta con el color
 * semántico de tendencia. Los cambios de timeframe morphean el path en el UI
 * thread. Sin gestos — la variante interactiva es PriceChartPro (GOLD).
 *
 * @param {object} props
 * @param {Array<{time, value}>} props.data - Historial de precios del backend.
 * @param {string} props.trendColor - Color semántico del dot (successText / danger).
 * @param {number} [props.height=220] - Alto del gráfico.
 */
const PriceChart = ({ data, trendColor, height = 220 }) => {

	// Theme
	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()
	const font = useFont(require('../../assets/fonts/Rubik-Regular.ttf'), 10)

	const points = toChartPoints(data)
	if (points.length < 2) return null

	const brand = theme.colors.primary

	return (
		<View style={{ height, width: '100%' }}>
			<CartesianChart
				data={points}
				xKey="time"
				yKeys={['value']}
				domainPadding={{ top: 18, bottom: 10 }}
				xAxis={{ font, tickCount: 0, lineColor: 'transparent', labelColor: 'transparent' }}
				// Labels de precio FLOTANDO dentro del gráfico a la derecha (inset,
				// como el liveline de la web) — la curva usa el 100% del ancho en
				// vez de ceder una franja lateral al eje
				yAxis={[{
					font,
					tickCount: 4,
					axisSide: 'right',
					labelPosition: 'inset',
					labelOffset: 8,
					labelColor: theme.colors.tertiaryText,
					lineColor: theme.colors.border + '40',
					linePathEffect: <DashPathEffect intervals={[2, 6]} />,
					formatYLabel: formatAxisPrice,
				}]}
			>
				{({ points: chartPoints, chartBounds }) => {
					const last = chartPoints.value[chartPoints.value.length - 1]
					return (
						<>
							<Area
								points={chartPoints.value}
								y0={chartBounds.bottom}
								curveType="monotoneX"
								animate={{ type: 'timing', duration: 350 }}
							>
								<LinearGradient
									start={vec(0, chartBounds.top)}
									end={vec(0, chartBounds.bottom)}
									colors={[brand + '1F', brand + '00']}
								/>
							</Area>
							<Line
								points={chartPoints.value}
								color={brand}
								strokeWidth={2}
								strokeCap="round"
								curveType="monotoneX"
								animate={{ type: 'timing', duration: 350 }}
							/>
							{last?.y != null && (
								<LiveDot x={last.x} y={last.y} color={trendColor || brand} reducedMotion={reducedMotion} />
							)}
						</>
					)
				}}
			</CartesianChart>
		</View>
	)
}

export default PriceChart
