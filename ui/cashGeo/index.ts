/**
 * Ciudades que puede pintar la tarjeta USD CASH del Home: las cabeceras de provincia con
 * entrega en el tarifario (todas menos Cienfuegos), con su geografía real de OpenStreetMap.
 * La tarjeta elige una al azar al montarse.
 */
import { CAPITOLIO, COAST_PATH, COURIER_ROUTES, LAND_PATH, MORRO, RIVER_PATH, ROADS_MAJOR_PATH, ROADS_MINOR_PATH } from '../havanaGeo'
import type { CashCityGeo } from './types'

import pinarDelRio from './pinarDelRio'
import artemisa from './artemisa'
import sanJoseDeLasLajas from './sanJoseDeLasLajas'
import matanzas from './matanzas'
import santaClara from './santaClara'
import sanctiSpiritus from './sanctiSpiritus'
import ciegoDeAvila from './ciegoDeAvila'
import camaguey from './camaguey'
import lasTunas from './lasTunas'
import holguin from './holguin'
import bayamo from './bayamo'
import santiagoDeCuba from './santiagoDeCuba'
import guantanamo from './guantanamo'
import nuevaGerona from './nuevaGerona'

export type { CashCityGeo }

/** La Habana: su módulo propio (rutas afinadas a mano), con la misma forma que el resto. */
const havana: CashCityGeo = {
	key: 'havana',
	name: 'La Habana',
	province: 'LHA',
	land: LAND_PATH,
	coast: COAST_PATH,
	river: RIVER_PATH,
	roadsMajor: ROADS_MAJOR_PATH,
	roadsMinor: ROADS_MINOR_PATH,
	landmarks: [
		{ point: MORRO as [number, number], primary: true },
		{ point: CAPITOLIO as [number, number] },
	],
	// Por parejas, el reparto de siempre: Vedado/bahía, Miramar/Vedado, el este/Cerro
	routes: [
		COURIER_ROUTES.vedadoHV, COURIER_ROUTES.hvRegla,
		COURIER_ROUTES.miramarVedado, COURIER_ROUTES.vedadoInterior,
		COURIER_ROUTES.este, COURIER_ROUTES.centroCerro,
	],
}

/** De oeste a este; La Habana primero. */
export const CASH_CITIES: readonly CashCityGeo[] = [
	havana,
	pinarDelRio,
	artemisa,
	sanJoseDeLasLajas,
	matanzas,
	santaClara,
	sanctiSpiritus,
	ciegoDeAvila,
	camaguey,
	lasTunas,
	holguin,
	bayamo,
	santiagoDeCuba,
	guantanamo,
	nuevaGerona,
]

/** Una ciudad al azar (`random` inyectable para los tests). */
export const pickCashCity = (random: () => number = Math.random): CashCityGeo =>
	CASH_CITIES[Math.min(CASH_CITIES.length - 1, Math.floor(random() * CASH_CITIES.length))]
