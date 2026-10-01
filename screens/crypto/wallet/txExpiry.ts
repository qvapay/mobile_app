/**
 * ¿La red rechazó la difusión porque la tx CADUCÓ? PURO (testeable en node).
 *
 * Nuestro reloj de vigencia (`summary.expiresAt`) es una estimación: un nodo puede dar por
 * caducado el blockhash de Solana antes de esos 60 s. Si se tratara como un error más,
 * "Reintentar" re-difundiría la MISMA tx caducada en bucle; hay que reconstruirla. Es seguro:
 * una tx rechazada por caducidad no se ejecutó.
 */
import { SolanaExpiredError } from '../../../wallet/solana/tx'

/** Código de java-tron para una tx cuya `expiration` ya pasó. */
const TRON_EXPIRED = /TRANSACTION_EXPIRATION_ERROR/

export const isExpiredBroadcastError = (err: unknown): boolean =>
	err instanceof SolanaExpiredError
	|| (err instanceof Error && TRON_EXPIRED.test(err.message))
