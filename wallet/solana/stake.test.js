/**
 * @jest-environment node
 *
 * Staking nativo de SOL. Tres fuentes de verdad externas, todas congeladas aquí:
 * - Instrucciones y tx firmada generadas con @solana/web3.js 1.98.4 (`StakeProgram`,
 *   `PublicKey.createWithSeed`) en un script aparte, fuera de la app.
 * - Una stake account REAL de mainnet (base64) y su `jsonParsed` del nodo (2026-09-30).
 * - Vote accounts del registry verificadas como activas con `getVoteAccounts` (ese día).
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import {
	compileMessage,
	createAccountWithSeedIx,
	createWithSeed,
	deserializeTransaction,
	encodeBase58,
	fromBase64,
	serializeMessage,
	stakeDeactivateIx,
	stakeDelegateIx,
	stakeInitializeIx,
	stakeWithdrawIx,
	systemTransferIx,
	toBase64,
	u32le,
	u64le,
	STAKE_PROGRAM,
	SYSTEM_PROGRAM,
	VOTE_PROGRAM,
} from './codec'
import { SolanaVerifyError } from './tx'
import {
	decodeSolanaStake,
	epochEndsAt,
	findFreeStakeSeed,
	parseStakeAccount,
	prepareSolanaStake,
	readSolanaStakeAccounts,
	signSolanaStake,
	solanaPositionsFrom,
	solanaStakeAdapter,
	annualizeEpochReturn,
	readSolanaTargetApys,
	slotMsFromSamples,
	getSlotMs,
	solanaApysFromSamples,
	stakeAccountFor,
	stakeStatusOf,
	toSolanaStakeIntent,
	verifySignedSolanaStake,
	MAX_STAKE_SEEDS,
	SLOT_MS,
} from './stake'
import { fetchStakingSnapshot } from '../staking/readers'
import { solanaApyFromRewards } from '../staking/apy'
import bundled from '../registry/bundled.json'

const hexBytes = (hex) => Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)))
const toHex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

// --- Vectores de web3.js 1.98.4 --------------------------------------------------------
const USER_SECRET = hexBytes('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20')
const USER = '9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj'
const HELIUS = 'he1iusunGwqrNtafDtLdhsUQDFvo13z9sUa36PauBtk'
const STAKE0 = 'WQM8SNoW6Hm7N4JzgAcyega5EFtWwRnozbcR9tyiWNr'
const STAKE7 = '899RyE1dR9E9zDrY1ptGaeUakv3QWVa84ambDdveFRtN'
const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k'
const WEB3 = {
	createWithSeed: {
		keys: [[USER, true, true], [STAKE0, false, true]],
		data: '0300000079b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad0496640a0000000000000071702d7374616b652d30c036b43b00000000c80000000000000006a1d8179137542a983437bdfe2a7ab2557f535c8a78722b68a49dc000000000',
	},
	initialize: {
		keys: [[STAKE0, false, true], ['SysvarRent111111111111111111111111111111111', false, false]],
		data: '0000000079b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad04966479b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
	},
	delegate: {
		keys: [[STAKE0, false, true], [HELIUS, false, false], ['SysvarC1ock11111111111111111111111111111111', false, false], ['SysvarStakeHistory1111111111111111111111111', false, false], ['StakeConfig11111111111111111111111111111111', false, false], [USER, true, false]],
		data: '02000000',
	},
	deactivate: {
		keys: [[STAKE0, false, true], ['SysvarC1ock11111111111111111111111111111111', false, false], [USER, true, false]],
		data: '05000000',
	},
	withdraw: {
		keys: [[STAKE0, false, true], [USER, false, true], ['SysvarC1ock11111111111111111111111111111111', false, false], ['SysvarStakeHistory1111111111111111111111111', false, false], [USER, true, false]],
		data: '04000000d202964900000000',
	},
}
const WEB3_STAKE_TX = 'Ad2bCqTFVQ8PMykdAVBYRBUByTRIOF3Cd16UuXADBc2oEntfYrVmU38epwSf+v2vggeaZv5vv1b2AedHJKGPewMBAAcJebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQHiD32lJaTSm4OLpPIhwfoolSlTS7E+B5yq0YRfI0FzwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACmkVHaaM3ZkYGn/bssPbUnPLqvzkDSaQKDEI47ZhFVEGodgXkTdUKpg0N73+KnqyVX9TXIp4citopJ3AAAAAAAah2BelAgULaAeR5s5tuI4eW3FQ9h/GeQpOtNEAAAAABqfVFxjHdMkoVmOYaR1etoteuKObS21cc1VbIQAAAAAGp9UXGSxcUSGMyUw9SvF/WNruCJuh/UTj29mKAAAAAAan1RcZNYTQ/u2bs0MdEyBr5UQoG1e4VmzFN1/0AAAAxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusDAgIAAWYDAAAAebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQKAAAAAAAAAHFwLXN0YWtlLTDANrQ7AAAAAMgAAAAAAAAABqHYF5E3VCqYNDe9/ip6slV/U1yKeHIraKSdwAAAAAAEAgEHdAAAAAB5tVYuj+ZU+UB4sRLoqYunkB+FOuaVvtfg45ELrQSWZHm1Vi6P5lT5QHixEuipi6eQH4U65pW+1+DjkQutBJZkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAYBAwYIBQAEAgAAAA=='

// --- Stake account REAL de mainnet (D9oS…qCbE) y su jsonParsed --------------------------
const MAINNET_STAKE_B64 = 'AgAAAIDVIgAAAAAAUeLOpIidOn+P5CE01YI9fcxOSS+/rEGZUv14Q3lLyZlR4s6kiJ06f4/kITTVgj19zE5JL7+sQZlS/XhDeUvJmQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFIT0Rz3MY13+nJDD3VdTBfL1ajn9VrNpKTGteUKqvHyTl2hOwAAAAASBAAAAAAAAP//////////AAAAAAAAAADO2AMBAAAAAAAAAAA='

const dumpIx = (ix) => ({ keys: ix.keys.map(k => [k.pubkey, k.isSigner, k.isWritable]), data: toHex(ix.data) })

/** StakeStateV2 sintético (mismo layout que el real) para simular el nodo. */
const stakeData = ({ state = 2, staker = USER, withdrawer = USER, voter = HELIUS, stake = 1_000_000_000n, activation = 100n, deactivation = 0xffffffffffffffffn, lockupUnix = 0n } = {}) => {
	const out = new Uint8Array(200)
	out.set(u32le(state), 0)
	out.set(u64le(2_282_880n), 4)
	out.set(fromB58(staker), 12)
	out.set(fromB58(withdrawer), 44)
	out.set(u64le(lockupUnix), 76)
	if (state === 2) {
		out.set(fromB58(voter), 124)
		out.set(u64le(stake), 156)
		out.set(u64le(activation), 164)
		out.set(u64le(deactivation), 172)
	}
	return out
}
const fromB58 = (address) => {
	// El codec expone pubkeyBytes vía createWithSeed/serialize; aquí basta con un decode directo
	const { base58 } = require('@scure/base')
	return base58.decode(address)
}

const RPC = { url: 'https://sol', priority: 10, owner: 'x' }
const EPOCH = { epoch: 101, slotIndex: 200_000, slotsInEpoch: 432_000 }

let calls
const mockRpc = (overrides = {}) => {
	calls = []
	const handlers = {
		getLatestBlockhash: () => ({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1 } }),
		getRecentPrioritizationFees: () => [{ prioritizationFee: 0 }],
		getEpochInfo: () => EPOCH,
		getAccountInfo: ([address]) => {
			if (address === HELIUS) return { value: { owner: VOTE_PROGRAM, lamports: 1, data: ['', 'base64'] } }
			return { value: null }
		},
		getMinimumBalanceForRentExemption: ([space]) => (space === 200 ? 2_282_880 : 890_880),
		getStakeMinimumDelegation: () => ({ value: 1 }),
		getBalance: () => ({ value: 5_000_000_000 }),
		getMultipleAccounts: ([addresses]) => ({ value: addresses.map(() => null) }),
		getProgramAccounts: () => [],
		getInflationReward: ([addresses]) => addresses.map(() => null),
		...overrides,
	}
	global.fetch = jest.fn(async (_url, init) => {
		const { method, params } = JSON.parse(init.body)
		calls.push({ method, params })
		const handler = handlers[method]
		if (!handler) throw new Error(`método inesperado ${method}`)
		const result = handler(params)
		if (result && result.__error) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: result.__error }) }
		return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) }
	})
}
afterEach(() => { delete global.fetch })

describe('codec del Stake program contra web3.js', () => {

	test('createWithSeed = PublicKey.createWithSeed', () => {
		expect(createWithSeed(USER, 'qp-stake-0', STAKE_PROGRAM)).toBe(STAKE0)
		expect(stakeAccountFor(USER, 0)).toBe(STAKE0)
		expect(stakeAccountFor(USER, 7)).toBe(STAKE7)
		expect(() => createWithSeed(USER, 'x'.repeat(33), STAKE_PROGRAM)).toThrow()
	})

	test('las cinco instrucciones, byte a byte y cuenta a cuenta', () => {
		expect(dumpIx(createAccountWithSeedIx({ from: USER, newAccount: STAKE0, base: USER, seed: 'qp-stake-0', lamports: 1_001_666_240n, space: 200, owner: STAKE_PROGRAM }))).toEqual(WEB3.createWithSeed)
		expect(dumpIx(stakeInitializeIx(STAKE0, USER, USER))).toEqual(WEB3.initialize)
		expect(dumpIx(stakeDelegateIx(STAKE0, HELIUS, USER))).toEqual(WEB3.delegate)
		expect(dumpIx(stakeDeactivateIx(STAKE0, USER))).toEqual(WEB3.deactivate)
		expect(dumpIx(stakeWithdrawIx(STAKE0, USER, USER, 1_234_567_890n))).toEqual(WEB3.withdraw)
	})

	test('la tx firmada por web3.js se decodifica como un stake y su firma es válida', () => {
		const tx = deserializeTransaction(fromBase64(WEB3_STAKE_TX))
		expect(ed25519.verify(tx.signatures[0], tx.messageBytes, fromB58(USER))).toBe(true)
		expect(decodeSolanaStake(tx.message)).toMatchObject({
			action: 'stake', feePayer: USER, stakeAccount: STAKE0, seed: 'qp-stake-0',
			lamports: 1_001_666_240n, staker: USER, withdrawer: USER, vote: HELIUS,
		})
	})
})

describe('StakeStateV2', () => {

	test('una stake account REAL de mainnet coincide con el jsonParsed del nodo', () => {
		expect(parseStakeAccount(fromBase64(MAINNET_STAKE_B64))).toEqual({
			state: 'delegated',
			rentExemptReserve: 2_282_880n,
			staker: '6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2',
			withdrawer: '6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2',
			lockupUnixTimestamp: 0n,
			lockupEpoch: 0n,
			custodian: SYSTEM_PROGRAM,
			voter: '6XPxXV2VZMNqSquPUF3bjnGt5u8R884A9UVYS6jv8g5f',
			delegatedStake: 1_000_430_926n,
			activationEpoch: 1042n,
			deactivationEpoch: null,
		})
	})

	test('estado por epoch: activándose, rindiendo, saliendo, retirable', () => {
		const at = (over) => parseStakeAccount(stakeData(over))
		expect(stakeStatusOf(at({ activation: 101n }), 101n)).toBe('activating')
		expect(stakeStatusOf(at({ activation: 100n }), 101n)).toBe('active')
		expect(stakeStatusOf(at({ activation: 90n, deactivation: 101n }), 101n)).toBe('cooling')
		expect(stakeStatusOf(at({ activation: 90n, deactivation: 100n }), 101n)).toBe('withdrawable')
		// Desactivada en su misma epoch de activación: nunca rindió, sale ya
		expect(stakeStatusOf(at({ activation: 101n, deactivation: 101n }), 101n)).toBe('withdrawable')
		expect(stakeStatusOf(at({ state: 1 }), 101n)).toBe('withdrawable')
		expect(parseStakeAccount(new Uint8Array(200))).toBeNull()
	})

	test('fin de epoch estimado por slots restantes', () => {
		expect(epochEndsAt({ epoch: 1n, slotIndex: 431_000, slotsInEpoch: 432_000 }, 5)).toBe(5 + 1_000 * SLOT_MS)
	})
})

describe('lectura de posiciones', () => {

	const raw = (data, lamports = 1_002_282_880) => ({ owner: STAKE_PROGRAM, lamports, data: [toBase64(data), 'base64'] })

	test('por getProgramAccounts filtrando por WITHDRAWER (offset 44)', async () => {
		mockRpc({ getProgramAccounts: () => [{ pubkey: STAKE7, account: raw(stakeData()) }] })
		const accounts = await readSolanaStakeAccounts(RPC, USER)
		expect(accounts.map(a => a.address)).toEqual([STAKE7])
		expect(calls[0].params[1].filters).toEqual([{ dataSize: 200 }, { memcmp: { offset: 44, bytes: USER } }])
	})

	test('si el nodo bloquea getProgramAccounts, cae a las cuentas de semilla QvaPay', async () => {
		mockRpc({
			getProgramAccounts: () => ({ __error: { code: -32010, message: 'excluded from account secondary indexes' } }),
			getMultipleAccounts: ([addresses]) => ({ value: addresses.map((a, i) => (i === 2 ? raw(stakeData()) : i === 3 ? raw(stakeData({ withdrawer: HELIUS })) : null)) }),
		})
		const accounts = await readSolanaStakeAccounts(RPC, USER)
		// La de otro withdrawer no es del usuario aunque la semilla coincida
		expect(accounts.map(a => a.address)).toEqual([stakeAccountFor(USER, 2)])
	})

	test('posiciones con nombre del validador y cuenta atrás a fin de epoch', () => {
		const accounts = [
			{ address: STAKE0, lamports: 5n, parsed: parseStakeAccount(stakeData({ activation: 101n })) },
			{ address: STAKE7, lamports: 9n, parsed: parseStakeAccount(stakeData({ activation: 50n })) },
		]
		const info = { epoch: 101n, slotIndex: 400_000, slotsInEpoch: 432_000 }
		const positions = solanaPositionsFrom(accounts, info, 1_000, { [HELIUS]: 'Helius' })
		expect(positions[0]).toMatchObject({ id: STAKE0, status: 'activating', amount: 5n, unlockAt: 1_000 + 32_000 * SLOT_MS, target: { id: HELIUS, name: 'Helius' } })
		expect(positions[1]).toMatchObject({ id: STAKE7, status: 'active', unlockAt: null })
	})

	test('la foto de Solana trae posiciones y el APY REAL de la última epoch', async () => {
		mockRpc({
			getProgramAccounts: () => [{ pubkey: STAKE0, account: raw(stakeData({ activation: 50n }), 1_000_000_000) }],
			getInflationReward: () => [{ amount: 300_000, postBalance: 1_000_300_000, epoch: 100 }],
		})
		const router = { call: (chainKey, fn) => fn(RPC, undefined) }
		const snap = await fetchStakingSnapshot(router, bundled, 'solana', USER, () => 7, { [HELIUS]: 'Helius' })
		expect(snap.positions).toHaveLength(1)
		expect(snap.positions[0].target.name).toBe('Helius')
		expect(snap.apy).toBeCloseTo(solanaApyFromRewards([{ amount: 300_000n, postBalance: 1_000_300_000n }], 432_000 * SLOT_MS), 12)
		expect(calls.find(c => c.method === 'getInflationReward').params[1]).toEqual({ epoch: 100 })
	})

	test('APY por recompensas: 0,03 % por epoch de ~2 días ≈ 5,6 % al año', () => {
		const apy = solanaApyFromRewards([{ amount: 300_000n, postBalance: 1_000_300_000n }], 2 * 24 * 3600_000)
		expect(apy).toBeGreaterThan(0.05)
		expect(apy).toBeLessThan(0.06)
		expect(solanaApyFromRewards([])).toBeNull()
	})
})

describe('construir, firmar y verificar', () => {

	test('stake: crea la cuenta en la primera semilla libre, delega y firma UNA vez', async () => {
		mockRpc({ getMultipleAccounts: ([addresses]) => ({ value: addresses.map((_, i) => (i < 2 ? { owner: STAKE_PROGRAM, lamports: 1, data: ['', 'base64'] } : null)) }) })
		const prepared = await prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 1_000_000_000n, vote: HELIUS }, { now: () => 0 })
		expect(prepared).toMatchObject({ stakeAccount: stakeAccountFor(USER, 2), seed: 'qp-stake-2', amount: 1_000_000_000n, rentLamports: 2_282_880n, feeLamports: 5000n })
		expect(prepared.message.numRequiredSignatures).toBe(1)
		expect(prepared.waitMs).toBe((432_000 - 200_000) * SLOT_MS)
		const signed = signSolanaStake(prepared, USER_SECRET)
		const decoded = decodeSolanaStake(deserializeTransaction(fromBase64(signed.base64)).message)
		expect(decoded).toMatchObject({ action: 'stake', vote: HELIUS, lamports: 1_002_282_880n, staker: USER, withdrawer: USER })
	})

	test('stake con prioridad: compute budget delante, dentro de la whitelist', async () => {
		mockRpc({ getRecentPrioritizationFees: () => [{ prioritizationFee: 4000 }] })
		const prepared = await prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 1_000_000_000n, vote: HELIUS })
		expect(prepared.computeUnitPrice).toBe(4000n)
		expect(prepared.feeLamports).toBe(5000n + 120n)
		expect(() => signSolanaStake(prepared, USER_SECRET)).not.toThrow()
	})

	test('stake: rechaza un validador que no es vote account, el mínimo y la regla de renta', async () => {
		mockRpc()
		await expect(prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 1_000_000_000n, vote: STAKE7 })).rejects.toThrow('vote account')
		mockRpc({ getStakeMinimumDelegation: () => ({ value: 1_000_000_000 }) })
		await expect(prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 999_999_999n, vote: HELIUS })).rejects.toThrow('mínimo')
		// Dejaría 100.000 lamports en la wallet: por debajo de su mínimo de renta (890.880)
		mockRpc()
		await expect(prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 5_000_000_000n - 2_282_880n - 5_000n - 100_000n, vote: HELIUS })).rejects.toThrow('seguir existiendo')
		// Dejarla EXACTAMENTE a cero sí vale (la cuenta se cierra)
		mockRpc()
		await expect(prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 5_000_000_000n - 2_282_880n - 5_000n, vote: HELIUS })).resolves.toBeDefined()
		mockRpc()
		await expect(prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 5_000_000_000n, vote: HELIUS })).rejects.toThrow('insuficiente')
	})

	test('sin semillas libres no abre más posiciones', async () => {
		mockRpc({ getMultipleAccounts: ([addresses]) => ({ value: addresses.map(() => ({ owner: STAKE_PROGRAM, lamports: 1, data: ['', 'base64'] })) }) })
		await expect(findFreeStakeSeed(RPC, USER)).rejects.toThrow(String(MAX_STAKE_SEEDS))
	})

	test('unstake: desactiva la cuenta ENTERA, solo si rinde y el usuario es su staker', async () => {
		const account = (data) => ({ getAccountInfo: ([address]) => (address === STAKE0 ? { value: { owner: STAKE_PROGRAM, lamports: 1_002_282_880, data: [toBase64(data), 'base64'] } } : { value: null }) })
		mockRpc(account(stakeData({ activation: 50n })))
		const prepared = await prepareSolanaStake(RPC, { action: 'unstake', owner: USER, stakeAccount: STAKE0 })
		expect(prepared.amount).toBe(1_002_282_880n)
		expect(decodeSolanaStake(deserializeTransaction(fromBase64(signSolanaStake(prepared, USER_SECRET).base64)).message)).toMatchObject({ action: 'unstake', stakeAccount: STAKE0, staker: USER })
		mockRpc(account(stakeData({ staker: HELIUS })))
		await expect(prepareSolanaStake(RPC, { action: 'unstake', owner: USER, stakeAccount: STAKE0 })).rejects.toThrow('staker')
		mockRpc(account(stakeData({ deactivation: 100n })))
		await expect(prepareSolanaStake(RPC, { action: 'unstake', owner: USER, stakeAccount: STAKE0 })).rejects.toThrow('no está rindiendo')
	})

	test('withdraw: todo el saldo de vuelta a la wallet, solo cuando ya es retirable', async () => {
		const account = (data) => ({ getAccountInfo: () => ({ value: { owner: STAKE_PROGRAM, lamports: 1_002_282_880, data: [toBase64(data), 'base64'] } }) })
		mockRpc(account(stakeData({ activation: 50n, deactivation: 99n })))
		const prepared = await prepareSolanaStake(RPC, { action: 'withdraw', owner: USER, stakeAccount: STAKE0 })
		expect(prepared).toMatchObject({ amount: 1_002_282_880n, waitMs: null })
		expect(decodeSolanaStake(deserializeTransaction(fromBase64(signSolanaStake(prepared, USER_SECRET).base64)).message)).toMatchObject({ action: 'withdraw', to: USER, withdrawer: USER, lamports: 1_002_282_880n })
		mockRpc(account(stakeData({ activation: 50n })))
		await expect(prepareSolanaStake(RPC, { action: 'withdraw', owner: USER, stakeAccount: STAKE0 })).rejects.toThrow('aún no se puede retirar')
		mockRpc(account(stakeData({ activation: 50n, deactivation: 99n, lockupUnix: 99n })))
		await expect(prepareSolanaStake(RPC, { action: 'withdraw', owner: USER, stakeAccount: STAKE0 })).rejects.toThrow('lockup')
	})
})

describe('la verificación rechaza cualquier desviación', () => {

	const prepare = async () => {
		mockRpc()
		return prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 1_000_000_000n, vote: HELIUS })
	}
	/** Recompila el mensaje con otras instrucciones y lo firma, como haría un nodo malicioso. */
	const forge = (prepared, instructions) => {
		const message = compileMessage(USER, instructions, BLOCKHASH)
		return { ...prepared, message, messageBytes: serializeMessage(message) }
	}
	const standard = (over = {}) => {
		const seed = over.seed ?? 'qp-stake-0'
		const stake = createWithSeed(USER, seed, STAKE_PROGRAM)
		return [
			createAccountWithSeedIx({ from: USER, newAccount: stake, base: USER, seed, lamports: over.lamports ?? 1_002_282_880n, space: 200, owner: STAKE_PROGRAM }),
			stakeInitializeIx(stake, over.staker ?? USER, over.withdrawer ?? USER),
			stakeDelegateIx(stake, over.vote ?? HELIUS, over.staker ?? USER),
		]
	}

	test('validador cambiado tras confirmar', async () => {
		const prepared = await prepare()
		expect(() => signSolanaStake({ ...prepared, intent: { ...prepared.intent, vote: STAKE7 } }, USER_SECRET)).toThrow(SolanaVerifyError)
	})

	test('withdrawer ajeno (el nodo intenta quedarse con la autoridad de retiro)', async () => {
		const prepared = await prepare()
		expect(() => signSolanaStake(forge(prepared, standard({ withdrawer: HELIUS })), USER_SECRET)).toThrow('autoridades')
	})

	test('más lamports de los confirmados', async () => {
		const prepared = await prepare()
		expect(() => signSolanaStake(forge(prepared, standard({ lamports: 9_002_282_880n })), USER_SECRET)).toThrow('cantidad')
	})

	test('instrucción extra colada (una transferencia a otro)', async () => {
		const prepared = await prepare()
		expect(() => signSolanaStake(forge(prepared, [...standard(), systemTransferIx(USER, HELIUS, 1n)]), USER_SECRET)).toThrow(SolanaVerifyError)
	})

	test('semilla fuera del prefijo de QvaPay', async () => {
		const prepared = await prepare()
		expect(() => signSolanaStake(forge(prepared, standard({ seed: 'otra-0' })), USER_SECRET)).toThrow('semilla')
	})

	test('lockup no vacío', async () => {
		const prepared = await prepare()
		const ixs = standard()
		ixs[1] = { ...ixs[1], data: Uint8Array.from(ixs[1].data) }
		ixs[1].data[68] = 1
		expect(() => signSolanaStake(forge(prepared, ixs), USER_SECRET)).toThrow('lockup')
	})

	test('firma de otra clave o sobre ajeno', async () => {
		const prepared = await prepare()
		expect(() => signSolanaStake(prepared, hexBytes('02'.repeat(32)))).toThrow('clave')
		const signed = signSolanaStake(prepared, USER_SECRET)
		expect(() => verifySignedSolanaStake(signed, { ...prepared, recentBlockhash: STAKE7 })).toThrow('blockhash')
	})
})

describe('adaptador', () => {

	test('traduce la intención genérica y resume lo verificado', async () => {
		expect(toSolanaStakeIntent({ action: 'stake', from: USER, amount: 5n, target: { id: HELIUS, name: 'Helius' } })).toEqual({ action: 'stake', owner: USER, amount: 5n, vote: HELIUS })
		expect(toSolanaStakeIntent({ action: 'withdraw', from: USER, amount: null, target: null, positionId: STAKE0 })).toEqual({ action: 'withdraw', owner: USER, stakeAccount: STAKE0 })
		expect(() => toSolanaStakeIntent({ action: 'unstake', from: USER, amount: null, target: null })).toThrow('posición')
		expect(() => toSolanaStakeIntent({ action: 'claim', from: USER, amount: null, target: null })).toThrow()

		mockRpc()
		const { summary } = await solanaStakeAdapter.prepare(RPC, { chainKey: 'solana', kind: 'solana', action: 'stake', from: USER, amount: 1_000_000_000n, target: { id: HELIUS, name: 'Helius' } }, {})
		expect(summary).toMatchObject({ action: 'stake', amount: 1_000_000_000n, feeEstimated: 5000n, target: { id: HELIUS, name: 'Helius' }, txCount: 1, reserve: 2_282_880n })
	})

	test('mínimo de la red para entrar: lo que dice el nodo (hoy 1 SOL); sin respuesta, 1 lamport', async () => {
		mockRpc({ getStakeMinimumDelegation: () => ({ value: 1_000_000_000 }) })
		await expect(solanaStakeAdapter.entryMinimum(RPC, {})).resolves.toBe(1_000_000_000n)
		mockRpc({ getStakeMinimumDelegation: () => ({ __error: { code: -32000, message: 'busy' } }) })
		await expect(solanaStakeAdapter.entryMinimum(RPC, {})).resolves.toBe(1n)
		// Y si aun así llega a preparar por debajo, el aviso habla en SOL, no en lamports
		mockRpc({ getStakeMinimumDelegation: () => ({ value: 1_000_000_000 }) })
		await expect(prepareSolanaStake(RPC, { action: 'stake', owner: USER, amount: 200_000_000n, vote: HELIUS })).rejects.toThrow('1 SOL')
	})

	test('MÁX deja renta de la stake account + mínimo de la wallet + margen', async () => {
		mockRpc()
		await expect(solanaStakeAdapter.entryReserve(RPC, {})).resolves.toBe(2_282_880n + 890_880n + 50_000n)
	})

	test('la firma del adaptador es de verdad ed25519 del usuario', async () => {
		mockRpc()
		const { inner } = await solanaStakeAdapter.prepare(RPC, { chainKey: 'solana', kind: 'solana', action: 'stake', from: USER, amount: 1_000_000_000n, target: { id: HELIUS, name: null } }, {})
		const signed = solanaStakeAdapter.sign(inner, USER_SECRET)
		expect(signed.txid).toBe(signed.signature)
		expect(ed25519.verify(fromB58(signed.signature), inner.messageBytes, fromB58(USER))).toBe(true)
		expect(encodeBase58(fromB58(USER))).toBe(USER)
	})
})

describe('APY por validador: MEDIDO con recompensas reales (selector)', () => {

	// Mediciones de mainnet del 2026-09-30: la epoch 1045 duró 32,12 h (slots de ~268 ms) y
	// las stake accounts de Anagram/Alchemy/Staking Facilities cobraron 0,0178 % en ella.
	// stakewiz daba ese día 4,96–5,04 % de "staking APY" para los mismos validadores.
	const EPOCH_MS = 32.12 * 3600_000
	const ANAGRAM = '4AUED4uj6nSTuANzaAUnGBPJQRmhpDYDwoWJNkoUUBBW'
	const [S1, S2, S3] = ['8sXA784mj58fC94GVroXmCuhkbqCKHPT14AbuTfsn64', 'AFirSjfN6nzWKZZy85HqWncqc4XtJnbenzyJJmce493A', 'DoS2kNXo8owRwGmXz9JGmCXtpND7zN14Md8sUuxbjLnN']

	test('duración del slot a partir de las muestras de rendimiento', () => {
		expect(slotMsFromSamples([{ numSlots: 224, samplePeriodSecs: 60 }, { numSlots: 223, samplePeriodSecs: 60 }])).toBeCloseTo(268.5, 0)
		expect(slotMsFromSamples([])).toBeNull()
		// Muestras imposibles (slot de 10 s) no se creen
		expect(slotMsFromSamples([{ numSlots: 6, samplePeriodSecs: 60 }])).toBeNull()
		expect(epochEndsAt({ epoch: 1n, slotIndex: 0, slotsInEpoch: 432_000 }, 0, 268)).toBe(432_000 * 268)
	})

	test('un nodo que no ofrece getRecentPerformanceSamples hace rotar; un fallo cualquiera usa el respaldo', async () => {
		mockRpc({ getRecentPerformanceSamples: () => ({ __error: { code: -32601, message: 'Method not found' } }) })
		await expect(getSlotMs(RPC)).rejects.toThrow('Method not found')
		mockRpc({ getRecentPerformanceSamples: () => ({ __error: { code: -32000, message: 'busy' } }) })
		await expect(getSlotMs(RPC)).resolves.toBe(SLOT_MS)
	})

	test('0,0178 % por epoch de 32 h ≈ 4,98 % al año (lo que la red pagó de verdad)', () => {
		const apy = annualizeEpochReturn(0.000178, EPOCH_MS)
		expect(apy).toBeGreaterThan(0.049)
		expect(apy).toBeLessThan(0.0505)
		// Con la epoch "de manual" de 48 h saldría ~3,3 %: el error que había que evitar
		expect(annualizeEpochReturn(0.000178, 48 * 3600_000)).toBeLessThan(0.034)
	})

	test('solo cuentan las muestras que SIGUEN delegadas a ese validador y cobraron', () => {
		const rewards = {
			[S1]: { amount: 50_181_100_000n, postBalance: 281_188_000_000_000n },
			[S2]: { amount: 40_875_500_000n, postBalance: 230_518_000_000_000n },
			[S3]: { amount: 999_000_000_000n, postBalance: 1_000_000_000_000n },
		}
		const apys = solanaApysFromSamples([{ id: ANAGRAM, samples: [S1, S2, S3] }, { id: 'SIN', samples: [] }], { [S1]: ANAGRAM, [S2]: ANAGRAM, [S3]: STAKE7 }, rewards, EPOCH_MS)
		// S3 ya está delegada a otro: su rendimiento absurdo no contamina la cifra
		expect(apys[ANAGRAM]).toBeGreaterThan(0.049)
		expect(apys[ANAGRAM]).toBeLessThan(0.0505)
		expect(apys.SIN).toBeNull()
	})

	test('lee epoch, slot, votante de cada muestra (solo 32 bytes) y la recompensa de la epoch anterior', async () => {
		const voterB64 = toBase64(fromB58(ANAGRAM))
		mockRpc({
			getRecentPerformanceSamples: () => Array.from({ length: 10 }, () => ({ numSlots: 224, samplePeriodSecs: 60 })),
			getMultipleAccounts: ([addresses]) => ({ value: addresses.map(() => ({ owner: STAKE_PROGRAM, lamports: 1, data: [voterB64, 'base64'] })) }),
			getInflationReward: ([addresses]) => addresses.map(() => ({ amount: 178_000, postBalance: 1_000_178_000 })),
		})
		const apys = await readSolanaTargetApys(RPC, [{ id: ANAGRAM, samples: [S1, S2, S3] }])
		expect(apys[ANAGRAM]).toBeGreaterThan(0.049)
		expect(apys[ANAGRAM]).toBeLessThan(0.0505)
		const multi = calls.find(c => c.method === 'getMultipleAccounts')
		expect(multi.params[1].dataSlice).toEqual({ offset: 124, length: 32 })
		expect(calls.find(c => c.method === 'getInflationReward').params[1]).toEqual({ epoch: 100 })
		// Nada de getVoteAccounts (~300 KB): el APY ya no sale de la foto de toda la red
		expect(calls.some(c => c.method === 'getVoteAccounts')).toBe(false)
	})
})
