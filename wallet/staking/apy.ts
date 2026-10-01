/**
 * Estimadores de rendimiento a partir de datos ON-CHAIN. PURO.
 *
 * Regla de producto: un APY es SIEMPRE una estimación variable ("≈ 6,8 %"),
 * nunca una promesa. Estas funciones devuelven null cuando los datos no
 * permiten una cifra creíble, y la UI entonces no muestra ninguna.
 */

/** Por encima de esto un cálculo está roto (dato del nodo mal leído), no es rendimiento real. */
const MAX_PLAUSIBLE_APY = 0.5

const clampCommission = (commission: number): number => Math.min(1, Math.max(0, commission))

export const isPlausibleApy = (apy: number | null | undefined): apy is number =>
	typeof apy === 'number' && Number.isFinite(apy) && apy > 0 && apy < MAX_PLAUSIBLE_APY

/** Interés compuesto: tasa nominal anual con `periodsPerYear` capitalizaciones → efectiva anual. */
export const compound = (apr: number, periodsPerYear: number): number =>
	periodsPerYear > 0 ? (1 + apr / periodsPerYear) ** periodsPerYear - 1 : apr

const guard = (apy: number): number | null => (isPlausibleApy(apy) ? apy : null)

/**
 * Solana: la inflación destinada a validadores (`getInflationRate().validator`,
 * fracción del supply total) se reparte entre lo stakeado. Rendimiento del
 * delegador = inflación / ratio stakeado × (1 − comisión), capitalizado por
 * epoch porque las recompensas se suman solas a la stake account.
 */
export const solanaStakingApy = ({ validatorInflation, stakedRatio, commission, performance = 1, epochMs = 2 * 24 * 3600_000 }: {
	validatorInflation: number
	/** Stake activo / supply total, en (0, 1]. */
	stakedRatio: number
	/** Comisión del validador en [0, 1] (la vote account la da en %: dividir entre 100). */
	commission: number
	/**
	 * Créditos de voto del validador en la última epoch / los del mejor, en [0, 1]: un
	 * validador que vota tarde o se cae gana menos, y su delegador con él.
	 */
	performance?: number
	/** Duración media de una epoch (~2 días). */
	epochMs?: number
}): number | null => {
	if (!(validatorInflation > 0) || !(stakedRatio > 0) || stakedRatio > 1) return null
	const apr = (validatorInflation / stakedRatio) * (1 - clampCommission(commission)) * Math.min(1, Math.max(0, performance))
	return guard(compound(apr, (365.25 * 24 * 3600_000) / epochMs))
}

/**
 * Solana, rendimiento REAL del usuario: recompensa de la última epoch sobre el saldo
 * previo de sus cuentas, capitalizado por epoch. Mejor que la estimación teórica: ya
 * incluye la comisión y el rendimiento efectivo de SU validador.
 */
export const solanaApyFromRewards = (rewards: Array<{ amount: bigint, postBalance: bigint }>, epochMs = 2 * 24 * 3600_000): number | null => {
	const earned = rewards.reduce((sum, r) => sum + r.amount, 0n)
	const before = rewards.reduce((sum, r) => sum + (r.postBalance - r.amount), 0n)
	if (earned <= 0n || before <= 0n) return null
	const perEpoch = Number(earned) / Number(before)
	return guard((1 + perEpoch) ** ((365.25 * 24 * 3600_000) / epochMs) - 1)
}

/** Bloques TRON por año (uno cada 3 s). */
export const TRON_BLOCKS_PER_YEAR = 365 * 24 * 1200

/** SR que producen bloques (los 27 con más votos). */
export const TRON_ACTIVE_SRS = 27

/**
 * TRON. Los votantes cobran DOS recompensas, y el SR se queda `brokerage` de ambas:
 *
 * 1. Voto: cada bloque reparte `payPerBlockSun` (`getWitness127PayPerBlock`, 128 TRX) entre
 *    los 127 SR con más votos, según sus votos → por voto es igual en todos.
 * 2. Producción: los 27 primeros producen los bloques por turnos y cada bloque paga
 *    `witnessPayPerBlockSun` (`getWitnessPayPerBlock`, 8 TRX) a quien lo produce, que
 *    también lo reparte → por voto depende de los votos de ESE SR.
 *
 * Olvidar la 2 infravaloraba el APY de los SR del top 27: 2,93 % calculado frente a
 * 3,24 % COBRADO de verdad por un votante de P2P.org (143.000 votos fijos durante 121
 * días, jun–sep 2026). Con ella sale 3,28 %. Sin capitalización: se cobra a mano.
 */
export const tronVoteApr = ({ payPerBlockSun, totalVotes, brokerage, blocksPerYear = TRON_BLOCKS_PER_YEAR, producer = null }: {
	payPerBlockSun: bigint | number
	/** Votos totales de los 127 SR que reparten (en TRX). */
	totalVotes: bigint | number
	/** Parte que se queda el SR en [0, 1] (`/wallet/getBrokerage` da un %: dividir entre 100). */
	brokerage: number
	blocksPerYear?: number
	/** Solo si el SR está en el top 27 (produce bloques): su recompensa por bloque y sus votos. */
	producer?: { witnessPayPerBlockSun: bigint | number, srVotes: bigint | number, producers?: number } | null
}): number | null => {
	const pay = Number(payPerBlockSun) / 1_000_000
	const votes = Number(totalVotes)
	if (!(pay > 0) || !(votes > 0)) return null
	let perVote = (pay * blocksPerYear) / votes
	if (producer) {
		const blockPay = Number(producer.witnessPayPerBlockSun) / 1_000_000
		const srVotes = Number(producer.srVotes)
		const producers = producer.producers ?? TRON_ACTIVE_SRS
		if (blockPay > 0 && srVotes > 0) perVote += (blockPay * blocksPerYear) / producers / srVotes
	}
	return guard(perVote * (1 - clampCommission(brokerage)))
}

/** Ciclos PoX por año (2.100 bloques de Bitcoin ≈ 14,6 días). */
export const STACKS_CYCLES_PER_YEAR = 365.25 / 14.58

/**
 * Stacks: los pools publican lo que pagó el último ciclo en relación a lo
 * bloqueado (en la moneda del pago, ya convertida a valor de STX). Se anualiza
 * con capitalización solo si el pool re-bloquea las recompensas.
 */
export const stacksCycleApy = ({ cycleReturn, compounding = false, cyclesPerYear = STACKS_CYCLES_PER_YEAR }: {
	/** Rendimiento de UN ciclo como fracción (0.004 = 0,4 %). */
	cycleReturn: number
	compounding?: boolean
	cyclesPerYear?: number
}): number | null => {
	if (!(cycleReturn > 0)) return null
	return guard(compounding ? (1 + cycleReturn) ** cyclesPerYear - 1 : cycleReturn * cyclesPerYear)
}

/** Simulador: lo que rendiría `amount` a un APY dado durante `days`. Solo ilustrativo. */
export const projectEarnings = (amount: number, apy: number, days: number): number => {
	if (!(amount > 0) || !isPlausibleApy(apy) || !(days > 0)) return 0
	return amount * ((1 + apy) ** (days / 365) - 1)
}
