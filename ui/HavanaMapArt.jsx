import Svg, { Path, Circle, Rect } from 'react-native-svg'

// Real projected geography (OSM) — coastline, river, road network, landmarks
import { MAP_W, MAP_H, COAST_PATH, LAND_PATH, RIVER_PATH, ROADS_MAJOR_PATH, ROADS_MINOR_PATH, MORRO, CAPITOLIO } from './havanaGeo'

// Re-exported so consumers keep a single import point for the art + metrics
export { MAP_W, MAP_H }

/**
 * Theme-aware vector map of Havana for the USD CASH card, built from real
 * OpenStreetMap geography projected into the 360x200 viewBox (see
 * havanaGeo.js): the true coastline with the harbor channel, Casablanca and
 * the Regla peninsula, the Almendares river, and the actual arterial network
 * (trunk/primary as major, secondary/tertiary as minor). Landmarks: El Morro
 * (accent dot at the bay mouth) and the Capitolio. Pure and static — all
 * motion lives in CashDeliveryCard's courier overlays, so this renders once
 * per theme change. The Svg stretches to the card width with
 * preserveAspectRatio="none"; overlays scale x by (rendered width / MAP_W).
 *
 * @param {object} props
 * @param {object} props.palette - Mode-resolved colors from CashDeliveryCard:
 *   `{ water, land, coast, road, roadMajor, roadW, roadMajorW, accent }`.
 */
const HavanaMapArt = ({ palette }) => (
	<Svg width="100%" height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none">

		{/* Straits of Florida + harbor */}
		<Rect x="0" y="0" width={MAP_W} height={MAP_H} fill={palette.water} />

		{/* Land silhouette (real coastline closed through the south) */}
		<Path d={LAND_PATH} fill={palette.land} />

		{/* Real road network */}
		<Path d={ROADS_MINOR_PATH} stroke={palette.road} strokeWidth={palette.roadW} strokeLinecap="round" fill="none" />
		<Path d={ROADS_MAJOR_PATH} stroke={palette.roadMajor} strokeWidth={palette.roadMajorW} strokeLinecap="round" fill="none" />

		{/* Río Almendares carves through Vedado/Miramar */}
		<Path d={RIVER_PATH} stroke={palette.water} strokeWidth="3.5" strokeLinecap="round" fill="none" />

		{/* Crisp shoreline on top of the roads */}
		<Path d={COAST_PATH} stroke={palette.coast} strokeWidth="1.2" fill="none" />

		{/* Landmarks: El Morro at the bay mouth, Capitolio in Habana Vieja */}
		<Circle cx={MORRO[0]} cy={MORRO[1]} r="6" fill={palette.accent} fillOpacity="0.18" />
		<Circle cx={MORRO[0]} cy={MORRO[1]} r="2.5" fill={palette.accent} />
		<Circle cx={CAPITOLIO[0]} cy={CAPITOLIO[1]} r="2" fill={palette.accent} fillOpacity="0.5" />
	</Svg>
)

export default HavanaMapArt
