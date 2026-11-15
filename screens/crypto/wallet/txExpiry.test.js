/**
 * @jest-environment node
 */
import { SolanaExpiredError } from '../../../wallet/solana/tx'
import { ChainHttpError } from '../../../wallet/chains/http'
import { isExpiredBroadcastError, isSpentBroadcastError } from './txExpiry'

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

// Mensajes reales de `broadcastEvmTransaction`, `broadcastBtcTransaction` y `broadcastStacksTransaction`
test('lo que la tx gasta ya está gastado (nonce, inputs): esa firma no entra, se pregunta a la cadena', () => {
	expect(isSpentBroadcastError(new ChainHttpError('https://bsc: eth_sendRawTransaction → nonce too low: next nonce 8, tx nonce 7', { retryable: false }))).toBe(true)
	expect(isSpentBroadcastError(new ChainHttpError('https://eth: eth_sendRawTransaction → OldNonce', { retryable: false }))).toBe(true)
	expect(isSpentBroadcastError(new ChainHttpError('btc: broadcast rechazado (400): sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}', { status: 400, retryable: false }))).toBe(true)
	expect(isSpentBroadcastError(new ChainHttpError('stacks: broadcast rechazado (400): BadNonce', { status: 400, retryable: false }))).toBe(true)
})

test('un conflicto solo en mempool, o cualquier otro rechazo, NO es «ya gastado»', () => {
	// Aún puede ganar cualquiera de las dos: se sigue re-difundiendo la misma
	expect(isSpentBroadcastError(new ChainHttpError('https://bsc: eth_sendRawTransaction → replacement transaction underpriced', { retryable: false }))).toBe(false)
	expect(isSpentBroadcastError(new ChainHttpError('btc: broadcast rechazado (400): sendrawtransaction RPC error: {"code":-26,"message":"txn-mempool-conflict"}', { status: 400, retryable: false }))).toBe(false)
	expect(isSpentBroadcastError(new ChainHttpError('stacks: broadcast rechazado (400): ConflictingNonceInMempool', { status: 400, retryable: false }))).toBe(false)
	expect(isSpentBroadcastError(new ChainHttpError('https://bsc: eth_sendRawTransaction → insufficient funds for gas * price + value', { retryable: false }))).toBe(false)
	expect(isSpentBroadcastError(new Error('Network request failed'))).toBe(false)
	expect(isSpentBroadcastError(null)).toBe(false)
	// Y no pisa a las caducadas, que tienen su propia regla
	expect(isSpentBroadcastError(new ChainHttpError('tron: broadcast rechazado (TRANSACTION_EXPIRATION_ERROR): Transaction expired', { retryable: false }))).toBe(false)
})
