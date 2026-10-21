/**
 * Geografía de una ciudad para la tarjeta USD CASH, en el viewBox 360x200 de la tarjeta.
 * Los módulos de cada cabecera los genera `scripts/build-cash-geo.js` (La Habana:
 * `scripts/build-havana-geo.js` → `ui/havanaGeo.ts`).
 */
export type CashCityGeo = {
	key: string
	/** Nombre propio (el de la cabecera); el subtítulo lo puede localizar por `key`. */
	name: string
	/** Código de provincia del tarifario (`cash_delivery_zones.province_code`). */
	province: string
	/** Tierra armada desde la costa, o null si la ciudad es de interior (todo tierra). */
	land: string | null
	/** Línea de costa visible (trazo), o null. */
	coast: string | null
	river: string | null
	roadsMajor: string
	roadsMinor: string
	/** Puntos de referencia: `primary` = punto de acento con halo. */
	landmarks: Array<{ point: [number, number], primary?: boolean }>
	/** Seis recorridos de mensajero por calles reales (los mensajeros se reparten de dos en dos). */
	routes: number[][][]
}
