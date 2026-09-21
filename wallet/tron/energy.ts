/**
 * Alquiler de energía TRON: qué comprar y si merece la pena. Módulo PURO —
 * sin red, sin react-native, testeado en node.
 *
 * El problema que resuelve: una transferencia de USDT-TRC20 consume ~65.000
 * de energía (~131.000 la primera vez que esa dirección recibe USDT, porque
 * hay que crear el hueco donde se guarda su saldo). Quien no tiene energía la
 * quema en TRX, y eso cuesta entre uno y dos órdenes de magnitud más que
 * alquilarla. Aquí se calcula cuánto hay que alquilar y, sobre todo, CUÁNDO
 * NO hay que ofrecerlo.
 *
 * La regla que justifica que esto sea un módulo y no un `if` en la pantalla:
 * **alquilar energía no paga el ancho de banda**. Una cuenta sin banda libre
 * y sin TRX sigue sin poder enviar después de alquilar, así que ofrecerle el
 * alquiler es cobrarle por algo que no le desbloquea nada.
 */
import type { TronBurnBreakdown, TronResources } from './tx'
import { SUN_PER_TRX } from './tx'

/** Mínimo que vende el proveedor. Pedir menos no es una opción: se paga esto. */
export const ENERGY_MIN_VOLUME = 32_000

/** Máximo por orden. Por encima, no se ofrece (clampar hacia abajo dejaría la tx igual de bloqueada). */
export const ENERGY_MAX_VOLUME = 5_000_000

/**
 * Montos de la tabla de precios del backend: una transferencia USDT a destino
 * conocido y a destino nuevo. Comprar uno de estos tiene premio: su precio
 * sale exacto de `GET /v2/energy/prices`, sin pasar por `/quote`.
 */
export const ENERGY_PRESETS = [66_000, 132_000] as const

/**
 * Colchón sobre el faltante, SOLO para volúmenes fuera de la tabla de
 * presets. `triggerconstantcontract` estima bien pero no es exacto (el
 * consumo depende del estado de la cuenta al ejecutar), y quedarse corto no
 * es "pagar un poco": `OUT_OF_ENERGY` consume toda la energía delegada Y
 * falla la transacción igual.
 *
 * Los presets NO lo llevan encima porque ya nacen con holgura (66.000 para un
 * consumo de ~65.000); sumarles otro 15% los empujaría al escalón siguiente y
 * duplicaría el precio de la compra más común de todas.
 */
export const ENERGY_SAFETY_MARGIN = 1.15

/** Por debajo de este ahorro no se molesta al usuario con una compra. */
export const MIN_SAVINGS_USD = 0.25

/**
 * Topes del proveedor. Vienen en el `meta` de la tabla de precios; las
 * constantes de este módulo son solo el fallback. Pedir un volumen fuera de
 * los topes VIVOS se estrella en un 400 después de que el usuario haya
 * recorrido todo el flujo.
 */
export type EnergyBounds = { min?: number, max?: number }

/** Energía que falta para esta transacción (0 si la cuenta la tiene toda). */
export const energyShortfall = (energyNeeded: bigint, resources: Pick<TronResources, 'energy'>): bigint =>
	energyNeeded > resources.energy ? energyNeeded - resources.energy : 0n

/**
 * Cuánta energía comprar para cubrir un faltante.
 *
 * Sube al primer escalón que lo cubra: el mínimo del proveedor, luego los dos
 * presets (que es lo que casi siempre toca, y lo único con precio publicado)
 * y, por encima, el millar superior con el margen de seguridad aplicado.
 *
 * Devuelve `null` cuando no hay nada sensato que comprar: faltante nulo, o
 * uno que ni con el máximo del proveedor se cubriría. En ese segundo caso NO
 * se clampa hacia abajo a propósito — alquilar el máximo y seguir sin
 * alcanzar es cobrarle al usuario por una transacción que va a fallar igual.
 */
export const rentVolumeFor = (shortfall: bigint, { min = ENERGY_MIN_VOLUME, max = ENERGY_MAX_VOLUME }: EnergyBounds = {}): number | null => {
	if (shortfall <= 0n) { return null }
	const needed = Number(shortfall)
	if (needed <= min) { return min }
	const preset = ENERGY_PRESETS.find(value => needed <= value && value <= max)
	if (preset) { return preset }
	const withMargin = Math.ceil(needed * ENERGY_SAFETY_MARGIN)
	if (withMargin > max) { return null }
	return Math.min(Math.ceil(withMargin / 1000) * 1000, max)
}

/** Sun → USD. `null` si no se conoce el precio del TRX (no se inventa un 0). */
export const burnCostUsd = (burnSun: bigint, trxPriceUsd: number | null | undefined): number | null => {
	if (typeof trxPriceUsd !== 'number' || !Number.isFinite(trxPriceUsd) || trxPriceUsd <= 0) { return null }
	return (Number(burnSun) / Number(SUN_PER_TRX)) * trxPriceUsd
}

export type RentalContext = {
	/** Desglose del quemado con los recursos que la cuenta tiene AHORA. */
	breakdown: TronBurnBreakdown
	/** Saldo TRX de la cuenta remitente (sun). */
	nativeBalanceSun: bigint
	/** Lo que sale del propio TRX en esta tx (0 si se envía un token). */
	sentNativeSun: bigint
	/** Saldo QvaPay en USD, que es con lo que se paga el alquiler. */
	qvapayBalanceUsd: number
	/** Precio del TRX en USD, o null si el catálogo aún no cargó. */
	trxPriceUsd: number | null
	/** Precio del alquiler para el volumen que tocaría comprar; null si no hay tabla de precios. */
	rentPriceUsd: number | null
	/** Topes vivos del proveedor; sin ellos se usan las constantes del módulo. */
	bounds?: EnergyBounds
}

export type RentalDecision =
	/** Sin energía la transacción no sale; alquilar es lo que la desbloquea. */
	| { reason: 'unblocks', volume: number, rentUsd: number, burnUsd: number | null }
	/** Sale igualmente, pero alquilar ahorra dinero de verdad. */
	| { reason: 'cheaper', volume: number, rentUsd: number, burnUsd: number, savedUsd: number }
	/** No se ofrece, y el motivo decide el copy. */
	| { reason: 'no', why: RentalRefusal, trxShortSun?: bigint }

export type RentalRefusal =
	/** La cuenta ya tiene la energía que hace falta. */
	| 'no_shortfall'
	/** Alquilar no desbloquearía nada: lo que falta es TRX para el ancho de banda. */
	| 'bandwidth'
	/** El faltante no cabe en una orden del proveedor. */
	| 'too_much'
	/** El alquiler no está disponible ahora mismo (sin tabla de precios). */
	| 'unavailable'
	/** El saldo QvaPay no llega para pagarlo. */
	| 'no_balance'
	/** Sin precio del TRX no se puede afirmar que se ahorra. */
	| 'no_price'
	/** Se ahorra, pero tan poco que no compensa mandar a nadie a comprar. */
	| 'not_worth'

/**
 * ¿Ofrecemos alquilar energía para esta transacción, y por qué?
 *
 * El orden de las comprobaciones importa: primero se descarta lo que hace
 * inútil el alquiler (no falta energía, falta TRX para la banda, el faltante
 * no cabe), luego lo que lo hace imposible (sin precios, sin saldo) y solo al
 * final se compara dinero. Un `unblocks` gana siempre a un `cheaper`: cuando
 * la transacción no sale sin alquilar, el ahorro es lo de menos.
 */
export const shouldOfferRental = ({ breakdown, nativeBalanceSun, sentNativeSun, qvapayBalanceUsd, trxPriceUsd, rentPriceUsd, bounds }: RentalContext): RentalDecision => {

	if (breakdown.energyShort <= 0n) { return { reason: 'no', why: 'no_shortfall' } }

	const volume = rentVolumeFor(breakdown.energyShort, bounds)
	if (volume === null) { return { reason: 'no', why: 'too_much' } }

	// Lo que se seguiría quemando DESPUÉS de alquilar: ancho de banda y alta de
	// cuenta. Si el TRX no da ni para eso, el alquiler no desbloquea el envío.
	const remainingAfterRent = breakdown.bandwidthBurnSun + breakdown.activationSun
	const trxShortSun = remainingAfterRent + sentNativeSun - nativeBalanceSun
	if (trxShortSun > 0n) { return { reason: 'no', why: 'bandwidth', trxShortSun } }

	if (rentPriceUsd === null || !Number.isFinite(rentPriceUsd) || rentPriceUsd <= 0) { return { reason: 'no', why: 'unavailable' } }
	if (!(qvapayBalanceUsd >= rentPriceUsd)) { return { reason: 'no', why: 'no_balance' } }

	const burnUsd = burnCostUsd(breakdown.energyBurnSun, trxPriceUsd)
	// Sin alquilar no hay TRX suficiente: el alquiler ES la razón de que salga
	const blocked = nativeBalanceSun < breakdown.total + sentNativeSun
	if (blocked) { return { reason: 'unblocks', volume, rentUsd: rentPriceUsd, burnUsd } }

	if (burnUsd === null) { return { reason: 'no', why: 'no_price' } }
	const savedUsd = burnUsd - rentPriceUsd
	if (savedUsd < MIN_SAVINGS_USD) { return { reason: 'no', why: 'not_worth' } }
	return { reason: 'cheaper', volume, rentUsd: rentPriceUsd, burnUsd, savedUsd }
}
