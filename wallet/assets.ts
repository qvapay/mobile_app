/**
 * Catálogo de activos de la wallet (un activo = una moneda EN una red: USDT
 * en TRON y USDT en BSC son filas distintas, como en Trust/SafePal) y la
 * lógica de qué se ve, en qué orden y cuánto vale. Módulo PURO.
 *
 * Todo sale del registry: añadir un token allí lo hace aparecer en
 * "Gestionar activos" sin publicar versión. Lo único estático son los ticks
 * de QvaPay para precio y logo, que no viven en el registry.
 */
import type { WalletAddresses } from './derive'
import type { ChainKind, RegistryChain, RpcRegistry } from './registry/types'
import { displayAmount, formatUnits } from './chains/units'

export type WalletAsset = {
	/** `${chainKey}:native` o `${chainKey}:${contract}` (contract tal cual en el registry). */
	id: string
	chainKey: string
	chainName: string
	kind: ChainKind
	symbol: string
	decimals: number
	/** null = nativo de la cadena. */
	contract: string | null
	/** Tick de QvaPay con el precio USD (catálogo de monedas). */
	priceTick: string | null
	/** Stablecoin: sin precio en catálogo vale 1 USD. */
	stable: boolean
	/** Tick para el logo de la moneda (media.qvapay.com/coins/{tick}.svg). */
	logoTick: string
	/** Tick para el badge de la red. */
	networkTick: string
}

/** Balances crudos (unidades mínimas, bigint serializado a string) por id de activo. */
export type RawBalances = Record<string, string>

export const nativeAssetId = (chainKey: string): string => `${chainKey}:native`
export const tokenAssetId = (chainKey: string, contract: string): string => `${chainKey}:${contract}`

/** Ticks del catálogo de QvaPay por símbolo nativo/red (BNB en QvaPay es BNBBSC, POL es MATICMAINNET). */
const NATIVE_TICKS: Record<string, string> = {
	ETH: 'ETH',
	BNB: 'BNBBSC',
	POL: 'MATICMAINNET',
	MATIC: 'MATICMAINNET',
	TRX: 'TRX',
	BTC: 'BTC',
	STX: 'STX',
}

const NETWORK_TICKS: Record<string, string> = {
	ethereum: 'ETH',
	bsc: 'BNBBSC',
	base: 'BASE',
	polygon: 'MATICMAINNET',
	tron: 'TRX',
	bitcoin: 'BTC',
	stacks: 'STX',
}

const STABLES = new Set(['USDT', 'USDC', 'USDC.E', 'DAI', 'PYUSD', 'TUSD', 'QUSD'])

/** Nombre corto de red para las filas ("BNB Chain" se lee mejor que "BNB Smart Chain"). */
const SHORT_CHAIN_NAMES: Record<string, string> = {
	bsc: 'BNB Chain',
	polygon: 'Polygon',
}

const chainDisplayName = (chainKey: string, chain: RegistryChain): string =>
	SHORT_CHAIN_NAMES[chainKey] ?? chain.name ?? chainKey

/**
 * Activos visibles por defecto (aunque estén en cero), en este orden: lo que
 * de verdad mueve el usuario de QvaPay. Referenciados por símbolo+red para no
 * atar la lista a una dirección de contrato concreta del registry.
 */
export const DEFAULT_ASSETS: Array<{ chainKey: string, symbol: string }> = [
	{ chainKey: 'tron', symbol: 'USDT' },
	// QUSD (Stacks): el token de QvaPay, segundo en la lista base
	{ chainKey: 'stacks', symbol: 'QUSD' },
	{ chainKey: 'bsc', symbol: 'USDT' },
	{ chainKey: 'bitcoin', symbol: 'BTC' },
	{ chainKey: 'ethereum', symbol: 'ETH' },
	{ chainKey: 'base', symbol: 'ETH' },
	{ chainKey: 'bsc', symbol: 'BNB' },
	{ chainKey: 'tron', symbol: 'TRX' },
]

/** Todos los activos del registry: por cadena, el nativo y luego sus tokens. */
export const buildAssetCatalog = (registry: RpcRegistry): WalletAsset[] =>
	Object.entries(registry.chains).flatMap(([chainKey, chain]) => {
		const chainName = chainDisplayName(chainKey, chain)
		const networkTick = NETWORK_TICKS[chainKey] ?? chain.native.symbol
		const native: WalletAsset = {
			id: nativeAssetId(chainKey),
			chainKey,
			chainName,
			kind: chain.kind,
			symbol: chain.native.symbol,
			decimals: chain.native.decimals,
			contract: null,
			priceTick: NATIVE_TICKS[chain.native.symbol] ?? null,
			stable: false,
			logoTick: NATIVE_TICKS[chain.native.symbol] ?? chain.native.symbol,
			networkTick,
		}
		const tokens = (chain.tokens ?? []).map<WalletAsset>(token => {
			const upper = token.symbol.toUpperCase()
			// USDC.e (puenteado) usa el logo y el precio de USDC
			const baseSymbol = upper.replace(/\.E$/, '')
			return {
				id: tokenAssetId(chainKey, token.address),
				chainKey,
				chainName,
				kind: chain.kind,
				symbol: token.symbol,
				decimals: token.decimals,
				contract: token.address,
				priceTick: STABLES.has(upper) ? baseSymbol : null,
				stable: STABLES.has(upper),
				logoTick: baseSymbol,
				networkTick,
			}
		})
		return [native, ...tokens]
	})

/** Dirección del usuario que corresponde a la familia de la cadena. */
export const addressForKind = (addresses: WalletAddresses, kind: ChainKind): string =>
	kind === 'evm' ? addresses.evm : kind === 'tron' ? addresses.tron : kind === 'stacks' ? addresses.stx : addresses.btc

const defaultRank = (asset: WalletAsset): number =>
	DEFAULT_ASSETS.findIndex(d => d.chainKey === asset.chainKey && d.symbol === asset.symbol)

export const isDefaultAsset = (asset: WalletAsset): boolean => defaultRank(asset) !== -1

/** Precio USD por tick (`Coin.price` del catálogo de QvaPay). */
export type PriceMap = Record<string, number>

export const assetPrice = (asset: WalletAsset, prices: PriceMap): number | null => {
	const price = asset.priceTick ? prices[asset.priceTick] : undefined
	if (typeof price === 'number' && Number.isFinite(price) && price > 0) return price
	return asset.stable ? 1 : null
}

export type AssetView = WalletAsset & {
	/** Decimal humano exacto ('12.5'). */
	amount: string
	/** Para pintar ('1,240.5', '<0.000001'). */
	amountLabel: string
	/** null = sin precio conocido (no suma al total). */
	usd: number | null
	hasBalance: boolean
}

export const toAssetView = (asset: WalletAsset, balances: RawBalances, prices: PriceMap): AssetView => {
	const raw = BigInt(balances[asset.id] ?? '0')
	const amount = formatUnits(raw, asset.decimals)
	const price = assetPrice(asset, prices)
	return {
		...asset,
		amount,
		amountLabel: displayAmount(amount),
		usd: price === null ? null : Number(amount) * price,
		hasBalance: raw > 0n,
	}
}

/** Preferencias explícitas del usuario en "Gestionar activos": id → visible. */
export type AssetVisibility = Record<string, boolean>

/**
 * Visible si el usuario lo encendió; si no lo apagó explícitamente, también
 * los de la lista base y cualquiera con saldo (un depósito inesperado de USDC
 * en Base no puede quedar escondido).
 */
export const isAssetVisible = (view: AssetView, prefs: AssetVisibility): boolean => {
	const pref = prefs[view.id]
	if (pref !== undefined) return pref
	return isDefaultAsset(view) || view.hasBalance
}

/** Orden de la lista: valor USD desc; a igualdad, orden de la lista base y luego del registry. */
export const sortAssets = (views: AssetView[]): AssetView[] => {
	const catalogIndex = new Map(views.map((view, index) => [view.id, index]))
	const rank = (view: AssetView) => {
		const r = defaultRank(view)
		return r === -1 ? DEFAULT_ASSETS.length : r
	}
	return views.slice().sort((a, b) => {
		const usdDiff = (b.usd ?? 0) - (a.usd ?? 0)
		// Diferencias por debajo de un centavo cuentan como empate: el polvo no reordena la lista
		if (Math.abs(usdDiff) >= 0.01) return usdDiff
		return rank(a) - rank(b) || (catalogIndex.get(a.id)! - catalogIndex.get(b.id)!)
	})
}

export const totalUsd = (views: AssetView[]): number =>
	views.reduce((sum, view) => sum + (view.usd ?? 0), 0)

/** URL de explorador para una tx a partir del template del registry (`{tx}`). */
export const explorerTxUrl = (chain: RegistryChain | undefined, hash: string): string | null =>
	chain?.explorer ? chain.explorer.replace('{tx}', encodeURIComponent(hash)) : null

/** URL de explorador para una dirección: mismo host, ruta de address del explorador. */
export const explorerAddressUrl = (chain: RegistryChain | undefined, address: string): string | null => {
	if (!chain?.explorer) return null
	const encoded = encodeURIComponent(address)
	if (chain.explorer.includes('#/transaction/{tx}')) return chain.explorer.replace('#/transaction/{tx}', `#/address/${encoded}`)
	if (chain.explorer.includes('/tx/{tx}')) return chain.explorer.replace('/tx/{tx}', `/address/${encoded}`)
	if (chain.explorer.includes('/txid/{tx}')) return chain.explorer.replace('/txid/{tx}', `/address/${encoded}`)
	return null
}

// ---------------------------------------------------------------------------
// Puente con el saldo QvaPay: moneda del catálogo (`/coins/v2`) ↔ activo
// ---------------------------------------------------------------------------

/** `Coin.network` de QvaPay → chainKey del registry. Redes sin wallet (SOL, TON, ARBITRUM…) quedan fuera. */
const QVAPAY_NETWORK_TO_CHAIN: Record<string, string> = {
	TRON: 'tron',
	BSC: 'bsc',
	ETH: 'ethereum',
	BASE: 'base',
	POL: 'polygon',
	BTC: 'bitcoin',
	STX: 'stacks',
}

/** Ticks del catálogo que son el NATIVO de su red (BTCLN no: es Lightning, no on-chain). */
const NATIVE_COIN_TICKS = new Set(['ETH', 'BNBBSC', 'MATICMAINNET', 'TRX', 'BTC', 'STX'])

/**
 * Activo de la wallet que corresponde a una moneda de depósito/retiro de
 * QvaPay (por red + símbolo: USDT en TRON = `USDT (TRC20)`, etc.). null si la
 * red o el token no están en el registry — entonces no hay puente y el
 * usuario sigue con el flujo normal.
 */
export const findAssetForCoin = (catalog: WalletAsset[], coin: { tick: string, network?: string | null }): WalletAsset | null => {
	const chainKey = coin.network ? QVAPAY_NETWORK_TO_CHAIN[coin.network.toUpperCase()] : undefined
	if (!chainKey) return null
	const tick = coin.tick.toUpperCase()
	if (NATIVE_COIN_TICKS.has(tick)) return catalog.find(a => a.chainKey === chainKey && a.contract === null) ?? null
	const symbol = tick.startsWith('USDT') ? 'USDT' : tick.startsWith('USDC') ? 'USDC' : tick.startsWith('QUSD') ? 'QUSD' : null
	if (!symbol) return null
	return catalog.find(a => a.chainKey === chainKey && a.contract !== null && a.symbol.toUpperCase() === symbol) ?? null
}

/** Inversa: la moneda del catálogo que casa con un activo (para prellenar un retiro hacia la wallet). */
export const findCoinForAsset = <C extends { tick: string, network?: string | null }>(coins: C[], catalog: WalletAsset[], asset: WalletAsset): C | null =>
	coins.find(coin => findAssetForCoin(catalog, coin)?.id === asset.id) ?? null
