import { useEffect } from 'react'
import { View } from 'react-native'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native'
import { Circle, DashPathEffect, LinearGradient, Line as SkiaLine, vec, useFont } from '@shopify/react-native-skia'
import { runOnJS, useAnimatedReaction, useDerivedValue, useReducedMotion } from 'react-native-reanimated'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// i18n (locale de fechas del eje de tiempo)
import { getDateLocale } from '../../i18n'

// Base compartida con el gráfico básico
import { LiveDot, formatAxisPrice, toChartPoints } from './PriceChart'

// Tick sutil por punto de datos al arrastrar (estilo Robinhood)
const hapticTick = () => ReactNativeHapticFeedback.trigger('selection', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false })

// Labels del eje de tiempo según el span visible: horas para intradía,
// día+mes para semanas/meses, mes+año para lo largo
const formatTimeLabel = (t, spanSecs) => {
	const ms = t > 1e12 ? t : t * 1000
	const date = new Date(ms)
	const locale = getDateLocale()
	if (spanSecs <= 2 * 86400) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
	if (spanSecs <= 120 * 86400) return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
	return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

// Crosshair del scrubbing: línea vertical punteada + dot con halo sobre la
// curva. Componente aparte porque el render-prop del chart no admite hooks.
const ScrubCursor = ({ state, top, bottom, lineColor, dotColor }) => {
	const p1 = useDerivedValue(() => vec(state.x.position.value, top))
	const p2 = useDerivedValue(() => vec(state.x.position.value, bottom))
	return (
		<>
			<SkiaLine p1={p1} p2={p2} color={lineColor} strokeWidth={1}>
				<DashPathEffect intervals={[3, 4]} />
			</SkiaLine>
			<Circle cx={state.x.position} cy={state.y.value.position} r={11} color={dotColor + '2E'} />
			<Circle cx={state.x.position} cy={state.y.value.position} r={5} color={dotColor} />
		</>
	)
}

/**
 * Gráfico de precios PRO (solo GOLD): el PriceChart básico + scrubbing táctil
 * estilo Robinhood — al arrastrar aparece un crosshair punteado con dot sobre
 * la curva, un tick háptico por punto de datos, y `onScrub` reporta
 * `{ time, value }` del punto activo (null al soltar) para que la pantalla
 * muestre el precio/fecha del punto en su header. Todo el seguimiento corre
 * en el UI thread (chartPressState de victory-native); a JS solo cruzan los
 * cambios de punto discretos.
 *
 * @param {object} props
 * @param {Array<{time, value}>} props.data - Historial de precios del backend.
 * @param {string} props.trendColor - Color semántico (dot live + cursor).
 * @param {function} [props.onScrub] - `({ time, value } | null)` punto activo.
 * @param {number} [props.height=220] - Alto del gráfico.
 */
const PriceChartPro = ({ data, trendColor, onScrub, height = 220 }) => {

	// Theme
	const { theme } = useTheme()
	const reducedMotion = useReducedMotion()
	const font = useFont(require('../../assets/fonts/Rubik-Regular.ttf'), 10)

	const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } })

	// Cambios de punto discretos → JS (readout del header + tick háptico)
	useAnimatedReaction(
		() => ({ t: state.x.value.value, v: state.y.value.value.value }),
		(curr, prev) => {
			if (!isActive || !curr.v) return
			if (prev && curr.t === prev.t) return
			if (onScrub) runOnJS(onScrub)({ time: curr.t, value: curr.v })
			runOnJS(hapticTick)()
		},
		[isActive, onScrub]
	)

	// Al soltar, limpiar el readout
	useEffect(() => {
		if (!isActive && onScrub) onScrub(null)
	}, [isActive, onScrub])

	const points = toChartPoints(data)
	if (points.length < 2) return null

	const brand = theme.colors.primary
	const cursorColor = trendColor || brand

	// Span del dataset para el formato del eje de tiempo (normalizado a secs)
	const firstT = points[0].time > 1e12 ? points[0].time / 1000 : points[0].time
	const lastT = points[points.length - 1].time > 1e12 ? points[points.length - 1].time / 1000 : points[points.length - 1].time
	const spanSecs = Math.max(1, lastT - firstT)

	return (
		<View style={{ height, width: '100%' }}>
			<CartesianChart
				data={points}
				xKey="time"
				yKeys={['value']}
				domainPadding={{ top: 18, bottom: 10 }}
				chartPressState={state}
				// Mantener presionado ~150ms activa el scrubbing — sin esto el pan
				// del chart pierde SIEMPRE contra el scroll del ScrollView padre y
				// el modo PRO jamás se activa
				chartPressConfig={{ pan: { activateAfterLongPress: 150 } }}
				xAxis={{
					font,
					tickCount: 4,
					lineColor: 'transparent',
					labelColor: theme.colors.tertiaryText,
					formatXLabel: (t) => formatTimeLabel(t, spanSecs),
				}}
				// Labels de precio inset a la derecha (como el básico): la curva usa
				// el 100% del ancho
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
							{/* Guía punteada al precio actual (firma del liveline de la web) */}
							{last?.y != null && (
								<SkiaLine
									p1={vec(chartBounds.left, last.y)}
									p2={vec(chartBounds.right, last.y)}
									color={brand + '5C'}
									strokeWidth={1}
								>
									<DashPathEffect intervals={[3, 5]} />
								</SkiaLine>
							)}
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
							{isActive ? (
								<ScrubCursor
									state={state}
									top={chartBounds.top}
									bottom={chartBounds.bottom}
									lineColor={theme.colors.border}
									dotColor={cursorColor}
								/>
							) : (
								last?.y != null && <LiveDot x={last.x} y={last.y} color={cursorColor} reducedMotion={reducedMotion} />
							)}
						</>
					)
				}}
			</CartesianChart>
		</View>
	)
}

export default PriceChartPro
