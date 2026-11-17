/**
 * Saldos de la wallet por cadena a través del router de RPCs. PURO: recibe
 * router y registro, así los tests inyectan un router falso.
 *
 * Cada cadena es UNA llamada del router (nativo + tokens contra el mismo
 * nodo): si ese nodo falla a mitad, rota la cadena entera en vez de mezclar
 * lecturas de nodos con alturas de bloque distintas. Única excepción: los
 * Token-2022 de Solana (xStocks) van en una llamada propia, para que un nodo
 * que no la sirva no tumbe SOL/USDC/USDT, que nunca dependieron de ella.
 *
 * La pasada tiene que ser RÁPIDA: es lo que deja ver un envío recién hecho. Lo que tarda
 * segundos en leerse no va en ella sino en `fetchSlowBalances` (ver ahí).
 */
import type { WalletAddresses } from '../derive'
import type { RpcRouter } from '../registry/rpcRouter'
import type { RpcRegistry } from '../registry/types'
import { addressForKind, nativeAssetId, stakedAssetId, tokenAssetId } from '../assets'
import type { RawBalances } from '../assets'
import { getBtcBalance } from './btc'
import { getEvmNativeBalance, getEvmTokenBalance } from './evm'
import { getTronAccountState, getTronNativeBalance, getTronTokenBalance, tronCommittedSun } from './tron'
import { ftBalanceOf, getStacksBalances, stxBalanceOf, stxLockedOf } from './stacks'
import { getSolanaBalances, getSolanaLamports, getSolanaToken2022Balances, getSolanaTokenBalances } from './solana'
import { MAX_STAKE_SEEDS, readSolanaAllStakeAccounts, readSolanaSeedStakeAccounts, stakeAccountFor } from '../solana/stake'

type RouterLike = Pick<RpcRouter, 'call'>

/**
 * Las dos partes de un saldo comprometido que se leen por separado (hoy, el SOL en stake
 * accounts). No son activos: son claves auxiliares del mapa de saldos, y `mergeBalances` las
 * suma en la de siempre (`stakedAssetId`), que es la única que lee la UI.
 *   · `own`: lo de las stake accounts que crea QvaPay. Va en la pasada (una llamada rápida).
 *   · `foreign`: lo de las creadas con otra wallet. Solo lo ve `fetchSlowBalances`.
 */
export const stakedOwnId = (assetId: string): string => `${stakedAssetId(assetId)}:own`
export const stakedForeignId = (assetId: string): string => `${stakedAssetId(assetId)}:foreign`

const STAKED_OWN_SUFFIX = stakedOwnId('')

/** Un valor del mapa como bigint; lo que no se sepa leer cuenta como 0 en vez de romper la suma. */
const rawAmount = (value: string | undefined): bigint => {
	try { return BigInt(value ?? '0') } catch { return 0n }
}

const sumLamports = (accounts: Array<{ lamports: bigint }>): bigint => accounts.reduce((sum, account) => sum + account.lamports, 0n)

/**
 * `patch` sobre `base`, con el total de cada saldo comprometido que viene por partes
 * recalculado. Todo lo que escribe saldos pasa por aquí: la pasada, la lectura de una sola
 * red y la lectura lenta escriben partes distintas, y el total tiene que cuadrar con las
 * últimas de todas. Sin la parte `foreign` (aún no leída, o su lectura falló) esa parte vale
 * 0: se enseña lo que se sabe en vez de nada.
 */
export const mergeBalances = (base: RawBalances, patch: RawBalances): RawBalances => {
	const merged: RawBalances = { ...base, ...patch }
	for (const key of Object.keys(merged)) {
		if (!key.endsWith(STAKED_OWN_SUFFIX)) continue
		const assetId = key.slice(0, -STAKED_OWN_SUFFIX.length)
		merged[stakedAssetId(assetId)] = (rawAmount(merged[key]) + rawAmount(merged[stakedForeignId(assetId)])).toString()
	}
	return merged
}

export const fetchChainBalances = async (
	router: RouterLike,
	registry: RpcRegistry,
	chainKey: string,
	addresses: WalletAddresses,
): Promise<RawBalances> => {
	const chain = registry.chains[chainKey]
	if (!chain) throw new Error(`wallet: cadena desconocida ${chainKey}`)
	const owner = addressForKind(addresses, chain.kind)
	const allTokens = chain.tokens ?? []
	// Solana: los Token-2022 (xStocks) se leen aparte (ver la cabecera)
	const extendedTokens = chain.kind === 'solana' ? allTokens.filter(token => token.program === 'token2022') : []
	const tokens = extendedTokens.length ? allTokens.filter(token => token.program !== 'token2022') : allTokens

	// `idempotent`: leer saldos no puede duplicar nada, así que cualquier error rota de nodo.
	// Sin esto, un nodo que sirve `eth_getBalance` pero rechaza `eth_call` —hay nueve así en
	// el registry— mataba la cadena entera: el nativo se veía y los tokens desaparecían.
	const main = router.call(chainKey, async (rpc, signal) => {
		const entries: Array<Promise<[string, bigint]>> = []
		const nativeId = nativeAssetId(chainKey)

		if (chain.kind === 'btc') {
			entries.push(getBtcBalance(rpc, owner, { signal }).then(v => [nativeId, v]))
		} else if (chain.kind === 'stacks') {
			// Una sola llamada trae STX y todos los tokens
			const all = getStacksBalances(rpc, owner, { signal })
			entries.push(all.then(b => [nativeId, stxBalanceOf(b)]))
			// Lo bloqueado por PoX no es gastable pero sigue siendo del usuario: va aparte
			entries.push(all.then(b => [stakedAssetId(nativeId), stxLockedOf(b)]))
			tokens.forEach(token => entries.push(all.then(b => [tokenAssetId(chainKey, token.address), ftBalanceOf(b, token.address)])))
		} else if (chain.kind === 'solana') {
			// Una llamada de saldo nativo + una de todas las cuentas SPL clásicas
			const all = getSolanaBalances(rpc, owner, { signal })
			entries.push(all.then(b => [nativeId, b.lamports]))
			// SOL en stake accounts: no es gastable pero es del usuario (va aparte, como el STX
			// bloqueado). Aquí solo las que crea QvaPay: una llamada rápida al MISMO nodo y en el
			// mismo momento que el gastable, así hacer staking no hace bailar el total. Buscar
			// las creadas con otra wallet tarda segundos y va en `fetchSlowBalances`
			entries.push(readSolanaSeedStakeAccounts(rpc, owner, { signal }).then(accounts => [stakedOwnId(nativeId), sumLamports(accounts)]))
			tokens.forEach(token => entries.push(all.then(b => [tokenAssetId(chainKey, token.address), b.tokens[token.address] ?? 0n])))
		} else if (chain.kind === 'tron') {
			if (rpc.api === 'jsonrpc') {
				// La capa eth_* no ve Stake 2.0: solo el gastable (el comprometido se conserva de la pasada anterior)
				entries.push(getTronNativeBalance(rpc, owner, { signal }).then(v => [nativeId, v]))
			} else {
				// Una lectura de la cuenta da el gastable y lo congelado/descongelándose (va aparte)
				const state = getTronAccountState(rpc, owner, { signal })
				entries.push(state.then(s => [nativeId, s.balance]))
				entries.push(state.then(s => [stakedAssetId(nativeId), tronCommittedSun(s)]))
			}
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

	if (!extendedTokens.length) return main

	// Rota de nodo por su cuenta. Si fallan todos, sus claves no vienen y `fetchAllBalances`
	// conserva las de la pasada anterior en vez de pintar las acciones a cero
	const extended = router.call(chainKey, (rpc, signal) => getSolanaToken2022Balances(rpc, owner, { signal }), { idempotent: true }).catch(() => null)
	const [balances, extendedBalances] = await Promise.all([main, extended])
	if (extendedBalances) {
		extendedTokens.forEach(token => { balances[tokenAssetId(chainKey, token.address)] = (extendedBalances[token.address] ?? 0n).toString() })
	}
	return balances
}

/**
 * El saldo de UN activo con las menos llamadas posibles: lo que se relee cada pocos segundos
 * mientras el usuario mira ese activo o espera un cobro en Recibir. La pasada entera son unas
 * veinte llamadas entre las ocho redes; esto, una, y solo a la red de ese activo. Devuelve lo
 * que esa llamada trae (en Stacks, Bitcoin y el TRX nativo la misma respuesta lleva más).
 *
 * `contract`: el del activo, o null si es el nativo de la red.
 */
export const fetchAssetBalance = async (
	router: RouterLike,
	registry: RpcRegistry,
	chainKey: string,
	contract: string | null,
	addresses: WalletAddresses,
): Promise<RawBalances> => {
	const chain = registry.chains[chainKey]
	if (!chain) throw new Error(`wallet: cadena desconocida ${chainKey}`)
	// Una sola llamada ya lo trae todo
	if (chain.kind === 'stacks' || chain.kind === 'btc') return fetchChainBalances(router, registry, chainKey, addresses)

	const token = contract === null ? null : (chain.tokens ?? []).find(candidate => candidate.address === contract)
	if (token === undefined) throw new Error(`wallet: activo desconocido ${chainKey}:${contract}`)
	const owner = addressForKind(addresses, chain.kind)
	const nativeId = nativeAssetId(chainKey)

	return router.call(chainKey, async (rpc, signal): Promise<RawBalances> => {
		if (chain.kind === 'solana') {
			if (!token) return { [nativeId]: (await getSolanaLamports(rpc, owner, { signal })).toString() }
			// Las cuentas del programa de ese token; sin cuenta todavía, el saldo es 0
			const held = token.program === 'token2022'
				? await getSolanaToken2022Balances(rpc, owner, { signal })
				: await getSolanaTokenBalances(rpc, owner, { signal })
			return { [tokenAssetId(chainKey, token.address)]: (held[token.address] ?? 0n).toString() }
		}
		if (chain.kind === 'tron') {
			if (token) return { [tokenAssetId(chainKey, token.address)]: (await getTronTokenBalance(rpc, token.address, owner, { signal })).toString() }
			if (rpc.api === 'jsonrpc') return { [nativeId]: (await getTronNativeBalance(rpc, owner, { signal })).toString() }
			const state = await getTronAccountState(rpc, owner, { signal })
			return { [nativeId]: state.balance.toString(), [stakedAssetId(nativeId)]: tronCommittedSun(state).toString() }
		}
		const options = { signal, headers: rpc.headers }
		if (token) return { [tokenAssetId(chainKey, token.address)]: (await getEvmTokenBalance(rpc.url, token.address, owner, options)).toString() }
		return { [nativeId]: (await getEvmNativeBalance(rpc.url, owner, options)).toString() }
	}, { idempotent: true })
}

/**
 * Lo que NO va en la pasada porque tarda segundos: el SOL en stake accounts creadas con otra
 * wallet. Encontrarlas es un `getProgramAccounts` que en nuestro nodo tardaba 6,5 s (medido
 * el 2026-11-16) y, como la pasada espera a todas las redes, retrasaba 6,5 s CUALQUIER saldo,
 * también al tirar para refrescar. Se pide aparte y de tarde en tarde; el resultado es la
 * parte `foreign`, que `mergeBalances` suma al total.
 *
 * Sin respaldo a las cuentas de semilla: una lista incompleta daría `foreign: 0` y borraría
 * lo que ya se sabía. Si ningún nodo deja usar `getProgramAccounts`, lanza, y quien llama
 * conserva lo último conocido.
 */
export const fetchSlowBalances = async (router: RouterLike, registry: RpcRegistry, addresses: WalletAddresses): Promise<RawBalances> => {
	const solanaKeys = Object.keys(registry.chains).filter(chainKey => registry.chains[chainKey].kind === 'solana')
	const parts = await Promise.all(solanaKeys.map(async (chainKey): Promise<[string, string]> => {
		const owner = addressForKind(addresses, registry.chains[chainKey].kind)
		const seeded = new Set(Array.from({ length: MAX_STAKE_SEEDS }, (_, index) => stakeAccountFor(owner, index)))
		const accounts = await router.call(chainKey, (rpc, signal) => readSolanaAllStakeAccounts(rpc, owner, { signal }), { idempotent: true })
		return [stakedForeignId(nativeAssetId(chainKey)), sumLamports(accounts.filter(account => !seeded.has(account.address))).toString()]
	}))
	return Object.fromEntries(parts)
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
 *
 * `onChain` recibe cada red en cuanto contesta, sin esperar a las demás: quien pinta puede
 * enseñar ya ese saldo en vez de esperar a la red más lenta. Lo que lance no afecta a la pasada.
 */
export const fetchAllBalances = async (
	router: RouterLike,
	registry: RpcRegistry,
	addresses: WalletAddresses,
	previous?: WalletBalancesResult | null,
	now: () => number = Date.now,
	onChain?: (chainKey: string, balances: RawBalances) => void,
): Promise<WalletBalancesResult> => {
	const chainKeys = Object.keys(registry.chains)
	const results = await Promise.allSettled(chainKeys.map(async key => {
		const chainBalances = await fetchChainBalances(router, registry, key, addresses)
		try { onChain?.(key, chainBalances) } catch { /* pintar es cosa de quien llama */ }
		return chainBalances
	}))

	const fresh: RawBalances = {}
	const failedChains: string[] = []
	results.forEach((result, index) => {
		if (result.status === 'fulfilled') Object.assign(fresh, result.value)
		else failedChains.push(chainKeys[index])
	})

	// Lo que esta pasada no trajo conserva el último valor conocido en vez de pintarse a cero:
	//   · una cadena caída entera (queda en `failedChains` para que la UI avise);
	//   · el `#staked` de un nodo que no ve el staking (TRON jsonrpc), hasta que el router
	//     vuelva a otro nodo;
	//   · los Token-2022 de Solana (xStocks) cuando su lectura aparte falla en todos los nodos;
	//   · la parte lenta de un saldo comprometido (`fetchSlowBalances`), que nunca viene aquí.
	const balances = mergeBalances(previous?.balances ?? {}, fresh)

	if (failedChains.length === chainKeys.length && !previous) {
		throw new Error('wallet: no se pudo leer ninguna cadena')
	}
	return { balances, failedChains, updatedAt: now() }
}
