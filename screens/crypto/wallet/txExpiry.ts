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

/**
 * ¿La red rechazó la difusión porque lo que esta tx GASTA ya está gastado?
 *
 * - EVM: `nonce too low` (cuando el nodo, además, no conoce su hash: `broadcastEvmTransaction`
 *   ya dio por buena la que sí conoce).
 * - Bitcoin: `bad-txns-inputs-missingorspent` (uno de sus UTXOs ya no existe).
 * - Stacks: `BadNonce`.
 *
 * Esa firma ya no puede entrar por ese nodo, así que re-difundirla es un bucle. Pero NO
 * prueba que no se pagara: lo gastado pudo gastarlo ESTA misma tx en una difusión anterior
 * que se quedó sin respuesta. Quien decide es la cadena (`lookup`), igual que con una
 * caducada. Un conflicto solo en mempool (`replacement underpriced`, `txn-mempool-conflict`,
 * `ConflictingNonceInMempool`) queda fuera: ahí todavía puede ganar cualquiera de las dos.
 */
const SPENT = /nonce (?:is )?too low|\bOldNonce\b|bad-txns-inputs-missingorspent|\bBadNonce\b/i

export const isSpentBroadcastError = (err: unknown): boolean => err instanceof Error && SPENT.test(err.message)
