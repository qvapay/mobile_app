/**
 * Configuración de staking por cadena, saneada y con respaldo. PURO.
 *
 * El registro remoto gana al empaquetado cuando su `version` no es más vieja
 * (`resolveRegistry`), así que un remoto publicado ANTES de que existiera el
 * bloque `staking` borraría la config empaquetada. Por eso la config se
 * resuelve por cadena: la del registro efectivo si la trae; si no, la del
 * bundled. Y se sanea: un destino mal formado se descarta, no tumba la pantalla.
 */
import type { ChainKind, RegistryStakeTarget, RegistryStaking, RpcRegistry } from '../registry/types'
import { isValidSolanaAddress } from '../solana/codec'
import { isValidTronAddress } from '../tron/tx'

/** Principal Stacks: `SP…` / `SM…` (mainnet), opcionalmente `.contrato`. Corto a propósito: el boot address (`SP000…2Q6VF78`) mide 29. */
const STACKS_PRINCIPAL = /^S[PM][0-9A-HJKMNP-TV-Z]{20,41}(\.[a-zA-Z][a-zA-Z0-9_-]{0,127})?$/

/** Muestras por validador: 3 bastan para medir y caben 5 validadores en un lote de 16. */
export const MAX_SAMPLES_PER_TARGET = 3

const isValidTargetId = (kind: ChainKind, id: unknown): id is string => {
	if (typeof id !== 'string') return false
	if (kind === 'stacks') return STACKS_PRINCIPAL.test(id)
	// Validadores reales (checksum / 32 bytes): una regex de base58 no distingue un SR de TRON de una vote account
	if (kind === 'tron') return isValidTronAddress(id)
	if (kind === 'solana') return isValidSolanaAddress(id)
	return false
}

const sanitizeTarget = (kind: ChainKind, raw: unknown): RegistryStakeTarget | null => {
	if (!raw || typeof raw !== 'object') return null
	const target = raw as Record<string, unknown>
	if (!isValidTargetId(kind, target.id) || typeof target.name !== 'string' || !target.name.trim()) return null
	const clean: RegistryStakeTarget = { id: target.id, name: target.name.trim() }
	if (target.featured === true) clean.featured = true
	if (target.partner === true) clean.partner = true
	if (target.payout === 'btc' || target.payout === 'stx') clean.payout = target.payout
	if (typeof target.minAmount === 'string' && /^\d+$/.test(target.minAmount)) clean.minAmount = target.minAmount
	if (typeof target.url === 'string' && target.url.startsWith('https://')) clean.url = target.url
	if (kind === 'solana' && Array.isArray(target.samples)) {
		const samples = target.samples.filter((s): s is string => typeof s === 'string' && isValidSolanaAddress(s)).slice(0, MAX_SAMPLES_PER_TARGET)
		if (samples.length > 0) clean.samples = samples
	}
	return clean
}

export const sanitizeStaking = (kind: ChainKind, raw: unknown): RegistryStaking | null => {
	if (!raw || typeof raw !== 'object') return null
	const staking = raw as Record<string, unknown>
	const seen = new Set<string>()
	const targets = (Array.isArray(staking.targets) ? staking.targets : [])
		.map(t => sanitizeTarget(kind, t))
		.filter((t): t is RegistryStakeTarget => {
			if (!t || seen.has(t.id)) return false
			seen.add(t.id)
			return true
		})
	const clean: RegistryStaking = { targets }
	if (kind === 'stacks') {
		// Sin contrato PoX válido no hay stacking posible: la config entera no vale
		if (typeof staking.poxContract !== 'string' || !STACKS_PRINCIPAL.test(staking.poxContract) || !staking.poxContract.includes('.')) return null
		clean.poxContract = staking.poxContract
	}
	return clean
}

/**
 * Config de staking de una cadena: la del registro efectivo o, si no la trae
 * (remoto anterior a la función), la del empaquetado. null = sin staking.
 */
export const resolveStakingConfig = (chainKey: string, effective: RpcRegistry, bundled: RpcRegistry): RegistryStaking | null => {
	const chain = effective.chains[chainKey]
	if (!chain) return null
	const fromEffective = chain.staking !== undefined ? sanitizeStaking(chain.kind, chain.staking) : null
	if (fromEffective) return fromEffective
	const fallback = bundled.chains[chainKey]
	return fallback && fallback.kind === chain.kind ? sanitizeStaking(fallback.kind, fallback.staking) : null
}

/**
 * Orden del selector: partners primero, luego destacados, luego el resto;
 * dentro de cada grupo, el orden del registry. Estable.
 */
export const sortStakeTargets = (targets: RegistryStakeTarget[]): RegistryStakeTarget[] => {
	const rank = (t: RegistryStakeTarget) => (t.partner ? 0 : t.featured ? 1 : 2)
	return targets
		.map((target, index) => ({ target, index }))
		.sort((a, b) => rank(a.target) - rank(b.target) || a.index - b.index)
		.map(({ target }) => target)
}
