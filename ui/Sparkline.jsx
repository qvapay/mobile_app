import { memo } from 'react'
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg'

const Sparkline = memo(({ data, width = 80, height = 32, color = '#7BFFB1' }) => {

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
