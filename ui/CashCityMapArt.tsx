import Svg, { Path, Circle, Rect } from 'react-native-svg'

import type { CashCityGeo } from './cashGeo'

/** Lienzo de toda geografía de la tarjeta (ver `scripts/build-cash-geo.js`). */
export const MAP_W = 360
export const MAP_H = 200

/** Colores resueltos por modo que CashDeliveryCard construye para el mapa. */
export type CashMapPalette = {
	water: string
	land: string
	coast: string
	road: string
	roadMajor: string
	roadW: number
	roadMajorW: number
	accent: string
}

type CashCityMapArtProps = {
	geo: CashCityGeo
	palette: CashMapPalette
}

/**
 * Mapa vectorial theme-aware de una ciudad cubana para la tarjeta USD CASH, con geografía
 * REAL de OpenStreetMap proyectada al viewBox 360x200 (ver `ui/cashGeo`): costa y tierra si
 * la ciudad la tiene (si no, todo es tierra), la red de calles (mayores y menores), el río
 * si lo hay y sus puntos de referencia. Puro y estático — todo el movimiento vive en los
 * mensajeros de CashDeliveryCard, así que se pinta una vez por tema. El Svg se estira al
 * ancho de la tarjeta con preserveAspectRatio="none"; las capas encima escalan x por
 * (ancho pintado / MAP_W).
 *
 * @param props
 * @param props.geo - Geografía de la ciudad elegida.
 * @param props.palette - Colores del modo, resueltos por CashDeliveryCard.
 */
const CashCityMapArt = ({ geo, palette }: CashCityMapArtProps) => (
	<Svg width="100%" height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none">

		{/* Ciudad costera: mar de fondo y la tierra encima. De interior: todo tierra */}
		<Rect x="0" y="0" width={MAP_W} height={MAP_H} fill={geo.land ? palette.water : palette.land} />
		{geo.land && <Path d={geo.land} fill={palette.land} />}

		{/* Red de calles real */}
		<Path d={geo.roadsMinor} stroke={palette.road} strokeWidth={palette.roadW} strokeLinecap="round" fill="none" />
		<Path d={geo.roadsMajor} stroke={palette.roadMajor} strokeWidth={palette.roadMajorW} strokeLinecap="round" fill="none" />

		{geo.river && <Path d={geo.river} stroke={palette.water} strokeWidth="3.5" strokeLinecap="round" fill="none" />}

		{/* Costa nítida por encima de las calles */}
		{geo.coast && <Path d={geo.coast} stroke={palette.coast} strokeWidth="1.2" fill="none" />}

		{/* Puntos de referencia (El Morro y el Capitolio en La Habana; el centro en el resto) */}
		{geo.landmarks.map(({ point: [x, y], primary }) => (primary ? (
			<Circle key={`${x},${y}`} cx={x} cy={y} r="6" fill={palette.accent} fillOpacity="0.18" />
		) : null))}
		{geo.landmarks.map(({ point: [x, y], primary }) => (
			<Circle key={`dot-${x},${y}`} cx={x} cy={y} r={primary ? '2.5' : '2'} fill={palette.accent} fillOpacity={primary ? 1 : 0.5} />
		))}
	</Svg>
)

export default CashCityMapArt
