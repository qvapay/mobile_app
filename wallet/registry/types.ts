/**
 * Contrato del registro remoto de RPCs (repo qvapay/rpc-registry).
 * La app consume `registry.json` publicado en GitHub (espejo en
 * rpc.qvapay.com) con fallback a `bundled.json` empaquetado; los nodos
 * propios entran con priority 0 y `enabled: false` hasta que sincronizan.
 */

export type ChainKind = 'evm' | 'tron' | 'btc' | 'stacks' | 'solana'

export type RegistryToken = {
	symbol: string
	/** Contract address (EVM 0x…, TRON base58; Stacks: identificador SIP-010 `SP….contrato::asset`; Solana: mint SPL base58). */
	address: string
	decimals: number
}

export type RegistryRpc = {
	url: string
	/** Menor = preferido. Los nodos qvapay reservan el 0. */
	priority: number
	/** Etiqueta del operador (qvapay, trongrid, publicnode…). */
	owner: string
	/** `false` = registrado pero apagado (nodo propio aún sin sincronizar). Ausente = habilitado. */
	enabled?: boolean
	headers?: Record<string, string>
	/** Dialecto cuando no es el canónico de la cadena (p. ej. 'esplora' en BTC). */
	api?: string
}

export type RegistryChain = {
	kind: ChainKind
	/** Nombre legible de la red ("BNB Smart Chain"). */
	name?: string
	/** Solo EVM. */
	chainId?: number
	native: { symbol: string, decimals: number }
	/** Template de explorador con `{tx}` como placeholder. */
	explorer: string
	tokens?: RegistryToken[]
	rpcs: RegistryRpc[]
}

export type RpcRegistry = {
	version: number
	updated_at: string
	chains: Record<string, RegistryChain>
}
