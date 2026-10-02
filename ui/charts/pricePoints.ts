/** Punto crudo del historial de precios del backend (time/value pueden llegar como string). */
export type RawPricePoint = { time: number | string, value: number | string }

/** Punto normalizado que consume el chart. */
export type ChartPricePoint = { time: number, value: number }

// Labels compactos del eje de precios: $43.2k / $102.35 / $0.0842
export const formatAxisPrice = (value: unknown) => {
	const n = Number(value || 0)
	if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
	if (n >= 1) return '$' + n.toFixed(2)
	return '$' + n.toFixed(4)
}

// Normaliza el historial del backend ({ time, value }) a números
export const toChartPoints = (data?: RawPricePoint[] | null): ChartPricePoint[] => {
	// Una sola pasada sobre el histórico (puede traer cientos/miles de puntos y
	// se re-normaliza en cada cambio de timeframe): se convierte y se descarta
	// el punto no finito en el mismo paso, sin array intermedio
	const points: ChartPricePoint[] = []
	for (const raw of data || []) {
		const time = Number(raw.time)
		const value = Number(raw.value)
		if (Number.isFinite(time) && Number.isFinite(value)) { points.push({ time, value }) }
	}
	return points
}
