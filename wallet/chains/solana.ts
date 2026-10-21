/**
 * Lecturas Solana vía JSON-RPC estándar (kind `solana`). PURO.
 *   getBalance(owner)                                   → lamports del SOL nativo
 *   getTokenAccountsByOwner(owner, {programId: Token})  → todas las cuentas SPL del owner
 *     en `jsonParsed` de una sola llamada, sumadas por mint (un owner puede tener varias
 *     cuentas del mismo mint además de la asociada: el saldo es la suma).
 *   getTokenAccountsByOwner(owner, {programId: Token-2022}) → ídem para los mints de ese
 *     programa (xStocks): el filtro por programa es obligatorio en el RPC, así que es otra
 *     llamada, y va APARTE (`getSolanaToken2022Balances`) para que su fallo no tumbe el resto.
 * Los saldos son SIEMPRE unidades crudas: el multiplicador de Scaled UI (dividendos de los
 * xStocks) se aplica al pintar, nunca aquí — enviar y cambiar operan en crudo.
 */
import { jsonRpc } from './http'
import type { RegistryRpc } from '../registry/types'
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from '../solana/codec'

type Options = { signal?: AbortSignal }

type TokenAccountsResult = {
	value?: Array<{ account?: { data?: { parsed?: { info?: { mint?: string, tokenAmount?: { amount?: string } } } } } }>
}

export type SolanaBalances = { lamports: bigint, tokens: Record<string, bigint> }

const rpcOptions = (rpc: RegistryRpc, { signal }: Options) => ({ signal, headers: rpc.headers })

export const getSolanaLamports = async (rpc: RegistryRpc, owner: string, options: Options = {}): Promise<bigint> => {
	const result = await jsonRpc<{ value?: number }>(rpc.url, 'getBalance', [owner, { commitment: 'confirmed' }], rpcOptions(rpc, options))
	return BigInt(result?.value ?? 0)
}

/** Suma de saldos SPL por mint a partir de la respuesta `jsonParsed`. PURO. */
export const sumTokenAccounts = (result: TokenAccountsResult): Record<string, bigint> => {
	const totals: Record<string, bigint> = {}
	for (const entry of result?.value ?? []) {
		const info = entry.account?.data?.parsed?.info
		if (!info?.mint) continue
		totals[info.mint] = (totals[info.mint] ?? 0n) + BigInt(info.tokenAmount?.amount ?? '0')
	}
	return totals
}

const tokenAccounts = (rpc: RegistryRpc, owner: string, programId: string, options: Options) =>
	jsonRpc<TokenAccountsResult>(rpc.url, 'getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }], rpcOptions(rpc, options))

export const getSolanaBalances = async (rpc: RegistryRpc, owner: string, options: Options = {}): Promise<SolanaBalances> => {
	const [lamports, accounts] = await Promise.all([
		getSolanaLamports(rpc, owner, options),
		tokenAccounts(rpc, owner, TOKEN_PROGRAM, options),
	])
	return { lamports, tokens: sumTokenAccounts(accounts) }
}

/** Saldos de los mints Token-2022 (xStocks) por mint. Un mint pertenece a un solo programa: no se solapa con el clásico. */
export const getSolanaToken2022Balances = async (rpc: RegistryRpc, owner: string, options: Options = {}): Promise<Record<string, bigint>> =>
	sumTokenAccounts(await tokenAccounts(rpc, owner, TOKEN_2022_PROGRAM, options))
