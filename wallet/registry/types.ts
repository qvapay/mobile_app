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

/**
 * Destino de staking destacado: validador (Solana, vote account), Super
 * Representative (TRON) o pool de stacking (Stacks, principal del operador).
 * `partner` marca un acuerdo comercial: sube al primer puesto y se etiqueta,
 * pero NUNCA se preselecciona en silencio (el usuario ve a quién delega).
 */
export type RegistryStakeTarget = {
	/** Vote account (Solana), dirección del SR (TRON) o principal del pool (Stacks). */
	id: string
	name: string
	/** Aparece en la lista corta del selector. */
	featured?: boolean
	partner?: boolean
	/** Solo pools Stacks: en qué se pagan las recompensas. */
	payout?: 'btc' | 'stx'
	/** Solo pools Stacks: mínimo que acepta el pool, en micro-STX (string: bigint). */
	minAmount?: string
	/** Web del operador (términos del pool, comisiones). */
	url?: string
	/**
	 * Solo Solana: stake accounts REALES delegadas a este validador (grandes y estables) con
	 * las que se MIDE su APY: lo que cobraron en la última epoch, no una fórmula teórica.
	 */
	samples?: string[]
}

/** Configuración de staking de una cadena. Ausente = la cadena no ofrece staking. */
export type RegistryStaking = {
	targets: RegistryStakeTarget[]
	/** Solo Stacks: contrato PoX vigente (`SP000000000000000000002Q6VF78.pox-5` desde ago-2026). */
	poxContract?: string
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
	/** Validadores / SR / pools destacados. Añadir un partner = editar el registry, sin publicar app. */
	staking?: RegistryStaking
}

export type RpcRegistry = {
	version: number
	updated_at: string
	chains: Record<string, RegistryChain>
}
