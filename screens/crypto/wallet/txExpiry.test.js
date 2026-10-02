/**
 * @jest-environment node
 */
import { SolanaExpiredError } from '../../../wallet/solana/tx'
import { ChainHttpError } from '../../../wallet/chains/http'
import { isExpiredBroadcastError } from './txExpiry'

test('caducada según la red: blockhash de Solana y expiración de TRON → reconstruir', () => {
	expect(isExpiredBroadcastError(new SolanaExpiredError())).toBe(true)
	// Mensaje real de broadcastTronTransaction ante java-tron
	expect(isExpiredBroadcastError(new ChainHttpError('tron: broadcast rechazado (TRANSACTION_EXPIRATION_ERROR): Transaction expired', { retryable: false }))).toBe(true)
})

test('cualquier otro fallo NO reconstruye (saldo, firma, red caída…)', () => {
	expect(isExpiredBroadcastError(new ChainHttpError('tron: broadcast rechazado (CONTRACT_VALIDATE_ERROR): balance is not sufficient', { retryable: false }))).toBe(false)
	expect(isExpiredBroadcastError(new Error('Network request failed'))).toBe(false)
	expect(isExpiredBroadcastError(null)).toBe(false)
})
