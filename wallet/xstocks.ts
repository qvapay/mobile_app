/**
 * xStocks (Backed Finance): acciones tokenizadas en Solana como mints Token-2022 — módulo PURO.
 *
 * Los mints viven EN CÓDIGO y no en el registry remoto a propósito: por cada símbolo hay
 * decenas de copias (`TSLAx` pump.fun, etc.) y un registry comprometido o mal editado podría
 * poner al usuario a comprar una falsificación. Los doce de aquí se verificaron en mainnet el
 * 2026-10-14: dueño Token-2022, 8 decimales, mint authority `7pt9tk…` y freeze authority
 * `JDq14B…` de Backed, metadata servida por `xstocks-metadata.backed.fi`, sin transfer hook.
 *
 * Por qué estos doce: los subyacentes más conocidos y los xStocks con más volumen y
 * liquidez en Jupiter (TSLAx, NVDAx, SPYx, CRCLx y GOOGLx encabezan el volumen diario).
 */
import type { RegistryToken, RpcRegistry } from './registry/types'

export const XSTOCKS_CHAIN = 'solana'
export const XSTOCK_DECIMALS = 8

export type XStock = {
	/** Símbolo del token (`TSLAx`). */
	symbol: string
	/** Ticker del subyacente en su bolsa (`TSLA`): el del gráfico y el que reconoce el usuario. */
	underlying: string
	name: string
	mint: string
}

export const XSTOCKS: readonly XStock[] = [
	{ symbol: 'TSLAx', underlying: 'TSLA', name: 'Tesla', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' },
	{ symbol: 'NVDAx', underlying: 'NVDA', name: 'NVIDIA', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh' },
	{ symbol: 'AAPLx', underlying: 'AAPL', name: 'Apple', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
	{ symbol: 'SPYx', underlying: 'SPY', name: 'S&P 500', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' },
	{ symbol: 'QQQx', underlying: 'QQQ', name: 'Nasdaq 100', mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ' },
	{ symbol: 'MSFTx', underlying: 'MSFT', name: 'Microsoft', mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX' },
	{ symbol: 'GOOGLx', underlying: 'GOOGL', name: 'Alphabet', mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN' },
	{ symbol: 'AMZNx', underlying: 'AMZN', name: 'Amazon', mint: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg' },
	{ symbol: 'METAx', underlying: 'META', name: 'Meta', mint: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu' },
	{ symbol: 'COINx', underlying: 'COIN', name: 'Coinbase', mint: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu' },
	{ symbol: 'MSTRx', underlying: 'MSTR', name: 'Strategy', mint: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ' },
	{ symbol: 'CRCLx', underlying: 'CRCL', name: 'Circle', mint: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1' },
]

const BY_MINT = new Map(XSTOCKS.map(stock => [stock.mint, stock]))

export const xStockByMint = (mint: string | null | undefined): XStock | null => (mint ? BY_MINT.get(mint) ?? null : null)

export const xStockByUnderlying = (underlying: string): XStock | null =>
	XSTOCKS.find(stock => stock.underlying === underlying.toUpperCase()) ?? null

/** Mismo formato que `tokenAssetId` de assets.ts (no se importa: assets.ts depende de este módulo). */
export const xStockAssetId = (stock: XStock): string => `${XSTOCKS_CHAIN}:${stock.mint}`

/** Clave de precio en el `PriceMap` de la wallet: precio USD por unidad CRUDA (sin multiplicador). */
export const xStockPriceTick = (mint: string): string => `xstock:${mint}`

const XSTOCK_TOKENS: RegistryToken[] = XSTOCKS.map(stock => ({
	symbol: stock.symbol,
	address: stock.mint,
	decimals: XSTOCK_DECIMALS,
	program: 'token2022',
	kind: 'stock',
	underlying: stock.underlying,
	name: stock.name,
}))

/**
 * El registro con los xStocks en la cadena Solana. Si el registry ya trae alguno de estos
 * mints (o un token con el mismo SÍMBOLO y otro mint: una falsificación), manda el de aquí.
 */
export const withXStocks = (registry: RpcRegistry): RpcRegistry => {
	const chain = registry.chains[XSTOCKS_CHAIN]
	if (!chain) return registry
	const symbols = new Set(XSTOCKS.map(stock => stock.symbol.toUpperCase()))
	const base = (chain.tokens ?? []).filter(token => !BY_MINT.has(token.address) && !symbols.has(token.symbol.toUpperCase()))
	return { ...registry, chains: { ...registry.chains, [XSTOCKS_CHAIN]: { ...chain, tokens: [...base, ...XSTOCK_TOKENS] } } }
}
