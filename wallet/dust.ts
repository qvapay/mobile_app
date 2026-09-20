/**
 * Filtro de "dust": entradas minúsculas que casi siempre son spam o un
 * intento de envenenar el historial (address poisoning: te mandan 0.001
 * USDT desde una dirección que empieza y termina como una tuya habitual para
 * que la copies de la actividad). Módulo PURO.
 */
import type { WalletTx } from '../types/domain'

/** Por debajo de esto, una ENTRADA cuenta como dust (valor USD). */
export const DUST_USD_THRESHOLD = 0.01

/**
 * ¿Es dust? Solo entradas de transferencia con precio conocido: lo que sale
 * es tuyo y siempre se muestra, las comisiones son otra cosa, y sin precio
 * no hay forma honesta de decidir (mejor mostrar de más que esconder dinero).
 *
 * @param tx - Movimiento del historial.
 * @param priceUsd - Precio USD del activo (null = desconocido).
 */
export const isDustTx = (tx: Pick<WalletTx, 'direction' | 'amount' | 'kind'>, priceUsd: number | null): boolean => {
	if (tx.direction !== 'in' || tx.kind === 'fee' || priceUsd === null || !(priceUsd > 0)) return false
	const amount = Number(tx.amount)
	if (!Number.isFinite(amount)) return false
	return amount * priceUsd < DUST_USD_THRESHOLD
}

/** Separa el historial en visible y dust (para el contador "N ocultos"). */
export const splitDust = <T extends Pick<WalletTx, 'direction' | 'amount' | 'kind'>>(items: T[], priceUsd: number | null): { visible: T[], dust: T[] } => {
	const visible: T[] = []
	const dust: T[] = []
	for (const item of items) (isDustTx(item, priceUsd) ? dust : visible).push(item)
	return { visible, dust }
}
