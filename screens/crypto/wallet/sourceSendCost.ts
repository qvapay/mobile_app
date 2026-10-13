/**
 * Lo que cuesta el ENVÍO desde la wallet en un intercambio custodial. PURO.
 *
 * La comisión de depósito de la cotización es la del PROVEEDOR; aparte, la wallet tiene que
 * mandar los fondos a la dirección de depósito, y ese envío lo paga el usuario en su red.
 * En TRON no es despreciable: un USDT-TRC20 a una dirección que nunca tuvo USDT (las de
 * depósito suelen ser nuevas) quema ~131.000 de energía, 13+ TRX sin energía propia. Sin
 * esta línea el detalle del swap solo contaba la mitad del coste.
 *
 * Solo TRON por ahora: en el resto de redes el envío cuesta céntimos y la fila sería ruido.
 */
import { computeTronBurnBreakdown, SUN_PER_TRX } from '../../../wallet/tron/tx'
import type { TronChainParams, TronResources } from '../../../wallet/tron/tx'

/**
 * Energía de un `transfer` TRC-20 a un destino SIN saldo previo del token (crea el hueco de
 * su saldo). Se asume el peor caso a propósito: no se sabe si la dirección de depósito es
 * nueva hasta abrir la orden, y quedarse corto aquí es prometer un envío más barato.
 */
export const TRC20_TRANSFER_ENERGY = 131_000n

/** Bytes de una tx TRON firmada: ~345 una TRC-20, ~265 un TRX nativo. */
const TRC20_BANDWIDTH = 345n
const NATIVE_BANDWIDTH = 265n

export type SourceSendCost =
	/** Lo cubren la energía y el ancho de banda de la cuenta: no se quema nada. */
	| { kind: 'covered' }
	/** Se quemará ~`trx` TRX (redondeado hacia arriba a 2 decimales); `energyShort` = rentar energía lo abarata. */
	| { kind: 'burn', trx: number, energyShort: boolean }

/**
 * Coste estimado del envío TRON que alimenta el depósito. null si no hay con qué estimarlo
 * (recursos o parámetros sin cargar): mejor no decir nada que decir un número inventado.
 */
export const tronSendCost = ({ isToken, resources, params }: {
	isToken: boolean
	resources: TronResources | null | undefined
	params: TronChainParams | null | undefined
}): SourceSendCost | null => {
	if (!resources || !params) { return null }
	const breakdown = computeTronBurnBreakdown({
		energyNeeded: isToken ? TRC20_TRANSFER_ENERGY : 0n,
		bandwidthNeeded: isToken ? TRC20_BANDWIDTH : NATIVE_BANDWIDTH,
		activatesAccount: false,
	}, resources, params)
	if (breakdown.total <= 0n) { return { kind: 'covered' } }
	// Dos decimales bastan para un coste estimado, redondeando hacia ARRIBA (sun → centésimas de TRX)
	const trx = Math.ceil(Number(breakdown.total) / Number(SUN_PER_TRX / 100n)) / 100
	return { kind: 'burn', trx, energyShort: breakdown.energyShort > 0n }
}
