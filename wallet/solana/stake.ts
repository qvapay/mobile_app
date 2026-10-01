/**
 * Staking nativo de SOL. Módulo PURO (fetch global vía `jsonRpc`, codec propio), tests en node.
 *
 * Modelo: cada posición es una STAKE ACCOUNT del usuario, creada con
 * `CreateAccountWithSeed` a partir de su propia dirección (`qp-stake-<n>`): el usuario es
 * a la vez pagador, base, staker y withdrawer, así que firma UNA sola vez y nadie más
 * tiene autoridad sobre esos fondos. El lockup va siempre vacío.
 *
 * Ciclo de vida (lo impone la red, no la app):
 *   stake     = crear + inicializar + delegar  → rinde desde la SIGUIENTE epoch (~2 días)
 *   unstake   = deactivate                     → deja de rendir al terminar la epoch
 *   withdraw  = sacar TODO a la wallet         → la cuenta se cierra y la semilla queda libre
 *
 * Mismo contrato que los envíos: construir → VERIFICAR re-decodificando (whitelist estricta
 * de instrucciones y cuentas) → firmar → difundir.
 */
import { ChainHttpError, jsonRpc } from '../chains/http'
import type { RegistryRpc } from '../registry/types'
import type { StakeIntent, StakePosition, StakeStatus, StakeSummary, StakeTxAdapter } from '../staking/types'
import {
	compileMessage,
	COMPUTE_BUDGET_PROGRAM,
	createAccountWithSeedIx,
	createWithSeed,
	DEFAULT_PUBKEY,
	encodeBase58,
	fromBase64,
	isValidSolanaAddress,
	readU32le,
	readU64le,
	serializeMessage,
	setComputeUnitLimitIx,
	setComputeUnitPriceIx,
	stakeDeactivateIx,
	stakeDelegateIx,
	stakeInitializeIx,
	stakeWithdrawIx,
	STAKE_CONFIG,
	STAKE_PROGRAM,
	SYSTEM_PROGRAM,
	SYSVAR_CLOCK,
	SYSVAR_RENT,
	SYSVAR_STAKE_HISTORY,
	VOTE_PROGRAM,
} from './codec'
import type { Instruction, SolanaMessage } from './codec'
import {
	BLOCKHASH_TTL_MS,
	broadcastSolanaTransaction,
	getSolanaRentExemptMinimum,
	LAMPORTS_PER_SIGNATURE,
	MAX_PRIORITY_MICROLAMPORTS,
	priorityFeeFrom,
	signSolanaMessageAs,
	SolanaVerifyError,
	verifySolanaEnvelope,
} from './tx'
import type { SignedSolanaTx } from './tx'
import { isPlausibleApy } from '../staking/apy'
import { isMethodNotAllowed } from '../registry/rpcRouter'

/** Tamaño de una stake account (StakeStateV2). */
export const STAKE_ACCOUNT_SPACE = 200
/** Prefijo de las semillas de las stake accounts que crea QvaPay. */
export const STAKE_SEED_PREFIX = 'qp-stake-'
/** Semillas que se prueban al buscar hueco (y en el lector de respaldo). */
export const MAX_STAKE_SEEDS = 16
/**
 * Duración de un slot de RESPALDO, solo si el nodo no da `getRecentPerformanceSamples`.
 * La real se mide: en sep-2026 los slots van a ~268 ms y una epoch dura ~32 h, no las
 * 48 h que salen con los 400 ms "de manual". Con 400 las cuentas atrás se alargan un 50 %.
 */
export const SLOT_MS = 400
/** `u64::MAX`: la época de desactivación de un stake que no está saliendo. */
const U64_MAX = 0xffffffffffffffffn
/** Unidades de cómputo por acción (holgadas: pasarse falla la tx y cobra la tarifa). */
const COMPUTE_UNITS = { stake: 30_000, unstake: 10_000, withdraw: 10_000 }
/** Margen que MÁX deja además de la renta, para la tarifa y la prioridad. */
const ENTRY_FEE_MARGIN = 50_000n

type Rpc = RegistryRpc
const rpcCall = <T>(rpc: Rpc, method: string, params: unknown[], signal?: AbortSignal) => jsonRpc<T>(rpc.url, method, params, { signal, headers: rpc.headers })

export const stakeSeed = (index: number): string => `${STAKE_SEED_PREFIX}${index}`
export const stakeAccountFor = (owner: string, index: number): string => createWithSeed(owner, stakeSeed(index), STAKE_PROGRAM)

// ---------------------------------------------------------------------------
// StakeStateV2 (bincode): tag u32 · Meta · [Stake]
//   Meta  = rent_exempt_reserve u64 · staker 32 · withdrawer 32 · lockup(i64, u64, custodio 32)
//   Stake = voter 32 · stake u64 · activation u64 · deactivation u64 · warmup f64 · credits u64
// ---------------------------------------------------------------------------

export type ParsedStakeAccount = {
	/** 1 = inicializada sin delegar, 2 = delegada. */
	state: 'initialized' | 'delegated'
	rentExemptReserve: bigint
	staker: string
	withdrawer: string
	lockupUnixTimestamp: bigint
	lockupEpoch: bigint
	custodian: string
	voter: string | null
	delegatedStake: bigint | null
	activationEpoch: bigint | null
	/** null = no está saliendo (`u64::MAX` en la cuenta). */
	deactivationEpoch: bigint | null
}

const pubkeyAt = (data: Uint8Array, offset: number): string => encodeBase58(data.slice(offset, offset + 32))

export const parseStakeAccount = (data: Uint8Array): ParsedStakeAccount | null => {
	if (data.length < 124) return null
	const tag = readU32le(data, 0)
	if (tag !== 1 && tag !== 2) return null
	const meta = {
		rentExemptReserve: readU64le(data, 4),
		staker: pubkeyAt(data, 12),
		withdrawer: pubkeyAt(data, 44),
		lockupUnixTimestamp: readU64le(data, 76),
		lockupEpoch: readU64le(data, 84),
		custodian: pubkeyAt(data, 92),
	}
	if (tag === 1) return { state: 'initialized', ...meta, voter: null, delegatedStake: null, activationEpoch: null, deactivationEpoch: null }
	if (data.length < 180) return null
	const deactivation = readU64le(data, 172)
	return {
		state: 'delegated',
		...meta,
		voter: pubkeyAt(data, 124),
		delegatedStake: readU64le(data, 156),
		activationEpoch: readU64le(data, 164),
		deactivationEpoch: deactivation === U64_MAX ? null : deactivation,
	}
}

/**
 * Estado de una stake account en la epoch actual. Aproximación de wallet (como
 * Phantom/Solflare): una delegación entra entera en la epoch siguiente y sale entera al
 * terminar la de desactivación; el enfriamiento parcial por el límite de la red es raro
 * y solo retrasaría el paso a "retirable", nunca lo adelanta.
 */
export const stakeStatusOf = (account: ParsedStakeAccount, epoch: bigint): StakeStatus => {
	if (account.state === 'initialized') return 'withdrawable'
	if (account.deactivationEpoch !== null) {
		// Desactivada en la misma epoch en que se activó: nunca llegó a rendir, sale ya
		if (account.activationEpoch === account.deactivationEpoch) return 'withdrawable'
		return epoch > account.deactivationEpoch ? 'withdrawable' : 'cooling'
	}
	return account.activationEpoch !== null && epoch <= account.activationEpoch ? 'activating' : 'active'
}

export type EpochInfo = { epoch: bigint, slotIndex: number, slotsInEpoch: number }

/** Cuándo termina la epoch en curso (estimación por slots restantes × duración medida del slot). */
export const epochEndsAt = (info: EpochInfo, now: number, slotMs: number = SLOT_MS): number => now + Math.max(0, info.slotsInEpoch - info.slotIndex) * slotMs

/** ms por slot a partir de muestras de rendimiento (PURO). null si no son utilizables. */
export const slotMsFromSamples = (samples: Array<{ numSlots?: number, samplePeriodSecs?: number }> | null | undefined): number | null => {
	const slots = (samples ?? []).reduce((sum, x) => sum + (x.numSlots ?? 0), 0)
	const secs = (samples ?? []).reduce((sum, x) => sum + (x.samplePeriodSecs ?? 0), 0)
	if (slots <= 0 || secs <= 0) return null
	const ms = (secs * 1000) / slots
	// Fuera de lo físicamente posible (slots de <100 ms o >2 s) = muestra rota
	return ms >= 100 && ms <= 2000 ? ms : null
}

/** Duración real del slot en los últimos ~10 minutos; `SLOT_MS` si el nodo no la da. */
export const getSlotMs = async (rpc: Rpc, { signal }: { signal?: AbortSignal } = {}): Promise<number> => {
	try {
		return slotMsFromSamples(await rpcCall<Array<{ numSlots: number, samplePeriodSecs: number }>>(rpc, 'getRecentPerformanceSamples', [10], signal)) ?? SLOT_MS
	} catch (err) {
		// Un nodo que no ofrece el método NO es motivo para inventar 400 ms: que el router pruebe otro
		if (isMethodNotAllowed(err)) throw err
		return SLOT_MS
	}
}

export const getEpochInfo = async (rpc: Rpc, { signal }: { signal?: AbortSignal } = {}): Promise<EpochInfo> => {
	const info = await rpcCall<{ epoch: number, slotIndex: number, slotsInEpoch: number }>(rpc, 'getEpochInfo', [{ commitment: 'confirmed' }], signal)
	return { epoch: BigInt(info.epoch), slotIndex: info.slotIndex, slotsInEpoch: info.slotsInEpoch }
}

// ---------------------------------------------------------------------------
// Lectura de las stake accounts del usuario
// ---------------------------------------------------------------------------

export type StakeAccountRead = { address: string, lamports: bigint, parsed: ParsedStakeAccount }

type RawAccount = { lamports: number, owner: string, data: [string, string] } | null

/** Stake accounts cuyo WITHDRAWER es `owner` (quien puede sacar el dinero: es de quien son). */
const byWithdrawer = async (rpc: Rpc, owner: string, signal?: AbortSignal): Promise<StakeAccountRead[]> => {
	const rows = await rpcCall<Array<{ pubkey: string, account: NonNullable<RawAccount> }>>(rpc, 'getProgramAccounts', [STAKE_PROGRAM, {
		encoding: 'base64',
		commitment: 'confirmed',
		filters: [{ dataSize: STAKE_ACCOUNT_SPACE }, { memcmp: { offset: 44, bytes: owner } }],
	}], signal)
	return rows.flatMap(({ pubkey, account }) => {
		const parsed = parseStakeAccount(fromBase64(account.data[0]))
		return parsed ? [{ address: pubkey, lamports: BigInt(account.lamports), parsed }] : []
	})
}

/** Respaldo sin `getProgramAccounts` (muchos nodos públicos lo bloquean): las cuentas que crea QvaPay. */
const bySeeds = async (rpc: Rpc, owner: string, signal?: AbortSignal): Promise<StakeAccountRead[]> => {
	const addresses = Array.from({ length: MAX_STAKE_SEEDS }, (_, i) => stakeAccountFor(owner, i))
	const { value } = await rpcCall<{ value: RawAccount[] }>(rpc, 'getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }], signal)
	return value.flatMap((account, i) => {
		if (!account || account.owner !== STAKE_PROGRAM) return []
		const parsed = parseStakeAccount(fromBase64(account.data[0]))
		return parsed && parsed.withdrawer === owner ? [{ address: addresses[i], lamports: BigInt(account.lamports), parsed }] : []
	})
}

/**
 * Todas las stake accounts del usuario: por `getProgramAccounts` (incluye las creadas
 * con otra wallet) y, si el nodo no lo permite, las de semilla QvaPay. Un nodo caído del
 * todo sí lanza: el router rota de nodo.
 */
export const readSolanaStakeAccounts = async (rpc: Rpc, owner: string, { signal }: { signal?: AbortSignal } = {}): Promise<StakeAccountRead[]> => {
	try {
		return await byWithdrawer(rpc, owner, signal)
	} catch {
		return bySeeds(rpc, owner, signal)
	}
}

/** Posiciones para pintar. PURO. `names`: vote account → nombre del registry. */
export const solanaPositionsFrom = (accounts: StakeAccountRead[], info: EpochInfo, now: number, names: Record<string, string> = {}, slotMs: number = SLOT_MS): StakePosition[] =>
	accounts.map(({ address, lamports, parsed }) => {
		const status = stakeStatusOf(parsed, info.epoch)
		return {
			chainKey: 'solana',
			kind: 'solana',
			id: address,
			status,
			amount: lamports,
			rewards: null,
			unlockAt: status === 'activating' || status === 'cooling' ? epochEndsAt(info, now, slotMs) : null,
			target: parsed.voter ? { id: parsed.voter, name: names[parsed.voter] ?? null } : null,
		}
	})

/**
 * Recompensas REALES de las cuentas activas del usuario en la última epoch cerrada
 * (`getInflationReward`). Con ellas `solanaApyFromRewards` estima su rendimiento.
 */
export const readSolanaLastRewards = async (rpc: Rpc, accounts: StakeAccountRead[], info: EpochInfo, { signal }: { signal?: AbortSignal } = {}): Promise<Array<{ amount: bigint, postBalance: bigint }>> => {
	// Como mucho 16 (tope del proxy sol.qvapay.com): para estimar el rendimiento sobra una muestra
	const active = accounts.filter(a => stakeStatusOf(a.parsed, info.epoch) === 'active').map(a => a.address).slice(0, MAX_STAKE_SEEDS)
	if (active.length === 0 || info.epoch === 0n) return []
	const rewards = await rpcCall<Array<{ amount: number, postBalance: number } | null>>(rpc, 'getInflationReward', [active, { epoch: Number(info.epoch - 1n) }], signal)
	return rewards.flatMap(r => (r && r.amount > 0 ? [{ amount: BigInt(r.amount), postBalance: BigInt(r.postBalance) }] : []))
}

// ---------------------------------------------------------------------------
// APY por validador (para el selector): MEDIDO, no teórico
// ---------------------------------------------------------------------------

/**
 * Por qué medido: la fórmula de manual (inflación ÷ ratio stakeado × (1 − comisión))
 * daba ≈ 5,4 % el 2026-09-30 cuando la red pagaba de verdad ≈ 4,98 % (medido en las
 * stake accounts de estos validadores y confirmado por stakewiz: 4,96–5,04 %). Aquí se
 * mira lo que COBRARON en la última epoch cerrada unas stake accounts reales de cada
 * validador (`samples` del registry) y se anualiza con la duración real de la epoch.
 * Ya incluye comisión y rendimiento de voto; no incluye MEV (Jito, ~0,2 % aparte).
 */
export const annualizeEpochReturn = (perEpoch: number, epochMs: number): number | null =>
	perEpoch > 0 && epochMs > 0 ? (1 + perEpoch) ** ((365.25 * 24 * 3600_000) / epochMs) - 1 : null

export type TargetSamples = { id: string, samples?: string[] }

/**
 * APY de cada destino a partir de sus muestras. PURO.
 * - `voters`: a quién está delegada HOY cada muestra (una cuenta que cambió de validador
 *   no puede medir al anterior).
 * - `rewards`: lo cobrado por cada muestra en la última epoch cerrada.
 */
export const solanaApysFromSamples = (
	targets: TargetSamples[],
	voters: Record<string, string | null>,
	rewards: Record<string, { amount: bigint, postBalance: bigint } | null>,
	epochMs: number,
): Record<string, number | null> => Object.fromEntries(targets.map(target => {
	const valid = (target.samples ?? []).filter(sample => voters[sample] === target.id && (rewards[sample]?.amount ?? 0n) > 0n)
	const earned = valid.reduce((sum, sample) => sum + rewards[sample]!.amount, 0n)
	const before = valid.reduce((sum, sample) => sum + (rewards[sample]!.postBalance - rewards[sample]!.amount), 0n)
	if (earned <= 0n || before <= 0n) return [target.id, null]
	const apy = annualizeEpochReturn(Number(earned) / Number(before), epochMs)
	return [target.id, isPlausibleApy(apy) ? apy : null]
}))

/** Cuatro lecturas pequeñas (epoch, slot, a quién delegan las muestras, qué cobraron). */
export const readSolanaTargetApys = async (rpc: Rpc, targets: TargetSamples[], { signal }: { signal?: AbortSignal } = {}): Promise<Record<string, number | null>> => {
	const samples = [...new Set(targets.flatMap(t => t.samples ?? []))].slice(0, MAX_STAKE_SEEDS)
	if (samples.length === 0) return Object.fromEntries(targets.map(t => [t.id, null]))
	const [info, slotMs, accounts] = await Promise.all([
		getEpochInfo(rpc, { signal }),
		getSlotMs(rpc, { signal }),
		// Solo los 32 bytes del votante (offset 124 de StakeStateV2)
		rpcCall<{ value: Array<{ owner: string, data: [string, string] } | null> }>(rpc, 'getMultipleAccounts', [samples, { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 124, length: 32 } }], signal),
	])
	const voters: Record<string, string | null> = Object.fromEntries(samples.map((sample, i) => {
		const account = accounts.value[i]
		return [sample, account && account.owner === STAKE_PROGRAM ? encodeBase58(fromBase64(account.data[0])) : null]
	}))
	const raw = await rpcCall<Array<{ amount: number, postBalance: number } | null>>(rpc, 'getInflationReward', [samples, { epoch: Number(info.epoch - 1n) }], signal)
	const rewards = Object.fromEntries(samples.map((sample, i) => [sample, raw[i] ? { amount: BigInt(raw[i]!.amount), postBalance: BigInt(raw[i]!.postBalance) } : null]))
	return solanaApysFromSamples(targets, voters, rewards, info.slotsInEpoch * slotMs)
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export type SolanaStakeAction = 'stake' | 'unstake' | 'withdraw'

export type SolanaStakeIntent =
	| { action: 'stake', owner: string, amount: bigint, vote: string }
	| { action: 'unstake', owner: string, stakeAccount: string }
	| { action: 'withdraw', owner: string, stakeAccount: string }

export type PreparedSolanaStake = {
	intent: SolanaStakeIntent
	/** Cuenta sobre la que se actúa (en `stake`, la que se crea). */
	stakeAccount: string
	/** Solo `stake`: semilla de la cuenta creada. */
	seed: string | null
	/** Lo que se delega (stake), la cuenta entera (unstake) o lo que vuelve a la wallet (withdraw). */
	amount: bigint
	/** Solo `stake`: renta de la stake account (se recupera al retirar). */
	rentLamports: bigint
	message: SolanaMessage
	messageBytes: Uint8Array
	recentBlockhash: string
	feeLamports: bigint
	computeUnitPrice: bigint
	computeUnitLimit: number
	expiresAt: number
	/** Hasta que el paso surte efecto (fin de la epoch). */
	waitMs: number | null
}

type Deps = { signal?: AbortSignal, now?: () => number }

const invalid = (message: string) => new ChainHttpError(`solana: ${message}`, { retryable: false })

const priorityLamports = (price: bigint, limit: number): bigint => (price * BigInt(limit) + 999_999n) / 1_000_000n

/** Mínimo que la red acepta delegar (hoy 1 SOL). Si el nodo no lo da, 1 lamport: la red decidirá. */
export const getSolanaStakeMinimum = (rpc: Rpc, signal?: AbortSignal): Promise<bigint> =>
	rpcCall<{ value: number }>(rpc, 'getStakeMinimumDelegation', [{ commitment: 'confirmed' }], signal).then(r => BigInt(r.value)).catch(() => 1n)

/** Primer índice de semilla libre (la cuenta no existe). Las cuentas retiradas se cierran y dejan su hueco. */
export const findFreeStakeSeed = async (rpc: Rpc, owner: string, signal?: AbortSignal): Promise<number> => {
	const addresses = Array.from({ length: MAX_STAKE_SEEDS }, (_, i) => stakeAccountFor(owner, i))
	const { value } = await rpcCall<{ value: RawAccount[] }>(rpc, 'getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } }], signal)
	const free = value.findIndex(account => account === null)
	if (free === -1) throw invalid(`ya tienes ${MAX_STAKE_SEEDS} posiciones de staking; retira alguna para abrir otra`)
	return free
}

const readStakeAccount = async (rpc: Rpc, address: string, signal?: AbortSignal): Promise<StakeAccountRead> => {
	const { value } = await rpcCall<{ value: RawAccount }>(rpc, 'getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }], signal)
	if (!value || value.owner !== STAKE_PROGRAM) throw invalid('la posición no existe o no es una stake account')
	const parsed = parseStakeAccount(fromBase64(value.data[0]))
	if (!parsed) throw invalid('stake account ilegible')
	return { address, lamports: BigInt(value.lamports), parsed }
}

export const prepareSolanaStake = async (rpc: Rpc, intent: SolanaStakeIntent, deps: Deps = {}): Promise<PreparedSolanaStake> => {
	const { signal } = deps
	const now = deps.now ?? Date.now
	const { owner } = intent
	if (!isValidSolanaAddress(owner)) throw invalid('dirección propia inválida')

	const [latest, fees, info, slotMs] = await Promise.all([
		rpcCall<{ value: { blockhash: string } }>(rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }], signal),
		rpcCall<Array<{ prioritizationFee?: number }>>(rpc, 'getRecentPrioritizationFees', [], signal).catch(() => []),
		getEpochInfo(rpc, { signal }),
		getSlotMs(rpc, { signal }),
	])

	const instructions: Instruction[] = []
	let stakeAccount: string
	let seed: string | null = null
	let amount: bigint
	let rentLamports = 0n
	const limit = COMPUTE_UNITS[intent.action]

	if (intent.action === 'stake') {
		if (!isValidSolanaAddress(intent.vote)) throw invalid('validador inválido')
		if (intent.amount <= 0n) throw invalid('cantidad inválida')
		// El destino debe ser una vote account DE VERDAD: delegar en otra cosa falla on-chain y cobra la tarifa
		const [voteInfo, rent, minimum, balance, walletRent, freeSeed] = await Promise.all([
			rpcCall<{ value: RawAccount }>(rpc, 'getAccountInfo', [intent.vote, { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } }], signal),
			rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [STAKE_ACCOUNT_SPACE], signal),
			getSolanaStakeMinimum(rpc, signal),
			rpcCall<{ value: number }>(rpc, 'getBalance', [owner, { commitment: 'confirmed' }], signal),
			getSolanaRentExemptMinimum(rpc, { signal }),
			findFreeStakeSeed(rpc, owner, signal),
		])
		if (voteInfo.value?.owner !== VOTE_PROGRAM) throw invalid('el validador elegido no es una vote account')
		if (intent.amount < minimum) throw invalid(`el mínimo para hacer staking es ${Number(minimum) / 1e9} SOL`)
		rentLamports = BigInt(rent)
		seed = stakeSeed(freeSeed)
		stakeAccount = stakeAccountFor(owner, freeSeed)
		amount = intent.amount
		instructions.push(
			createAccountWithSeedIx({ from: owner, newAccount: stakeAccount, base: owner, seed, lamports: amount + rentLamports, space: STAKE_ACCOUNT_SPACE, owner: STAKE_PROGRAM }),
			stakeInitializeIx(stakeAccount, owner, owner),
			stakeDelegateIx(stakeAccount, intent.vote, owner),
		)
		// Misma regla de renta que un envío: la wallet no puede quedar entre 0 y el mínimo
		const provisionalFee = LAMPORTS_PER_SIGNATURE + priorityLamports(priorityFeeFrom(fees), limit)
		const left = BigInt(balance.value) - amount - rentLamports - provisionalFee
		if (left < 0n) throw invalid('saldo insuficiente para la cantidad, la renta de la cuenta de stake y la comisión')
		if (left > 0n && left < walletRent) throw invalid(`te quedarían ${left} lamports y una cuenta necesita ${walletRent} para seguir existiendo; usa un poco menos`)
	} else {
		const account = await readStakeAccount(rpc, intent.stakeAccount, signal)
		stakeAccount = account.address
		if (intent.action === 'unstake') {
			if (account.parsed.staker !== owner) throw invalid('no eres el staker de esta posición')
			if (account.parsed.state !== 'delegated' || account.parsed.deactivationEpoch !== null) throw invalid('esta posición no está rindiendo')
			amount = account.lamports
			instructions.push(stakeDeactivateIx(stakeAccount, owner))
		} else {
			if (account.parsed.withdrawer !== owner) throw invalid('no eres el dueño de esta posición')
			if (stakeStatusOf(account.parsed, info.epoch) !== 'withdrawable') throw invalid('esta posición aún no se puede retirar')
			if (account.parsed.lockupUnixTimestamp !== 0n || account.parsed.lockupEpoch !== 0n) throw invalid('posición con lockup: no se retira desde aquí')
			// Todo el saldo: la cuenta se cierra (y su renta vuelve a la wallet)
			amount = account.lamports
			instructions.push(stakeWithdrawIx(stakeAccount, owner, owner, amount))
		}
	}

	const computeUnitPrice = priorityFeeFrom(fees)
	if (computeUnitPrice > 0n) instructions.unshift(setComputeUnitLimitIx(limit), setComputeUnitPriceIx(computeUnitPrice))
	const message = compileMessage(owner, instructions, latest.value.blockhash)
	const feeLamports = LAMPORTS_PER_SIGNATURE * BigInt(message.numRequiredSignatures) + (computeUnitPrice > 0n ? priorityLamports(computeUnitPrice, limit) : 0n)
	const at = now()

	return {
		intent,
		stakeAccount,
		seed,
		amount,
		rentLamports,
		message,
		messageBytes: serializeMessage(message),
		recentBlockhash: latest.value.blockhash,
		feeLamports,
		computeUnitPrice,
		computeUnitLimit: limit,
		expiresAt: at + BLOCKHASH_TTL_MS,
		waitMs: intent.action === 'withdraw' ? null : epochEndsAt(info, at, slotMs) - at,
	}
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

export type DecodedSolanaStake = {
	feePayer: string
	action: SolanaStakeAction
	stakeAccount: string
	/** stake: semilla, lamports depositados, autoridades y validador. */
	seed: string | null
	lamports: bigint | null
	staker: string | null
	withdrawer: string | null
	vote: string | null
	/** withdraw: a dónde vuelve el dinero. */
	to: string | null
	computeUnitPrice: bigint | null
}

const ASCII_DECODE = (bytes: Uint8Array): string => String.fromCharCode(...bytes)

/**
 * Decodifica una tx de staking con la forma EXACTA que construye la wallet y rechaza
 * cualquier otra: compute budget opcional y, además, una de estas tres secuencias:
 *   crear-con-semilla(owner=Stake, 200 bytes) · Initialize(lockup vacío) · Delegate
 *   Deactivate
 *   Withdraw
 * Cada instrucción con su lista de cuentas y sus sysvars exactos.
 */
export const decodeSolanaStake = (message: SolanaMessage): DecodedSolanaStake => {
	const key = (i: number) => message.accountKeys[i]
	const feePayer = key(0)
	let computeUnitLimit: number | null = null
	let computeUnitPrice: bigint | null = null
	const body: Array<{ program: string, accounts: string[], data: Uint8Array }> = []

	for (const ix of message.instructions) {
		const program = key(ix.programIdIndex)
		const data = ix.data
		if (program === COMPUTE_BUDGET_PROGRAM) {
			if (body.length > 0) throw new SolanaVerifyError('compute budget fuera de sitio')
			if (data[0] === 2 && data.length === 5 && computeUnitLimit === null) computeUnitLimit = readU32le(data, 1)
			else if (data[0] === 3 && data.length === 9 && computeUnitPrice === null) computeUnitPrice = readU64le(data, 1)
			else throw new SolanaVerifyError('instrucción de compute budget no permitida')
		} else if (program === SYSTEM_PROGRAM || program === STAKE_PROGRAM) {
			body.push({ program, accounts: ix.accounts.map(key), data })
		} else {
			throw new SolanaVerifyError(`programa no permitido ${program}`)
		}
	}

	const tagOf = (ix: { data: Uint8Array }) => (ix.data.length >= 4 ? readU32le(ix.data, 0) : -1)
	const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])
	const base = { feePayer, seed: null, lamports: null, staker: null, withdrawer: null, vote: null, to: null, computeUnitPrice }

	if (body.length === 3) {
		const [create, init, delegate] = body
		if (create.program !== SYSTEM_PROGRAM || tagOf(create) !== 3) throw new SolanaVerifyError('se esperaba crear la cuenta de stake')
		if (create.accounts.length !== 2 || create.accounts[0] !== feePayer) throw new SolanaVerifyError('la cuenta de stake la debe crear y pagar el usuario')
		const d = create.data
		const baseKey = encodeBase58(d.slice(4, 36))
		const seedLen = Number(readU64le(d, 36))
		if (seedLen > 32 || d.length !== 44 + seedLen + 8 + 8 + 32) throw new SolanaVerifyError('crear-con-semilla malformado')
		const seed = ASCII_DECODE(d.slice(44, 44 + seedLen))
		const lamports = readU64le(d, 44 + seedLen)
		const space = readU64le(d, 52 + seedLen)
		const owner = encodeBase58(d.slice(60 + seedLen, 92 + seedLen))
		const stakeAccount = create.accounts[1]
		if (baseKey !== feePayer || owner !== STAKE_PROGRAM || space !== BigInt(STAKE_ACCOUNT_SPACE)) throw new SolanaVerifyError('cuenta de stake con parámetros inesperados')
		if (!seed.startsWith(STAKE_SEED_PREFIX) || createWithSeed(feePayer, seed, STAKE_PROGRAM) !== stakeAccount) throw new SolanaVerifyError('la cuenta creada no es la derivada de la semilla')

		if (init.program !== STAKE_PROGRAM || tagOf(init) !== 0 || init.data.length !== 116) throw new SolanaVerifyError('se esperaba Initialize')
		if (!same(init.accounts, [stakeAccount, SYSVAR_RENT])) throw new SolanaVerifyError('Initialize con cuentas inesperadas')
		const staker = encodeBase58(init.data.slice(4, 36))
		const withdrawer = encodeBase58(init.data.slice(36, 68))
		if (readU64le(init.data, 68) !== 0n || readU64le(init.data, 76) !== 0n || encodeBase58(init.data.slice(84, 116)) !== DEFAULT_PUBKEY) throw new SolanaVerifyError('lockup no vacío')

		if (delegate.program !== STAKE_PROGRAM || tagOf(delegate) !== 2 || delegate.data.length !== 4) throw new SolanaVerifyError('se esperaba DelegateStake')
		const vote = delegate.accounts[1]
		if (!same(delegate.accounts, [stakeAccount, vote, SYSVAR_CLOCK, SYSVAR_STAKE_HISTORY, STAKE_CONFIG, staker])) throw new SolanaVerifyError('DelegateStake con cuentas inesperadas')
		return { ...base, action: 'stake', stakeAccount, seed, lamports, staker, withdrawer, vote }
	}

	if (body.length === 1) {
		const [ix] = body
		if (ix.program !== STAKE_PROGRAM) throw new SolanaVerifyError('instrucción de sistema no permitida')
		const tag = tagOf(ix)
		if (tag === 5 && ix.data.length === 4) {
			if (ix.accounts.length !== 3 || ix.accounts[1] !== SYSVAR_CLOCK) throw new SolanaVerifyError('Deactivate con cuentas inesperadas')
			return { ...base, action: 'unstake', stakeAccount: ix.accounts[0], staker: ix.accounts[2] }
		}
		if (tag === 4 && ix.data.length === 12) {
			if (ix.accounts.length !== 5 || ix.accounts[2] !== SYSVAR_CLOCK || ix.accounts[3] !== SYSVAR_STAKE_HISTORY) throw new SolanaVerifyError('Withdraw con cuentas inesperadas')
			return { ...base, action: 'withdraw', stakeAccount: ix.accounts[0], to: ix.accounts[1], withdrawer: ix.accounts[4], lamports: readU64le(ix.data, 4) }
		}
		throw new SolanaVerifyError('instrucción de stake no permitida')
	}
	throw new SolanaVerifyError('forma de transacción de staking no reconocida')
}

/** Lo firmado dice EXACTAMENTE lo que el usuario confirmó. */
export const verifySignedSolanaStake = (signed: SignedSolanaTx, prepared: PreparedSolanaStake): void => {
	const { intent } = prepared
	const tx = verifySolanaEnvelope(signed, { messageBytes: prepared.messageBytes, feePayer: intent.owner, recentBlockhash: prepared.recentBlockhash, signer: intent.owner })
	if (tx.message.numRequiredSignatures !== 1) throw new SolanaVerifyError('la tx exige más firmas que la del usuario')
	const decoded = decodeSolanaStake(tx.message)
	if (decoded.action !== intent.action) throw new SolanaVerifyError('acción distinta')
	if (decoded.stakeAccount !== prepared.stakeAccount) throw new SolanaVerifyError('cuenta de stake distinta')
	if (intent.action === 'stake') {
		if (decoded.vote !== intent.vote) throw new SolanaVerifyError('validador distinto')
		if (decoded.staker !== intent.owner || decoded.withdrawer !== intent.owner) throw new SolanaVerifyError('las autoridades no son del usuario')
		if (decoded.lamports !== prepared.amount + prepared.rentLamports) throw new SolanaVerifyError('cantidad distinta')
		if (decoded.seed !== prepared.seed) throw new SolanaVerifyError('semilla distinta')
	} else if (intent.action === 'unstake') {
		if (decoded.staker !== intent.owner) throw new SolanaVerifyError('autoridad distinta')
	} else {
		if (decoded.to !== intent.owner || decoded.withdrawer !== intent.owner) throw new SolanaVerifyError('el retiro no vuelve a tu wallet')
		if (decoded.lamports !== prepared.amount) throw new SolanaVerifyError('cantidad distinta')
	}
	if (prepared.computeUnitPrice > MAX_PRIORITY_MICROLAMPORTS) throw new SolanaVerifyError('prioridad por encima del tope')
	if ((decoded.computeUnitPrice ?? 0n) !== prepared.computeUnitPrice) throw new SolanaVerifyError('prioridad distinta')
}

export const signSolanaStake = (prepared: PreparedSolanaStake, privateKey: Uint8Array): SignedSolanaTx => {
	const signed = signSolanaMessageAs(prepared.message, prepared.messageBytes, prepared.intent.owner, privateKey)
	verifySignedSolanaStake(signed, prepared)
	return signed
}

// ---------------------------------------------------------------------------
// Adaptador para walletStakeActions
// ---------------------------------------------------------------------------

/** Traduce la intención genérica a la de Solana, con las comprobaciones de forma. */
export const toSolanaStakeIntent = (intent: StakeIntent): SolanaStakeIntent => {
	if (intent.action === 'stake') {
		if (intent.amount === null || !intent.target) throw invalid('falta la cantidad o el validador')
		return { action: 'stake', owner: intent.from, amount: intent.amount, vote: intent.target.id }
	}
	if (intent.action === 'unstake' || intent.action === 'withdraw') {
		if (!intent.positionId) throw invalid('falta la posición')
		return { action: intent.action, owner: intent.from, stakeAccount: intent.positionId }
	}
	throw invalid(`acción ${intent.action} no existe en Solana`)
}

export const summarizeSolanaStake = (prepared: PreparedSolanaStake, intent: StakeIntent): StakeSummary => ({
	action: intent.action,
	amount: prepared.amount,
	feeEstimated: prepared.feeLamports,
	expiresAt: prepared.expiresAt,
	target: prepared.intent.action === 'stake' ? { id: prepared.intent.vote, name: intent.target?.name ?? null } : null,
	txCount: 1,
	reserve: prepared.rentLamports > 0n ? prepared.rentLamports : null,
	waitMs: prepared.waitMs,
})

export const solanaStakeAdapter: StakeTxAdapter<PreparedSolanaStake, SignedSolanaTx> = {
	async prepare(rpc, intent, { signal }) {
		const inner = await prepareSolanaStake(rpc, toSolanaStakeIntent(intent), { signal })
		return { inner, summary: summarizeSolanaStake(inner, intent) }
	},
	sign(inner, privateKey) {
		return signSolanaStake(inner, privateKey)
	},
	broadcast(rpc, _inner, signed, { signal }) {
		return broadcastSolanaTransaction(rpc, signed, { signal })
	},
	entryMinimum(rpc, { signal }) {
		return getSolanaStakeMinimum(rpc, signal)
	},
	async entryReserve(rpc, { signal }) {
		// MÁX deja la renta de la nueva stake account, el mínimo de la wallet y la tarifa
		const [stakeRent, walletRent] = await Promise.all([
			rpcCall<number>(rpc, 'getMinimumBalanceForRentExemption', [STAKE_ACCOUNT_SPACE], signal),
			getSolanaRentExemptMinimum(rpc, { signal }),
		])
		return BigInt(stakeRent) + walletRent + ENTRY_FEE_MARGIN
	},
}
