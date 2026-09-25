/**
 * Saldos de la wallet por cadena a través del router de RPCs. PURO: recibe
 * router y registro, así los tests inyectan un router falso.
 *
 * Cada cadena es UNA llamada del router (nativo + tokens contra el mismo
 * nodo): si ese nodo falla a mitad, rota la cadena entera en vez de mezclar
 * lecturas de nodos con alturas de bloque distintas.
 */
import type { WalletAddresses } from '../derive'
import type { RpcRouter } from '../registry/rpcRouter'
import type { RpcRegistry } from '../registry/types'
import { addressForKind, nativeAssetId, tokenAssetId } from '../assets'
import type { RawBalances } from '../assets'
import { getBtcBalance } from './btc'
import { getEvmNativeBalance, getEvmTokenBalance } from './evm'
import { getTronNativeBalance, getTronTokenBalance } from './tron'
import { ftBalanceOf, getStacksBalances, stxBalanceOf } from './stacks'
import { getSolanaBalances } from './solana'

type RouterLike = Pick<RpcRouter, 'call'>

export const fetchChainBalances = async (
	router: RouterLike,
	registry: RpcRegistry,
	chainKey: string,
	addresses: WalletAddresses,
): Promise<RawBalances> => {
	const chain = registry.chains[chainKey]
	if (!chain) throw new Error(`wallet: cadena desconocida ${chainKey}`)
	const owner = addressForKind(addresses, chain.kind)
	const tokens = chain.tokens ?? []

	// `idempotent`: leer saldos no puede duplicar nada, así que cualquier error rota de nodo.
	// Sin esto, un nodo que sirve `eth_getBalance` pero rechaza `eth_call` —hay nueve así en
	// el registry— mataba la cadena entera: el nativo se veía y los tokens desaparecían.
	return router.call(chainKey, async (rpc, signal) => {
		const entries: Array<Promise<[string, bigint]>> = []
		const nativeId = nativeAssetId(chainKey)

		if (chain.kind === 'btc') {
			entries.push(getBtcBalance(rpc, owner, { signal }).then(v => [nativeId, v]))
		} else if (chain.kind === 'stacks') {
			// Una sola llamada trae STX y todos los tokens
			const all = getStacksBalances(rpc, owner, { signal })
			entries.push(all.then(b => [nativeId, stxBalanceOf(b)]))
			tokens.forEach(token => entries.push(all.then(b => [tokenAssetId(chainKey, token.address), ftBalanceOf(b, token.address)])))
		} else if (chain.kind === 'solana') {
			// Una llamada de saldo nativo + una de todas las cuentas SPL
			const all = getSolanaBalances(rpc, owner, { signal })
			entries.push(all.then(b => [nativeId, b.lamports]))
			tokens.forEach(token => entries.push(all.then(b => [tokenAssetId(chainKey, token.address), b.tokens[token.address] ?? 0n])))
		} else if (chain.kind === 'tron') {
			entries.push(getTronNativeBalance(rpc, owner, { signal }).then(v => [nativeId, v]))
			tokens.forEach(token => entries.push(
				getTronTokenBalance(rpc, token.address, owner, { signal }).then(v => [tokenAssetId(chainKey, token.address), v]),
			))
		} else {
			const options = { signal, headers: rpc.headers }
			entries.push(getEvmNativeBalance(rpc.url, owner, options).then(v => [nativeId, v]))
			tokens.forEach(token => entries.push(
				getEvmTokenBalance(rpc.url, token.address, owner, options).then(v => [tokenAssetId(chainKey, token.address), v]),
			))
		}

		const resolved = await Promise.all(entries)
		return Object.fromEntries(resolved.map(([id, value]) => [id, value.toString()]))
	}, { idempotent: true })
}

export type WalletBalancesResult = {
	balances: RawBalances
	/** Cadenas que fallaron en esta pasada (sus saldos vienen de la anterior, si la hubo). */
	failedChains: string[]
	updatedAt: number
}

/**
 * Todas las cadenas en paralelo. Una cadena caída NO tumba las demás: sus
 * saldos se conservan de la pasada anterior (`previous`) y queda en
 * `failedChains` para que la UI avise sin vaciar filas. Solo si fallan TODAS
 * y no hay nada previo se lanza (React Query lo trata como error).
 */
export const fetchAllBalances = async (
	router: RouterLike,
	registry: RpcRegistry,
	addresses: WalletAddresses,
	previous?: WalletBalancesResult | null,
	now: () => number = Date.now,
): Promise<WalletBalancesResult> => {
	const chainKeys = Object.keys(registry.chains)
	const results = await Promise.allSettled(chainKeys.map(key => fetchChainBalances(router, registry, key, addresses)))

	const balances: RawBalances = {}
	const failedChains: string[] = []
	results.forEach((result, index) => {
		const chainKey = chainKeys[index]
		if (result.status === 'fulfilled') {
			Object.assign(balances, result.value)
			return
		}
		failedChains.push(chainKey)
		if (previous) {
			for (const [id, value] of Object.entries(previous.balances)) {
				if (id.startsWith(`${chainKey}:`)) balances[id] = value
			}
		}
	})

	if (failedChains.length === chainKeys.length && !previous) {
		throw new Error('wallet: no se pudo leer ninguna cadena')
	}
	return { balances, failedChains, updatedAt: now() }
}
