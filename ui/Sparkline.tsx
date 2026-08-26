import { memo } from 'react'
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg'

/**
 * Punto de una serie de precios tal y como lo entregan los históricos de
 * `coinsApi.priceHistory` / `stocksApi.priceHistory`.
 */
export type SparklinePoint = { value: number }

type SparklineProps = {
	data?: SparklinePoint[]
	width?: number
	height?: number
	color?: string
}

/**
 * Tiny SVG price sparkline with a gradient fill under the line, used by
 * WatchlistCard and the Invest/StockDetail screens. Values are normalized to
 * the series' own min/max, so it shows shape, not scale. Memoized (many render
 * at once in the watchlist grid) and renders nothing with fewer than 2 points.
 *
 * @param props
 * @param props.data - Ordered series of data points.
 * @param [props.width=80] - SVG width in px.
 * @param [props.height=32] - SVG height in px.
 * @param [props.color='#7BFFB1'] - Stroke and fill color (green = up, red = down by convention).
 */
const Sparkline = memo(({ data, width = 80, height = 32, color = '#7BFFB1' }: SparklineProps) => {

	if (!data || data.length < 2) return null

	const values = data.map(d => d.value)
	const min = Math.min(...values)
	const max = Math.max(...values)
	const range = max - min || 1

	const padding = 2
	const chartWidth = width - padding * 2
	const chartHeight = height - padding * 2

	const points = values.map((v, i) => {
		const x = padding + (i / (values.length - 1)) * chartWidth
		const y = padding + chartHeight - ((v - min) / range) * chartHeight
		return `${x},${y}`
	}).join(' ')

	// Build fill polygon (line + bottom edge)
	const fillPoints = points + ` ${padding + chartWidth},${height} ${padding},${height}`

	return (
		<Svg width={width} height={height}>
			<Defs>
				<LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
					<Stop offset="0" stopColor={color} stopOpacity="0.25" />
					<Stop offset="1" stopColor={color} stopOpacity="0" />
				</LinearGradient>
			</Defs>
			<Polygon points={fillPoints} fill="url(#sparkFill)" />
			<Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
		</Svg>
	)
})

Sparkline.displayName = 'Sparkline'

export default Sparkline
