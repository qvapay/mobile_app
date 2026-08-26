// Deep links into external crypto wallets for deposits: builds pre-filled
// "send" URIs (Trust Wallet / MetaMask universal links, BIP21, EIP-681,
// solana:, tonkeeper:) and detects which supported wallets are installed.
// Consumed by ui/WalletPickerSheet on the Add (deposit) flow.
import { Linking } from 'react-native'

/** Contexto de depósito tal como llega de la pantalla Add (todo tolerante). */
export type WalletDepositContext = {
	address?: string | null
	amount?: string | number | null
	memo?: string | null
	coin?: string | null
	network?: string | null
}

/** Contexto canónico ya normalizado por `ctxOf` (todo string, may be ''). */
type NormalizedDepositContext = {
	address: string
	amount: string
	memo: string
	coin: string
	network: string
}

/** Entrada del registro de wallets soportadas. */
export type Wallet = {
	id: string
	name: string
	/** Detection scheme (Linking.canOpenURL). */
	scheme: string
	/** Supported coin tickers (bare and network-combined forms). */
	coins: string[]
	/** Builds the pre-filled send URI, or null when the asset is unsupported. */
	buildUri: (raw: WalletDepositContext) => string | null
}

const enc = encodeURIComponent

// Trust Wallet asset IDs (CAIP-like): "c{slip44}" for native, "c{slip44}_t{token_address}" for tokens.
// Used by the Trust Wallet universal link to pre-select the right token across chains.
const trustAssetId = (coin: string, network: string): string | null => {
	const n = (network || '').toUpperCase()
	const c = (coin || '').toUpperCase()
	// `(c as string)`: el narrowing de `c === 'USDT'` haría imposible la rama
	// 'USDTTRC20' (subexpresión muerta heredada) — cast para conservarla verbatim
	if (c === 'USDT' && (n === 'TRC20' || n === 'TRON' || (c as string) === 'USDTTRC20')) return 'c195_tTR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
	if ((c === 'USDT' && n === 'ERC20') || c === 'USDTERC20') return 'c60_t0xdAC17F958D2ee523a2206206994597C13D831ec7'
	if ((c === 'USDT' && n === 'BSC') || c === 'USDTBSC') return 'c20000714_t0x55d398326f99059fF775485246999027B3197955'
	if ((c === 'USDT' && n === 'SOL') || c === 'USDTSOL') return 'c501_tEs9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
	if (c === 'USDC' && n === 'ERC20') return 'c60_t0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
	if (c === 'USDC' && n === 'TRC20') return 'c195_tTEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'
	if (c === 'USDC' && n === 'SOL') return 'c501_tEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
	if (c === 'BTC') return 'c0'
	if (c === 'LTC') return 'c2'
	if (c === 'BCH') return 'c145'
	if (c === 'DOGE') return 'c3'
	if (c === 'ETH') return 'c60'
	if (c === 'BNB' || n === 'BSC') return 'c20000714'
	if (c === 'TRX') return 'c195'
	if (c === 'SOL') return 'c501'
	if (c === 'TON') return 'c607'
	return null
}

// Normalize a deposit context into a canonical shape
const ctxOf = ({ address, amount, memo, coin, network }: WalletDepositContext): NormalizedDepositContext => ({
	address: String(address || '').trim(),
	amount: amount ? String(amount).trim() : '',
	memo: memo ? String(memo).trim() : '',
	coin: String(coin || '').toUpperCase().trim(),
	network: String(network || '').toUpperCase().trim(),
})

// Generic BIP21-style URI builders by scheme.
const bip21 = (scheme: string) => ({ address, amount }: { address: string, amount?: string }): string => {
	const params: string[] = []
	if (amount) params.push(`amount=${enc(amount)}`)
	return `${scheme}:${address}${params.length ? `?${params.join('&')}` : ''}`
}

// EIP-681 for EVM chains: ethereum:{address}[@chainId][?value=...]
const eip681 = ({ address, amount, network }: NormalizedDepositContext): string => {
	const n = network || ''
	const chainId = n === 'BSC' ? 56 : n === 'POLYGON' ? 137 : 1
	const params: string[] = []
	if (amount) params.push(`value=${enc(amount)}`)
	return `ethereum:${address}${chainId !== 1 ? '@' + chainId : ''}${params.length ? `?${params.join('&')}` : ''}`
}

// Wallets registry. Each wallet declares: detection scheme, supported coin tickers, and a buildUri.
// Add new wallets here; the picker derives the list from this array.
const WALLETS: Wallet[] = [
	{
		id: 'trust',
		name: 'Trust Wallet',
		scheme: 'trust://',
		coins: ['BTC', 'LTC', 'BCH', 'DOGE', 'ETH', 'BNB', 'USDT', 'USDTBSC', 'USDTSOL', 'USDTERC20', 'USDTTRC20', 'USDC', 'TRX', 'SOL', 'TON'],
		buildUri: (raw) => {
			const ctx = ctxOf(raw)
			const asset = trustAssetId(ctx.coin, ctx.network)
			if (!asset) return null
			const params = [`asset=${asset}`, `address=${enc(ctx.address)}`]
			if (ctx.amount) params.push(`amount=${enc(ctx.amount)}`)
			if (ctx.memo) params.push(`memo=${enc(ctx.memo)}`)
			return `https://link.trustwallet.com/send?${params.join('&')}`
		},
	},
	{
		id: 'metamask',
		name: 'MetaMask',
		scheme: 'metamask://',
		coins: ['ETH', 'BNB', 'USDT', 'USDTBSC', 'USDTERC20', 'USDC'],
		buildUri: (raw) => {
			const ctx = ctxOf(raw)
			const chainId = ctx.network === 'BSC' || ctx.coin === 'USDTBSC' ? 56 : ctx.network === 'POLYGON' ? 137 : 1
			const params: string[] = []
			if (ctx.amount) params.push(`value=${enc(ctx.amount)}`)
			return `https://metamask.app.link/send/${ctx.address}@${chainId}${params.length ? `?${params.join('&')}` : ''}`
		},
	},
	{
		id: 'phantom',
		name: 'Phantom',
		scheme: 'phantom://',
		coins: ['SOL', 'USDTSOL', 'USDC'],
		buildUri: (raw) => {
			const ctx = ctxOf(raw)
			return `solana:${ctx.address}${ctx.amount ? `?amount=${enc(ctx.amount)}` : ''}`
		},
	},
	{
		id: 'tonkeeper',
		name: 'Tonkeeper',
		scheme: 'tonkeeper://',
		coins: ['TON'],
		buildUri: (raw) => {
			const ctx = ctxOf(raw)
			const params: string[] = []
			if (ctx.amount) {
				const nano = Math.round(Number(ctx.amount) * 1e9)
				if (Number.isFinite(nano) && nano > 0) params.push(`amount=${nano}`)
			}
			if (ctx.memo) params.push(`text=${enc(ctx.memo)}`)
			return `tonkeeper://transfer/${ctx.address}${params.length ? `?${params.join('&')}` : ''}`
		},
	},
	{
		id: 'bluewallet',
		name: 'BlueWallet',
		scheme: 'bluewallet:',
		coins: ['BTC'],
		buildUri: (raw) => bip21('bitcoin')(ctxOf(raw)),
	},
	{
		id: 'muun',
		name: 'Muun',
		scheme: 'muun://',
		coins: ['BTC'],
		buildUri: (raw) => bip21('bitcoin')(ctxOf(raw)),
	},
	{
		id: 'coinbase',
		name: 'Coinbase Wallet',
		scheme: 'cbwallet://',
		coins: ['BTC', 'LTC', 'BCH', 'ETH', 'USDT', 'USDTERC20', 'USDC', 'SOL'],
		buildUri: (raw) => {
			const ctx = ctxOf(raw)
			if (ctx.coin === 'BTC') return bip21('bitcoin')(ctx)
			if (ctx.coin === 'LTC') return bip21('litecoin')(ctx)
			if (ctx.coin === 'BCH') return bip21('bitcoincash')(ctx)
			if (ctx.coin === 'SOL' || ctx.coin === 'USDTSOL') return `solana:${ctx.address}${ctx.amount ? `?amount=${enc(ctx.amount)}` : ''}`
			return eip681(ctx)
		},
	},
]

/**
 * Returns the wallets that declare support for the given coin/network combo.
 * Matches both the bare ticker ('USDT') and the combined form ('USDTTRC20'),
 * since QvaPay coin ticks encode the network for stablecoins.
 * @param coin - Ticker, e.g. 'BTC', 'USDT', 'USDTTRC20'.
 * @param network - e.g. 'TRC20', 'BSC', 'SOL'.
 * @returns Matching entries from the WALLETS registry.
 */
const getWalletsForCoin = (coin: string | null | undefined, network?: string | null): Wallet[] => {
	const c = String(coin || '').toUpperCase()
	const n = String(network || '').toUpperCase()
	const tick = c + (n && !c.endsWith(n) ? n : '')
	return WALLETS.filter((w) => w.coins.includes(c) || w.coins.includes(tick))
}

/**
 * Filters the supported wallets down to those installed on the device.
 * Uses Linking.canOpenURL — each wallet's scheme must be declared natively
 * (iOS Info.plist LSApplicationQueriesSchemes / Android manifest <queries>)
 * or detection silently reports "not installed".
 * @param coin - Ticker, e.g. 'BTC' or 'USDT'.
 * @param network - e.g. 'TRC20', 'BSC'.
 * @returns Registry entries whose scheme resolved as openable.
 */
export const detectInstalledWallets = async (coin: string | null | undefined, network?: string | null): Promise<Wallet[]> => {
	const candidates = getWalletsForCoin(coin, network)
	const results = await Promise.all(
		candidates.map(async (w) => {
			try {
				const can = await Linking.canOpenURL(w.scheme)
				return can ? w : null
			} catch { return null }
		})
	)
	return results.filter(Boolean) as Wallet[]
}

/**
 * Opens the wallet app on a pre-filled send screen for the deposit context.
 * Acepta el registro tipado o el shape opaco `{ id, name } & Record` con que
 * viaja por WalletPickerSheet — solo `buildUri` se usa aquí.
 * @param wallet - Registry entry, as returned by detectInstalledWallets.
 * @param ctx - Deposit context (address, amount, memo, coin, network).
 * @returns true if a URI was built and opened; errors are swallowed.
 */
export const openInWallet = async (wallet: Wallet | Record<string, unknown>, ctx: WalletDepositContext): Promise<boolean> => {
	try {
		const uri = (wallet as Wallet).buildUri(ctx)
		if (!uri) return false
		await Linking.openURL(uri)
		return true
	} catch { return false }
}
