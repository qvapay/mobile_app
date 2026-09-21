/**
 * @jest-environment node
 *
 * Decisión de ofrecer (o no) alquiler de energía TRON. Es lógica que mueve
 * dinero: cada caso de aquí es un dólar que el usuario paga o se ahorra, y el
 * más importante de todos es el de `bandwidth` — ofrecer un alquiler que no
 * desbloquea nada es cobrar por humo.
 */
import {
	burnCostUsd,
	ENERGY_MAX_VOLUME,
	ENERGY_MIN_VOLUME,
	energyShortfall,
	MIN_SAVINGS_USD,
	rentVolumeFor,
	shouldOfferRental,
} from './energy'
import { computeTronBurnBreakdown } from './tx'

const PARAMS = { energyFeeSun: 420n, bandwidthFeeSun: 1000n, createAccountFeeSun: 1_000_000n }
const TRX_USD = 0.31

/** Cuenta sin nada: ni energía, ni banda congelada, y la cuota diaria a elección. */
const resources = ({ energy = 0n, freeBandwidth = 600n, stakedBandwidth = 0n } = {}) => ({
	energy, energyLimit: energy,
	freeBandwidth, freeBandwidthLimit: 600n,
	stakedBandwidth, stakedBandwidthLimit: stakedBandwidth,
})

/** Una transferencia USDT TRC-20 típica: 65.000 de energía y 345 bytes. */
const usdtTransfer = { energyNeeded: 65_000n, bandwidthNeeded: 345n, activatesAccount: false }

const context = (overrides = {}) => ({
	breakdown: computeTronBurnBreakdown(usdtTransfer, resources(), PARAMS),
	nativeBalanceSun: 50n * 1_000_000n,
	sentNativeSun: 0n,
	qvapayBalanceUsd: 25,
	trxPriceUsd: TRX_USD,
	rentPriceUsd: 0.55,
	...overrides,
})

describe('energyShortfall', () => {

	it('es 0 cuando la cuenta tiene energía de sobra', () => {
		expect(energyShortfall(65_000n, { energy: 200_000n })).toBe(0n)
	})

	it('es 0 en TRX nativo, que no consume energía', () => {
		expect(energyShortfall(0n, { energy: 0n })).toBe(0n)
	})

	it('descuenta la energía que ya se tiene', () => {
		expect(energyShortfall(65_000n, { energy: 20_000n })).toBe(45_000n)
	})
})

describe('rentVolumeFor', () => {

	it('sin faltante no hay nada que comprar', () => {
		expect(rentVolumeFor(0n)).toBeNull()
	})

	it('un faltante minúsculo paga igual el mínimo del proveedor', () => {
		expect(rentVolumeFor(1n)).toBe(ENERGY_MIN_VOLUME)
		expect(rentVolumeFor(31_999n)).toBe(ENERGY_MIN_VOLUME)
	})

	it('la transferencia USDT normal cae en el preset de 66.000, no en el siguiente', () => {
		// El preset ya trae holgura sobre los ~65.000 reales: sumarle otro 15%
		// lo empujaría a 132.000 y duplicaría el precio de la compra más común
		expect(rentVolumeFor(65_000n)).toBe(66_000)
	})

	it('la primera transferencia a una dirección cae en el preset de 132.000', () => {
		expect(rentVolumeFor(131_000n)).toBe(132_000)
	})

	it('por encima de los presets redondea al millar con margen', () => {
		// 200.000 × 1,15 = 230.000
		expect(rentVolumeFor(200_000n)).toBe(230_000)
	})

	it('respeta los topes VIVOS del proveedor por encima de las constantes', () => {
		// Si el proveedor sube el mínimo, pedir el viejo se estrella en un 400
		// después de que el usuario haya recorrido todo el flujo de confirmación
		expect(rentVolumeFor(1n, { min: 50_000 })).toBe(50_000)
		expect(rentVolumeFor(65_000n, { max: 70_000 })).toBe(66_000)
		// Con un techo por debajo del preset, el preset deja de ser una opción
		expect(rentVolumeFor(65_000n, { max: 65_500 })).toBeNull()
	})

	it('no ofrece lo que no cabe en una orden, y NO clampa hacia abajo', () => {
		expect(rentVolumeFor(BigInt(ENERGY_MAX_VOLUME) + 1n)).toBeNull()
		// Alquilar el máximo y seguir sin alcanzar es pagar por una tx que falla igual
		expect(rentVolumeFor(4_500_000n)).toBeNull()
	})
})

describe('burnCostUsd', () => {

	it('sin precio del TRX no inventa un número', () => {
		expect(burnCostUsd(1_000_000n, null)).toBeNull()
		expect(burnCostUsd(1_000_000n, 0)).toBeNull()
		expect(burnCostUsd(1_000_000n, NaN)).toBeNull()
	})

	it('convierte sun a USD sin perder los decimales pequeños', () => {
		// 345.000 sun = 0,345 TRX
		expect(burnCostUsd(345_000n, 0.31)).toBeCloseTo(0.10695, 8)
	})

	it('quemar nada cuesta nada', () => {
		expect(burnCostUsd(0n, TRX_USD)).toBe(0)
	})
})

describe('shouldOfferRental', () => {

	it('calla cuando la cuenta ya tiene la energía', () => {
		const breakdown = computeTronBurnBreakdown(usdtTransfer, resources({ energy: 100_000n }), PARAMS)
		expect(shouldOfferRental(context({ breakdown }))).toEqual({ reason: 'no', why: 'no_shortfall' })
	})

	it('NO ofrece alquiler cuando lo que falta es TRX para el ancho de banda', () => {
		// Ya envió hoy: le quedan 255 bytes gratis de 600, así que la banda no
		// está cubierta y se quema entera. Sin TRX, alquilar energía no
		// desbloquea nada — este es el caso que justifica todo el módulo.
		const breakdown = computeTronBurnBreakdown(usdtTransfer, resources({ freeBandwidth: 255n }), PARAMS)
		const decision = shouldOfferRental(context({ breakdown, nativeBalanceSun: 0n }))
		expect(decision.reason).toBe('no')
		expect(decision.why).toBe('bandwidth')
		expect(decision.trxShortSun).toBe(345n * 1000n)
	})

	it('sí ofrece si la banda no está cubierta pero hay TRX para pagarla', () => {
		const breakdown = computeTronBurnBreakdown(usdtTransfer, resources({ freeBandwidth: 255n }), PARAMS)
		expect(shouldOfferRental(context({ breakdown, nativeBalanceSun: 1_000_000n })).reason).toBe('unblocks')
	})

	it('desbloquea: sin TRX para el quemado, alquilar es la única salida', () => {
		const decision = shouldOfferRental(context({ nativeBalanceSun: 0n }))
		expect(decision).toMatchObject({ reason: 'unblocks', volume: 66_000, rentUsd: 0.55 })
	})

	it('el desbloqueo manda aunque no se conozca el precio del TRX', () => {
		const decision = shouldOfferRental(context({ nativeBalanceSun: 0n, trxPriceUsd: null }))
		expect(decision).toMatchObject({ reason: 'unblocks', burnUsd: null })
	})

	it('con TRX de sobra, ofrece por ahorro y dice cuánto', () => {
		const decision = shouldOfferRental(context())
		// 65.000 × 420 sun = 27,3 TRX ≈ $8,46 frente a $0,55 de alquiler
		expect(decision.reason).toBe('cheaper')
		expect(decision.savedUsd).toBeCloseTo(65_000 * 420 / 1e6 * TRX_USD - 0.55, 6)
	})

	it('no molesta por un ahorro ridículo', () => {
		const decision = shouldOfferRental(context({ rentPriceUsd: 8.46 - MIN_SAVINGS_USD / 2 }))
		expect(decision).toEqual({ reason: 'no', why: 'not_worth' })
	})

	it('sin precio del TRX no afirma un ahorro que no puede calcular', () => {
		expect(shouldOfferRental(context({ trxPriceUsd: null }))).toEqual({ reason: 'no', why: 'no_price' })
	})

	it('calla si el saldo QvaPay no llega', () => {
		expect(shouldOfferRental(context({ qvapayBalanceUsd: 0.10 }))).toEqual({ reason: 'no', why: 'no_balance' })
	})

	it('calla si el alquiler no está disponible', () => {
		expect(shouldOfferRental(context({ rentPriceUsd: null }))).toEqual({ reason: 'no', why: 'unavailable' })
	})

	it('calla si el faltante no cabe en una orden', () => {
		const huge = { energyNeeded: 9_000_000n, bandwidthNeeded: 345n, activatesAccount: false }
		const breakdown = computeTronBurnBreakdown(huge, resources(), PARAMS)
		expect(shouldOfferRental(context({ breakdown }))).toEqual({ reason: 'no', why: 'too_much' })
	})

	it('cuenta el importe enviado al mirar si queda TRX para la banda', () => {
		// Envía TODO su TRX: no le queda para el ancho de banda descubierto
		const breakdown = computeTronBurnBreakdown(usdtTransfer, resources({ freeBandwidth: 0n }), PARAMS)
		const decision = shouldOfferRental(context({ breakdown, nativeBalanceSun: 345_000n, sentNativeSun: 345_000n }))
		expect(decision).toMatchObject({ reason: 'no', why: 'bandwidth' })
	})
})
