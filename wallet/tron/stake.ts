/**
 * Stake 2.0 de TRON: congelar TRX (energía) + votar a un Super Representative,
 * cobrar recompensas de voto, descongelar (14 días) y retirar lo desbloqueado.
 * Módulo PURO (fetch global, deps inyectadas), tests en node.
 *
 * Mismo contrato que los envíos: el nodo construye cada tx, la app la DECODIFICA,
 * exige que diga exactamente lo pedido y recalcula su txID antes de firmar.
 *
 * El caso especial es "stake" = congelar + votar en UN solo PIN: el nodo rechaza
 * construir un voto con un TRON Power que aún no existe, así que el voto se construye
 * AQUÍ (protobuf propio, contrastado byte a byte con una tx real de mainnet) contra un
 * bloque reciente, se firma junto al congelado y se difunde en cuanto la red ve el TRX
 * congelado. Si el voto no entra, el congelado sí: el dinero está a salvo y la UI ofrece
 * votar después (`note: 'votePending'`).
 */
import { ChainHttpError, postJson } from '../chains/http'
import { parseTronAccount, tronPowerSun, tronToHex20, tronVotesUsed } from '../chains/tron'
import type { TronAccountState } from '../chains/tron'
import type { RegistryRpc } from '../registry/types'
import type { StakeBroadcastResult, StakeIntent, StakeNotice, StakePosition, StakeSummary, StakeTxAdapter } from '../staking/types'
import { TRON_ACTIVE_SRS, tronVoteApr } from '../staking/apy'
import { concatBytes, encodeBytesField, encodeVarintField, hexToBytes } from './protobuf'
import {
	broadcastTronTransaction,
	computeTronBurnBreakdown,
	decodeNodeMessage,
	decodeTronRaw,
	getTronChainParams,
	getTronResources,
	isValidTronAddress,
	SIGNATURE_OVERHEAD_BYTES,
	signTronTransaction,
	SUN_PER_TRX,
	TRON_STAKE_CONTRACT_TYPES,
	TRON_TX_RPC,
	tronTxId,
	TronVerifyError,
} from './tx'
import type { DecodedTronContract, DecodedTronRaw, TronNodeTx, TronStakeResource } from './tx'

/** Vida del voto construido localmente: tiempo de sobra para que el congelado se confirme. */
export const LOCAL_VOTE_TTL_MS = 10 * 60_000
/** Espera máxima a que la red vea el TRX congelado antes de difundir el voto. */
export const VOTE_WAIT_DEADLINE_MS = 60_000
const VOTE_WAIT_INTERVAL_MS = 3_000
/** Entre cobros de recompensas la red exige 24 h. */
export const CLAIM_INTERVAL_MS = 24 * 3600_000
/** Descongelados simultáneos que admite la red por cuenta. */
export const MAX_PENDING_UNFREEZES = 32
const DEFAULT_UNFREEZE_DELAY_DAYS = 14

type Rpc = RegistryRpc
type Deps = { signal?: AbortSignal, now?: () => number, sleep?: (ms: number) => Promise<void> }

const base = (rpc: Rpc) => rpc.url.replace(/\/+$/, '')
const post = <T>(rpc: Rpc, path: string, body: unknown, signal?: AbortSignal) => postJson<T>(`${base(rpc)}${path}`, body, { signal, headers: rpc.headers })
/** Rechazo de negocio: no reintentable (sería igual en cualquier nodo). */
const invalid = (message: string) => new ChainHttpError(`tron: ${message}`, { retryable: false })

const trx = (sun: bigint) => sun / SUN_PER_TRX

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export const getTronAccount = async (rpc: Rpc, address: string, signal?: AbortSignal): Promise<TronAccountState> =>
	parseTronAccount(await post(rpc, '/wallet/getaccount', { address, visible: true }, signal))

/** Recompensas de voto pendientes de cobrar (sun). */
export const getTronReward = async (rpc: Rpc, address: string, signal?: AbortSignal): Promise<bigint> =>
	BigInt((await post<{ reward?: number }>(rpc, '/wallet/getReward', { address, visible: true }, signal))?.reward ?? 0)

/** Próximo mantenimiento (cada 6 h): ahí empiezan a contar los votos nuevos. */
export const getNextMaintenance = async (rpc: Rpc, signal?: AbortSignal): Promise<number | null> => {
	try {
		const res = await post<{ num?: number }>(rpc, '/wallet/getnextmaintenancetime', {}, signal)
		return typeof res?.num === 'number' ? res.num : null
	} catch { return null }
}

/** Parámetros de Stake 2.0 de la red (con defaults si el nodo no responde). */
export const getTronStakeParams = async (rpc: Rpc, signal?: AbortSignal): Promise<{ unfreezeDelayDays: number, payPerBlockSun: bigint | null, witnessPayPerBlockSun: bigint | null }> => {
	try {
		const res = await post<{ chainParameter?: Array<{ key: string, value?: number }> }>(rpc, '/wallet/getchainparameters', {}, signal)
		const find = (key: string) => res.chainParameter?.find(p => p.key === key)?.value
		const positive = (value: number | undefined) => (typeof value === 'number' && value > 0 ? BigInt(value) : null)
		const delay = find('getUnfreezeDelayDays')
		return {
			unfreezeDelayDays: typeof delay === 'number' && delay > 0 ? delay : DEFAULT_UNFREEZE_DELAY_DAYS,
			payPerBlockSun: positive(find('getWitness127PayPerBlock')),
			witnessPayPerBlockSun: positive(find('getWitnessPayPerBlock')),
		}
	} catch {
		return { unfreezeDelayDays: DEFAULT_UNFREEZE_DELAY_DAYS, payPerBlockSun: null, witnessPayPerBlockSun: null }
	}
}

/** ¿Es un Super Representative (candidato o activo)? Votar a otra cosa falla on-chain y cobra ancho de banda. */
const isWitness = async (rpc: Rpc, address: string, signal?: AbortSignal): Promise<boolean> =>
	(await post<{ is_witness?: boolean }>(rpc, '/wallet/getaccount', { address, visible: true }, signal))?.is_witness === true

// ---------------------------------------------------------------------------
// Posiciones (PURO)
// ---------------------------------------------------------------------------

const FROZEN_RESOURCES: TronStakeResource[] = ['ENERGY', 'BANDWIDTH', 'TRON_POWER']

export const tronPositionsFrom = (state: TronAccountState, now: number, names: Record<string, string> = {}): StakePosition[] => {
	// Si todos los votos van a un SR, las posiciones congeladas "trabajan" para él
	const single = state.votes.length === 1 ? state.votes[0].address : null
	const target = single ? { id: single, name: names[single] ?? null } : null
	const positions: StakePosition[] = []
	for (const resource of FROZEN_RESOURCES) {
		if (state.frozen[resource] > 0n) positions.push({ chainKey: 'tron', kind: 'tron', id: `frozen:${resource}`, status: 'active', amount: state.frozen[resource], target })
	}
	for (const resource of ['ENERGY', 'BANDWIDTH'] as const) {
		if (state.delegatedOut[resource] > 0n) positions.push({ chainKey: 'tron', kind: 'tron', id: `delegated:${resource}`, status: 'locked', amount: state.delegatedOut[resource], target })
	}
	state.unfrozen.forEach((u, i) => positions.push({
		chainKey: 'tron',
		kind: 'tron',
		id: `unfreeze:${u.expireAt}:${i}`,
		status: u.expireAt <= now ? 'withdrawable' : 'cooling',
		amount: u.amount,
		unlockAt: u.expireAt <= now ? null : u.expireAt,
		target: null,
	}))
	return positions
}

/** Recurso de una posición `frozen:<RECURSO>`. */
export const resourceOfPosition = (positionId: string | null | undefined): TronStakeResource | null => {
	const match = /^frozen:(ENERGY|BANDWIDTH|TRON_POWER)$/.exec(positionId ?? '')
	return match ? (match[1] as TronStakeResource) : null
}

// ---------------------------------------------------------------------------
// APY por SR (selector)
// ---------------------------------------------------------------------------

/**
 * Clave común de una dirección de SR. `listwitnesses` de TronGrid devuelve HEX (`41…`)
 * aunque se pida `visible: true`, y el registry guarda base58 (`T…`): comparadas tal cual
 * nunca coincidían y el APY de TRON salía siempre vacío. Se comparan los 20 bytes.
 */
export const witnessKey = (address: string): string => {
	if (/^41[0-9a-fA-F]{40}$/.test(address)) return address.slice(2).toLowerCase()
	try { return tronToHex20(address) } catch { return address }
}

/**
 * APY de cada SR: recompensa de voto (igual por voto en todo el top 127) más, si el SR
 * está en el top 27, su parte de la recompensa por producir bloques (por voto depende de
 * SUS votos). Fuera del top 127 no hay recompensa (null); sin brokerage conocido, tampoco
 * hay cifra. Ver `tronVoteApr` para la verificación contra lo cobrado de verdad. PURO.
 */
export const tronTargetApys = (
	witnesses: Array<{ address: string, voteCount?: number }>,
	payPerBlockSun: bigint,
	brokerages: Record<string, number | null>,
	targets: string[],
	witnessPayPerBlockSun: bigint | null = null,
): Record<string, number | null> => {
	const ranked = witnesses.slice().sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0))
	const top = ranked.slice(0, 127)
	const totalVotes = top.reduce((sum, w) => sum + (w.voteCount ?? 0), 0)
	const rank = new Map(top.map((w, i) => [witnessKey(w.address), i]))
	return Object.fromEntries(targets.map(target => {
		const brokerage = brokerages[target]
		const position = rank.get(witnessKey(target))
		if (position === undefined || brokerage === null || brokerage === undefined) return [target, null]
		const producer = position < TRON_ACTIVE_SRS && witnessPayPerBlockSun !== null
			? { witnessPayPerBlockSun, srVotes: top[position].voteCount ?? 0 }
			: null
		return [target, tronVoteApr({ payPerBlockSun, totalVotes, brokerage: brokerage / 100, producer })]
	}))
}

/**
 * TronGrid devuelve SIEMPRE `brokerage: 0` (comprobado contra publicnode el 2026-09-30,
 * que da 4–5 % para los mismos SR): la comisión se lee de cualquier otro nodo o no se lee.
 */
export const TRON_BROKERAGE_RPC = (rpc: Rpc): boolean => TRON_TX_RPC(rpc) && rpc.owner !== 'trongrid'

export const readTronBrokerages = async (rpc: Rpc, targets: string[], signal?: AbortSignal): Promise<Record<string, number | null>> =>
	Object.fromEntries(await Promise.all(targets.map(async target => {
		const res = await post<{ brokerage?: number }>(rpc, '/wallet/getBrokerage', { address: target, visible: true }, signal)
		return [target, typeof res?.brokerage === 'number' ? res.brokerage : null] as const
	})))

export const readTronWitnesses = async (rpc: Rpc, signal?: AbortSignal): Promise<Array<{ address: string, voteCount?: number }>> => {
	const res = await post<{ witnesses?: Array<{ address: string, voteCount?: number }> }>(rpc, '/wallet/listwitnesses', { visible: true }, signal)
	return res?.witnesses ?? []
}

// ---------------------------------------------------------------------------
// Voto construido localmente (protocol.Transaction.raw)
// ---------------------------------------------------------------------------

const addressBytes = (address: string): Uint8Array => hexToBytes(`41${tronToHex20(address)}`)
const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, ch => ch.charCodeAt(0))

export type TronRefBlock = { refBlockBytes: string, refBlockHash: string, blockTimestamp: number }

/** Bloque de referencia de una tx: 2 bytes bajos del número y bytes 8..16 del id del bloque. */
export const refBlockFrom = (block: { blockID: string, block_header: { raw_data: { timestamp: number } } }): TronRefBlock => ({
	refBlockBytes: block.blockID.slice(12, 16),
	refBlockHash: block.blockID.slice(16, 32),
	blockTimestamp: block.block_header.raw_data.timestamp,
})

/** VoteWitnessContract { 1 owner · 2 votos {1 SR · 2 cantidad} } (support = false se omite). */
export const encodeVoteWitnessValue = (owner: string, votes: Array<{ address: string, count: bigint }>): Uint8Array =>
	concatBytes(
		encodeBytesField(1, addressBytes(owner)),
		...votes.map(v => encodeBytesField(2, concatBytes(encodeBytesField(1, addressBytes(v.address)), encodeVarintField(2, v.count)))),
	)

/** raw = 1 ref_block_bytes · 4 ref_block_hash · 8 expiration · 11 contract{1 tipo · 2 Any{1 url · 2 valor}} · 14 timestamp. */
export const encodeTronRaw = ({ ref, expiration, timestamp, typeCode, typeName, value }: {
	ref: Pick<TronRefBlock, 'refBlockBytes' | 'refBlockHash'>, expiration: number | bigint, timestamp: number | bigint, typeCode: bigint, typeName: string, value: Uint8Array
}): string => {
	const any = concatBytes(encodeBytesField(1, asciiBytes(`type.googleapis.com/protocol.${typeName}`)), encodeBytesField(2, value))
	const contract = concatBytes(encodeVarintField(1, typeCode), encodeBytesField(2, any))
	const raw = concatBytes(
		encodeBytesField(1, hexToBytes(ref.refBlockBytes)),
		encodeBytesField(4, hexToBytes(ref.refBlockHash)),
		encodeVarintField(8, BigInt(expiration)),
		encodeBytesField(11, contract),
		encodeVarintField(14, BigInt(timestamp)),
	)
	return Array.from(raw, b => b.toString(16).padStart(2, '0')).join('')
}

export const buildLocalVoteTx = (owner: string, votes: Array<{ address: string, count: bigint }>, ref: TronRefBlock, now: number): TronNodeTx => {
	const raw_data_hex = encodeTronRaw({
		ref,
		expiration: ref.blockTimestamp + LOCAL_VOTE_TTL_MS,
		timestamp: now,
		typeCode: TRON_STAKE_CONTRACT_TYPES.VoteWitnessContract,
		typeName: 'VoteWitnessContract',
		value: encodeVoteWitnessValue(owner, votes),
	})
	return { txID: tronTxId(raw_data_hex), raw_data_hex }
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export type TronStakeIntent =
	| { action: 'stake', owner: string, amount: bigint, sr: string }
	| { action: 'vote', owner: string, sr: string }
	| { action: 'unstake', owner: string, amount: bigint, resource: TronStakeResource }
	| { action: 'withdraw', owner: string }
	| { action: 'claim', owner: string }

type Step = 'freeze' | 'vote' | 'unfreeze' | 'withdraw' | 'claim'

export type PreparedTronStake = {
	intent: TronStakeIntent
	/** Tx en orden de difusión. En `stake`: [congelar, votar]. */
	txs: Array<{ step: Step, tx: TronNodeTx, raw: DecodedTronRaw }>
	/** Votos que quedarán (en TRX) tras `stake`/`vote`. */
	votes: Array<{ address: string, count: bigint }> | null
	/** Congelado (stake), descongelado (unstake), retirado (withdraw) o cobrado (claim). */
	amount: bigint | null
	feeSun: bigint
	expiresAt: number
	waitMs: number | null
	notices: StakeNotice[]
	/** TRON Power (sun) que debe verse antes de difundir el voto de un `stake`. */
	powerNeededSun: bigint | null
}

const nodeBuilt = async (rpc: Rpc, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<TronNodeTx> => {
	const tx = await post<TronNodeTx & { Error?: string, result?: { message?: string } }>(rpc, path, { ...body, visible: true }, signal)
	if (!tx?.raw_data_hex || !tx.txID) throw invalid(decodeNodeMessage(tx?.Error ?? tx?.result?.message) || 'el nodo no construyó la transacción')
	return tx
}

/** Comisión: cada tx de sistema solo gasta ancho de banda; las bolsas gratuitas se consumen en orden. */
const bandwidthFee = async (rpc: Rpc, owner: string, txs: TronNodeTx[], signal?: AbortSignal): Promise<bigint> => {
	const [resources, params] = await Promise.all([getTronResources(rpc, owner, { signal }), getTronChainParams(rpc, { signal })])
	let free = resources.freeBandwidth
	let staked = resources.stakedBandwidth
	let total = 0n
	for (const tx of txs) {
		const needed = BigInt(tx.raw_data_hex.length / 2) + SIGNATURE_OVERHEAD_BYTES
		const breakdown = computeTronBurnBreakdown({ energyNeeded: 0n, bandwidthNeeded: needed, activatesAccount: false }, { ...resources, freeBandwidth: free, stakedBandwidth: staked }, params)
		if (breakdown.bandwidthCovered) {
			if (staked >= needed) staked -= needed
			else free -= needed
		}
		total += breakdown.total
	}
	return total
}

export const prepareTronStake = async (rpc: Rpc, intent: TronStakeIntent, deps: Deps = {}): Promise<PreparedTronStake> => {
	const { signal } = deps
	const now = (deps.now ?? Date.now)()
	const { owner } = intent
	if (!isValidTronAddress(owner)) throw invalid('dirección propia inválida')
	const state = await getTronAccount(rpc, owner, signal)
	const txs: PreparedTronStake['txs'] = []
	const notices: StakeNotice[] = []
	let votes: PreparedTronStake['votes'] = null
	let amount: bigint | null = null
	let waitMs: number | null = null
	let powerNeededSun: bigint | null = null
	const push = (step: Step, tx: TronNodeTx) => txs.push({ step, tx, raw: decodeTronRaw(tx.raw_data_hex) })

	if (intent.action === 'stake' || intent.action === 'vote') {
		if (!isValidTronAddress(intent.sr)) throw invalid('SR inválido')
		const [witness, maintenance] = await Promise.all([isWitness(rpc, intent.sr, signal), getNextMaintenance(rpc, signal)])
		if (!witness) throw invalid('la dirección elegida no es un Super Representative')
		if (state.votes.some(v => v.address !== intent.sr)) notices.push('replacesVotes')
		waitMs = maintenance !== null && maintenance > now ? maintenance - now : null

		if (intent.action === 'stake') {
			if (intent.amount < SUN_PER_TRX) throw invalid('el mínimo para congelar es 1 TRX')
			const power = tronPowerSun(state) + intent.amount
			votes = [{ address: intent.sr, count: trx(power) }]
			powerNeededSun = trx(power) * SUN_PER_TRX
			amount = intent.amount
			const [freeze, block] = await Promise.all([
				nodeBuilt(rpc, '/wallet/freezebalancev2', { owner_address: owner, frozen_balance: Number(intent.amount), resource: 'ENERGY' }, signal),
				post<{ blockID: string, block_header: { raw_data: { timestamp: number } } }>(rpc, '/wallet/getnowblock', {}, signal),
			])
			push('freeze', freeze)
			push('vote', buildLocalVoteTx(owner, votes, refBlockFrom(block), now))
		} else {
			const power = tronPowerSun(state)
			if (power < SUN_PER_TRX) throw invalid('no tienes TRON Power: congela TRX primero')
			votes = [{ address: intent.sr, count: trx(power) }]
			push('vote', await nodeBuilt(rpc, '/wallet/votewitnessaccount', { owner_address: owner, votes: votes.map(v => ({ vote_address: v.address, vote_count: Number(v.count) })) }, signal))
		}
	} else if (intent.action === 'unstake') {
		if (intent.amount < SUN_PER_TRX) throw invalid('el mínimo para descongelar es 1 TRX')
		if (intent.amount > state.frozen[intent.resource]) throw invalid('no tienes tanto congelado en ese recurso')
		if (state.unfrozen.length >= MAX_PENDING_UNFREEZES) throw invalid(`ya tienes ${MAX_PENDING_UNFREEZES} descongelados en curso; retira alguno primero`)
		if (tronVotesUsed(state) > 0n) notices.push('votesAdjust')
		const { unfreezeDelayDays } = await getTronStakeParams(rpc, signal)
		amount = intent.amount
		waitMs = unfreezeDelayDays * 24 * 3600_000
		push('unfreeze', await nodeBuilt(rpc, '/wallet/unfreezebalancev2', { owner_address: owner, unfreeze_balance: Number(intent.amount), resource: intent.resource }, signal))
	} else if (intent.action === 'withdraw') {
		amount = state.unfrozen.filter(u => u.expireAt <= now).reduce((sum, u) => sum + u.amount, 0n)
		if (amount <= 0n) throw invalid('aún no hay nada descongelado que retirar')
		push('withdraw', await nodeBuilt(rpc, '/wallet/withdrawexpireunfreeze', { owner_address: owner }, signal))
	} else {
		if (state.latestWithdrawTime !== null && state.latestWithdrawTime + CLAIM_INTERVAL_MS > now) throw invalid('solo se puede cobrar una vez cada 24 h')
		amount = await getTronReward(rpc, owner, signal)
		if (amount <= 0n) throw invalid('no hay recompensas que cobrar')
		push('claim', await nodeBuilt(rpc, '/wallet/withdrawbalance', { owner_address: owner }, signal))
	}

	const feeSun = await bandwidthFee(rpc, owner, txs.map(t => t.tx), signal)
	if (intent.action === 'stake' && intent.amount + feeSun > state.balance) throw invalid('saldo insuficiente para congelar esa cantidad y pagar el ancho de banda')
	if (feeSun > state.balance) throw invalid('no tienes TRX para el ancho de banda de esta operación')

	const prepared: PreparedTronStake = {
		intent, txs, votes, amount, feeSun, waitMs, notices, powerNeededSun,
		expiresAt: Math.min(...txs.map(t => Number(t.raw.expiration))),
	}
	verifyTronStake(prepared)
	return prepared
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

const EXPECTED: Record<Step, DecodedTronContract['type']> = {
	freeze: 'FreezeBalanceV2Contract',
	vote: 'VoteWitnessContract',
	unfreeze: 'UnfreezeBalanceV2Contract',
	withdraw: 'WithdrawExpireUnfreezeContract',
	claim: 'WithdrawBalanceContract',
}

const STEPS: Record<TronStakeIntent['action'], Step[]> = {
	stake: ['freeze', 'vote'],
	vote: ['vote'],
	unstake: ['unfreeze'],
	withdraw: ['withdraw'],
	claim: ['claim'],
}

/**
 * Cada tx dice EXACTAMENTE lo que el usuario confirmó: tipo, dueño, cantidad, recurso y
 * la lista COMPLETA de votos (votar sustituye los anteriores: un voto extra colado
 * desviaría recompensas). Sin fee_limit (son contratos de sistema) y txID = sha256(raw).
 */
export const verifyTronStake = (prepared: PreparedTronStake): void => {
	const { intent } = prepared
	const owner = tronToHex20(intent.owner)
	const steps = prepared.txs.map(t => t.step)
	if (steps.join() !== STEPS[intent.action].join()) throw new TronVerifyError('pasos distintos de los esperados')
	for (const { step, tx } of prepared.txs) {
		if (tronTxId(tx.raw_data_hex) !== tx.txID.toLowerCase()) throw new TronVerifyError('txID no coincide con sha256(raw_data)')
		const raw = decodeTronRaw(tx.raw_data_hex)
		if (raw.contracts.length !== 1) throw new TronVerifyError('se esperaba un solo contrato')
		if (raw.feeLimit !== 0n) throw new TronVerifyError('un contrato de sistema no lleva fee_limit')
		const contract = raw.contracts[0]
		if (contract.type === 'Unknown' || contract.type !== EXPECTED[step]) throw new TronVerifyError(`tipo ${contract.type}, se esperaba ${EXPECTED[step]}`)
		if (contract.owner !== owner) throw new TronVerifyError('owner distinto')
		if (contract.type === 'FreezeBalanceV2Contract') {
			if (intent.action !== 'stake' || contract.amount !== intent.amount || contract.resource !== 'ENERGY') throw new TronVerifyError('congelado distinto del confirmado')
		} else if (contract.type === 'UnfreezeBalanceV2Contract') {
			if (intent.action !== 'unstake' || contract.amount !== intent.amount || contract.resource !== intent.resource) throw new TronVerifyError('descongelado distinto del confirmado')
		} else if (contract.type === 'VoteWitnessContract') {
			const expected = (prepared.votes ?? []).map(v => `${tronToHex20(v.address)}:${v.count}`).join()
			const got = contract.votes.map(v => `${v.address}:${v.count}`).join()
			if (contract.support || got !== expected || expected === '') throw new TronVerifyError('votos distintos de los confirmados')
		}
	}
}

// ---------------------------------------------------------------------------
// Firma y difusión
// ---------------------------------------------------------------------------

export type SignedTronStake = { signatures: string[] }

export const signTronStake = (prepared: PreparedTronStake, privateKey: Uint8Array): SignedTronStake => {
	verifyTronStake(prepared)
	return { signatures: prepared.txs.map(({ tx }) => signTronTransaction(tx.raw_data_hex, privateKey)) }
}

/**
 * Difunde en orden. En `stake`, entre el congelado y el voto espera a que la red vea el
 * TRON Power nuevo; si el voto no entra, el resultado es el del congelado con
 * `note: 'votePending'` (el dinero ya está congelado: no se reintenta en bucle).
 */
export const broadcastTronStake = async (rpc: Rpc, prepared: PreparedTronStake, signed: SignedTronStake, deps: Deps = {}): Promise<StakeBroadcastResult> => {
	const { signal } = deps
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
	const now = deps.now ?? Date.now
	if (signed.signatures.length !== prepared.txs.length) throw new TronVerifyError('firmas y transacciones no cuadran')
	const [first, ...rest] = prepared.txs
	const result = await broadcastTronTransaction(rpc, first.tx.raw_data_hex, signed.signatures[0], { signal })
	if (rest.length === 0) return result

	try {
		if (prepared.powerNeededSun !== null) {
			const deadline = now() + VOTE_WAIT_DEADLINE_MS
			for (;;) {
				const state = await getTronAccount(rpc, prepared.intent.owner, signal).catch(() => null)
				if (state && tronPowerSun(state) >= prepared.powerNeededSun) break
				if (now() >= deadline) break
				await sleep(VOTE_WAIT_INTERVAL_MS)
			}
		}
		for (let i = 0; i < rest.length; i++) await broadcastTronTransaction(rpc, rest[i].tx.raw_data_hex, signed.signatures[i + 1], { signal })
		return result
	} catch {
		return { ...result, note: 'votePending' }
	}
}

// ---------------------------------------------------------------------------
// Adaptador para walletStakeActions
// ---------------------------------------------------------------------------

export const toTronStakeIntent = (intent: StakeIntent): TronStakeIntent => {
	const owner = intent.from
	switch (intent.action) {
		case 'stake':
			if (intent.amount === null || !intent.target) throw invalid('falta la cantidad o el SR')
			return { action: 'stake', owner, amount: intent.amount, sr: intent.target.id }
		case 'vote':
			if (!intent.target) throw invalid('falta el SR')
			return { action: 'vote', owner, sr: intent.target.id }
		case 'unstake': {
			const resource = resourceOfPosition(intent.positionId)
			if (intent.amount === null || !resource) throw invalid('falta la cantidad o la posición')
			return { action: 'unstake', owner, amount: intent.amount, resource }
		}
		case 'withdraw':
		case 'claim':
			return { action: intent.action, owner }
		default:
			throw invalid(`acción ${intent.action} no existe en TRON`)
	}
}

export const summarizeTronStake = (prepared: PreparedTronStake, intent: StakeIntent): StakeSummary => ({
	action: intent.action,
	amount: prepared.amount,
	feeEstimated: prepared.feeSun,
	expiresAt: prepared.expiresAt,
	target: prepared.votes?.length ? { id: prepared.votes[0].address, name: intent.target?.name ?? null } : null,
	txCount: prepared.txs.length,
	reserve: null,
	waitMs: prepared.waitMs,
	notices: prepared.notices,
})

export const tronStakeAdapter: StakeTxAdapter<PreparedTronStake, SignedTronStake> = {
	accept(rpc) {
		return TRON_TX_RPC(rpc)
	},
	async prepare(rpc, intent, { signal }) {
		const inner = await prepareTronStake(rpc, toTronStakeIntent(intent), { signal })
		return { inner, summary: summarizeTronStake(inner, intent) }
	},
	sign(inner, privateKey) {
		return signTronStake(inner, privateKey)
	},
	broadcast(rpc, inner, signed, { signal }) {
		return broadcastTronStake(rpc, inner, signed, { signal })
	},
	async entryMinimum() {
		// La red no deja congelar menos de 1 TRX
		return SUN_PER_TRX
	},
	async entryReserve() {
		// Ancho de banda de dos tx sin bolsa gratuita (~0,3 TRX cada una) con margen
		return 1_000_000n
	},
}
