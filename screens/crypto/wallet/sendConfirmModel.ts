/**
 * Aritmética PURA de la pantalla de confirmar envío: cuánta comisión exige la red y si el
 * saldo del nativo da para pagarla.
 *
 * Está fuera del componente porque es la cuenta que decide si un envío puede siquiera
 * intentarse, y conviene poder leerla (y probarla) sin JSX de por medio.
 */
import { parseUnits } from '../../../wallet/chains/units'
import type { PreparedSend } from './walletSendActions'

/** `parseUnits` lanza con un decimal a medio teclear; aquí eso vale 0. */
export const parseUnitsSafe = (decimal: string, decimals: number): bigint => {
	try { return parseUnits(decimal, decimals) } catch { return 0n }
}

export type SendFeeState = {
	/** Comisión estimada por el nodo. */
	feeEstimated: bigint
	/** Techo autorizado (solo EVM); null cuando la red no lo usa. */
	feeMax: bigint | null
	/** Lo que sale en el propio nativo: 0 si se envía un token. */
	sentNative: bigint
	/** Lo que la red exige TENER (en EVM, el máximo, aunque luego cobre menos). */
	feeRequired: bigint
	/** No hay nativo suficiente para comisión + importe enviado. */
	insufficientNative: boolean
}

export const sendFeeState = ({ prepared, isNativeAsset, nativeAmount, nativeDecimals, amount }: {
	prepared: PreparedSend | null
	/** El activo que se envía ES el nativo de la red (no un token). */
	isNativeAsset: boolean
	/** Saldo del nativo tal y como lo da el catálogo ('' si aún no cargó). */
	nativeAmount: string | null | undefined
	nativeDecimals: number
	/** Importe tecleado, por si la tx aún no está preparada. */
	amount: string
}): SendFeeState => {
	const nativeBalance = nativeAmount ? parseUnitsSafe(nativeAmount, nativeDecimals) : 0n
	const feeEstimated = prepared?.summary.feeEstimated ?? 0n
	const feeMax = prepared?.summary.feeMax ?? null
	const sentNative = isNativeAsset ? (prepared?.summary.amount ?? parseUnitsSafe(amount, nativeDecimals)) : 0n
	// En EVM la tx exige tener el MÁXIMO autorizado, aunque luego cobre menos
	const feeRequired = prepared?.kind === 'evm' ? (feeMax ?? feeEstimated) : feeEstimated

	return {
		feeEstimated,
		feeMax,
		sentNative,
		feeRequired,
		insufficientNative: !!prepared && nativeBalance < feeRequired + sentNative,
	}
}
