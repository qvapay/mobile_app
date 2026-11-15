/**
 * @jest-environment node
 *
 * Stake 2.0 de TRON. Fuentes de verdad congeladas aquí (mainnet, 2026-09-30):
 * - Cinco tx REALES (bloques ~86.705.000) de FreezeBalanceV2, UnfreezeBalanceV2,
 *   WithdrawExpireUnfreeze, VoteWitness y WithdrawBalance, con su txID.
 * - Cuentas reales vía `getaccount` (votos repartidos, energía delegada, descongelado).
 * - SR del registry: en `listwitnesses` (top 30) y con brokerage 5 % según publicnode.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import bs58 from 'bs58'

import { deriveAddresses, derivePrivateKey } from '../derive'
import { mnemonicToSeed } from '../seed'
import { parseTronAccount, tronCommittedSun, tronPowerSun, tronToHex20, tronVotesUsed } from '../chains/tron'
import { bytesToHex, concatBytes, encodeBytesField, encodeVarintField, hexToBytes } from './protobuf'
import { decodeTronRaw, encodeDecodedTronRaw, tronTxId, TronVerifyError, TRON_STAKE_CONTRACT_TYPES, TRON_TX_VALIDITY_MS } from './tx'
import {
	broadcastTronStake,
	buildLocalVoteTx,
	finishTronStake,
	encodeTronRaw,
	encodeVoteWitnessValue,
	prepareTronStake,
	refBlockFrom,
	resourceOfPosition,
	signTronStake,
	toTronStakeIntent,
	tronPositionsFrom,
	tronTargetApys,
	witnessKey,
	TRON_BROKERAGE_RPC,
	verifyTronStake,
	LOCAL_VOTE_TTL_MS,
	VOTE_WAIT_DEADLINE_MS,
} from './stake'
import bundled from '../registry/bundled.json'

// --- Tx reales de mainnet ------------------------------------------------------------
const REAL = {
	freeze: { txID: 'd9957038cbc0d3524633701bcc4e55378b3d3cc1f1de7f6772d74a1b0f968a56', raw: '0a0203b32208ab73cf02df3d715f40e0ad989a8f345a5a083612560a34747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e467265657a6542616c616e63655632436f6e7472616374121e0a154161296597a05d61e5af0eb44e504e95e0a763bb721080f6e04218017080d9949a8f34' },
	unfreeze: { txID: 'ee53053cf50b579956e1a72d2b78d2ba35fe362ab820fae9aeab3b468e6fc13e', raw: '0a02034c22089e1ba2129d38240540f9c6979a8f345a5b083712570a36747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e556e667265657a6542616c616e63655632436f6e7472616374121d0a1541885fbd8f442374dd62c39ad69c6e40ed2abd93701080897a180170999f859a8f34' },
	withdrawExpire: { txID: 'feb4d4c51d4a639051cd0d0484176cc040f969cbe111a176ec21d7d70627e2ec', raw: '0a02034c22089e1ba2129d38240540d8bf859a8f345a5a083812560a3b747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5769746864726177457870697265556e667265657a65436f6e747261637412170a1541bd1a401310399cb41fda0205713b152d653fbe9870f8ea819a8f34' },
	vote: { txID: '5bb41701088fed25c20e73aa00bf7f5cce7cce6cd940dce6710248e02017fe62', raw: '0a0203ba22088601aea98339bd1e40e8d1999a8f345a6b080412670a30747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e566f74655769746e657373436f6e747261637412330a15413a6fdbdfed89bb2819c92b1c9b9f2e9086773fcc121a0a154178c842ee63b253f8f0d2955bbc582c661a078c9d10a9107088fd959a8f34' },
	claim: { txID: 'bc2bd40c4beecfe8d15dc53f5ed0d3c2b4cd547744d33718d8a98075555f9e7a', raw: '0a0203ba22088601aea98339bd1e40889fabab8f345a53080d124f0a34747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e576974686472617742616c616e6365436f6e747261637412170a1541004f5e93b913d9efcdb993cdb92e12e5ec1e84547088fd959a8f34' },
}

const hex20 = (a) => tronToHex20(a)
const P2P = 'TH7Fe1W8CcLeqN4LGfqX1R9EpsnrJBQJij'
const NANSEN = 'TLG2B6w4K18HSnje7udYvqMMdJYQ9uYxjJ'
const BINANCE_SR = 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH'
const SEED = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
const OWNER = deriveAddresses(SEED).tron
const PRIV = derivePrivateKey(SEED, 'tron')
const RPC = { url: 'https://tron', priority: 20, owner: 'publicnode' }
const BLOCK = { blockID: '00000000052b043b8d6693b837ca51cf5ecfb978d3815be52725d4e5619569a7', block_header: { raw_data: { number: 86705211, timestamp: 1790788200000 } } }

const tronAddressFromPubkey = (pub) => {
	const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false)
	const payload = new Uint8Array(21)
	payload[0] = 0x41
	payload.set(keccak_256(uncompressed.slice(1)).slice(-20), 1)
	const full = new Uint8Array(25)
	full.set(payload)
	full.set(sha256(sha256(payload)).slice(0, 4), 21)
	return bs58.encode(full)
}
const recoverSigner = (rawHex, signatureHex) => {
	const sig = hexToBytes(signatureHex)
	const recovered = new Uint8Array(65)
	recovered[0] = sig[64] - 27
	recovered.set(sig.slice(0, 64), 1)
	return tronAddressFromPubkey(secp256k1.recoverPublicKey(recovered, hexToBytes(tronTxId(rawHex)), { prehash: false }))
}

/** Lo que construiría el nodo: un contrato de sistema sobre el bloque de referencia. */
const nodeTx = (typeName, value, { expiration = 1790788260000 } = {}) => {
	const raw = encodeTronRaw({ ref: refBlockFrom(BLOCK), expiration, timestamp: 1790788201000, typeCode: TRON_STAKE_CONTRACT_TYPES[typeName], typeName, value })
	return { txID: tronTxId(raw), raw_data_hex: raw }
}
const ownerField = (address) => encodeBytesField(1, hexToBytes(`41${hex20(address)}`))
const freezeValue = (owner, amount, resource = 1) => concatBytes(ownerField(owner), encodeVarintField(2, amount), ...(resource ? [encodeVarintField(3, resource)] : []))

const ACCOUNT = (over = {}) => ({ balance: 500_000_000, frozenV2: [{}, { type: 'ENERGY' }, { type: 'TRON_POWER' }], ...over })

let calls
const mockNode = (overrides = {}) => {
	calls = []
	const handlers = {
		'/wallet/getaccount': ({ address }) => (address === OWNER ? ACCOUNT() : { address, is_witness: [P2P, NANSEN].includes(address) }),
		'/wallet/getnextmaintenancetime': () => ({ num: 1790788200000 + 3 * 3600_000 }),
		'/wallet/getnowblock': () => BLOCK,
		'/wallet/freezebalancev2': ({ owner_address, frozen_balance }) => nodeTx('FreezeBalanceV2Contract', freezeValue(owner_address, BigInt(frozen_balance))),
		'/wallet/getaccountresource': () => ({ freeNetLimit: 600, freeNetUsed: 0 }),
		'/wallet/getchainparameters': () => ({ chainParameter: [{ key: 'getTransactionFee', value: 1000 }, { key: 'getUnfreezeDelayDays', value: 14 }, { key: 'getWitness127PayPerBlock', value: 128000000 }] }),
		'/wallet/getReward': () => ({ reward: 2_206_544 }),
		'/wallet/withdrawbalance': ({ owner_address }) => nodeTx('WithdrawBalanceContract', ownerField(owner_address)),
		'/wallet/withdrawexpireunfreeze': ({ owner_address }) => nodeTx('WithdrawExpireUnfreezeContract', ownerField(owner_address)),
		'/wallet/unfreezebalancev2': ({ owner_address, unfreeze_balance }) => nodeTx('UnfreezeBalanceV2Contract', freezeValue(owner_address, BigInt(unfreeze_balance))),
		'/wallet/votewitnessaccount': ({ owner_address, votes }) => nodeTx('VoteWitnessContract', encodeVoteWitnessValue(owner_address, votes.map(v => ({ address: v.vote_address, count: BigInt(v.vote_count) })))),
		'/wallet/broadcasthex': () => ({ result: true }),
		...overrides,
	}
	global.fetch = jest.fn(async (url, init) => {
		const path = url.replace('https://tron', '')
		const body = init?.body ? JSON.parse(init.body) : {}
		// Como el fetch de verdad: con la señal ya abortada, ni sale
		if (init?.signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
		calls.push({ path, body })
		const handler = handlers[path]
		if (!handler) throw new Error(`ruta inesperada ${path}`)
		return { ok: true, status: 200, json: async () => handler(body) }
	})
}
/** Una llamada del router por paso: cada una con su señal, que nadie más comparte. */
const freshRun = (signals = []) => (fn) => { const controller = new AbortController(); signals.push(controller.signal); return fn(RPC, controller.signal) }
afterEach(() => { delete global.fetch })

describe('decodificador contra tx reales de mainnet', () => {

	test('txID = sha256(raw) en las cinco', () => {
		Object.values(REAL).forEach(({ txID, raw }) => expect(tronTxId(raw)).toBe(txID))
	})

	test('cada contrato con sus campos', () => {
		expect(decodeTronRaw(REAL.freeze.raw).contracts[0]).toEqual({ type: 'FreezeBalanceV2Contract', owner: hex20('TJpx8yCX2rEVviVgAVsNfLf8Nty6trJ5EE'), amount: 140_000_000n, resource: 'ENERGY' })
		expect(decodeTronRaw(REAL.unfreeze.raw).contracts[0]).toEqual({ type: 'UnfreezeBalanceV2Contract', owner: hex20('TNQHbK4ahgcKX14URX29zBgbfh2KyqHtv4'), amount: 2_000_000n, resource: 'ENERGY' })
		expect(decodeTronRaw(REAL.withdrawExpire.raw).contracts[0]).toEqual({ type: 'WithdrawExpireUnfreezeContract', owner: hex20('TTD6ADYhCqsi3RHzQHPzP767pJ6vncoPmv') })
		expect(decodeTronRaw(REAL.vote.raw).contracts[0]).toEqual({ type: 'VoteWitnessContract', owner: hex20('TFJCCH1Nnvg2LfveZS9LUp8fjauNd22hwb'), votes: [{ address: hex20(BINANCE_SR), count: 2089n }], support: false })
		expect(decodeTronRaw(REAL.claim.raw).contracts[0]).toEqual({ type: 'WithdrawBalanceContract', owner: hex20('T9zr5k8gRFBinvKAkQo6vAvTHFfR9Ma4wv') })
	})

	test('un type_url que no corresponde al código se rechaza', () => {
		const forged = REAL.claim.raw.replace('576974686472617742616c616e6365', '576974686472617742616c616e6366')
		expect(() => decodeTronRaw(forged)).toThrow(TronVerifyError)
	})

	test('las cinco son canónicas: decodificar y volver a codificar da los mismos bytes', () => {
		// Es lo que exige `decodeTronRaw` antes de dejar firmar: si java-tron escribiera estos
		// contratos de otra forma, aquí se vería antes de rechazar una tx honrada
		Object.values(REAL).forEach(({ raw }) => expect(bytesToHex(encodeDecodedTronRaw(decodeTronRaw(raw)))).toBe(raw))
	})

	test('el voto construido EN LA APP es byte a byte el de mainnet', () => {
		const raw = decodeTronRaw(REAL.vote.raw)
		const rebuilt = encodeTronRaw({
			ref: { refBlockBytes: raw.refBlockBytes, refBlockHash: raw.refBlockHash },
			expiration: raw.expiration,
			timestamp: raw.timestamp,
			typeCode: TRON_STAKE_CONTRACT_TYPES.VoteWitnessContract,
			typeName: 'VoteWitnessContract',
			value: encodeVoteWitnessValue('TFJCCH1Nnvg2LfveZS9LUp8fjauNd22hwb', [{ address: BINANCE_SR, count: 2089n }]),
		})
		expect(rebuilt).toBe(REAL.vote.raw)
	})

	test('bloque de referencia: 2 bytes bajos del número y bytes 8..16 del id', () => {
		expect(refBlockFrom(BLOCK)).toEqual({ refBlockBytes: '043b', refBlockHash: '8d6693b837ca51cf', blockTimestamp: 1790788200000 })
		const vote = buildLocalVoteTx(OWNER, [{ address: P2P, count: 10n }], refBlockFrom(BLOCK), 1790788201000)
		expect(decodeTronRaw(vote.raw_data_hex).expiration).toBe(BigInt(1790788200000 + LOCAL_VOTE_TTL_MS))
	})
})

describe('estado de la cuenta (formato real de getaccount)', () => {

	test('votos repartidos + energía congelada y DELEGADA a otros', () => {
		const state = parseTronAccount({
			balance: 6934441,
			frozenV2: [{}, { type: 'ENERGY' }, { type: 'TRON_POWER' }],
			votes: [{ vote_address: 'TNeEwWHXLLUgEtfzTnYN8wtVenGxuMzZCE', vote_count: 7986 }, { vote_address: 'TKSXDA8HfE9E1y39RczVQ1ZascUEtaSToF', vote_count: 7984 }, { vote_address: 'TTMNxTmRpBZnjtUnohX84j25NLkTqDga7j', vote_count: 7984 }],
			latest_withdraw_time: 1790787717000,
			account_resource: { delegated_frozenV2_balance_for_energy: 23954000000 },
		})
		// Lo delegado sigue siendo del usuario y sigue votando: 23.954 TRX = 23.954 votos
		expect(tronPowerSun(state)).toBe(23_954_000_000n)
		expect(tronVotesUsed(state)).toBe(23_954n)
		expect(tronCommittedSun(state)).toBe(23_954_000_000n)
		expect(tronPositionsFrom(state, 0)).toEqual([{ chainKey: 'tron', kind: 'tron', id: 'delegated:ENERGY', status: 'locked', amount: 23_954_000_000n, target: null }])
	})

	test('descongelando: en sus 14 días y ya retirable', () => {
		const state = parseTronAccount({
			frozenV2: [{ amount: 10_000_000 }, { type: 'ENERGY', amount: 2_089_000_000 }],
			unfrozenV2: [{ type: 'ENERGY', unfreeze_amount: 2_000_000, unfreeze_expire_time: 1791997140000 }, { unfreeze_amount: 5_000_000, unfreeze_expire_time: 1000 }],
			votes: [{ vote_address: P2P, vote_count: 2099 }],
		})
		expect(state.unfrozen).toEqual([{ resource: 'ENERGY', amount: 2_000_000n, expireAt: 1791997140000 }, { resource: 'BANDWIDTH', amount: 5_000_000n, expireAt: 1000 }])
		expect(tronCommittedSun(state)).toBe(2_099_000_000n + 7_000_000n)
		const positions = tronPositionsFrom(state, 5_000, { [P2P]: 'P2P.org' })
		expect(positions.map(p => [p.id, p.status])).toEqual([
			['frozen:ENERGY', 'active'], ['frozen:BANDWIDTH', 'active'],
			['unfreeze:1791997140000:0', 'cooling'], ['unfreeze:1000:1', 'withdrawable'],
		])
		expect(positions[0].target).toEqual({ id: P2P, name: 'P2P.org' })
		expect(resourceOfPosition('frozen:ENERGY')).toBe('ENERGY')
		expect(resourceOfPosition('delegated:ENERGY')).toBeNull()
	})

	test('cuenta nunca activada = todo a cero', () => {
		expect(tronCommittedSun(parseTronAccount({}))).toBe(0n)
	})
})

describe('APY por SR', () => {

	const witnesses = [
		{ address: P2P, voteCount: 853_009_558 },
		{ address: NANSEN, voteCount: 783_811_347 },
		...Array.from({ length: 125 }, (_, i) => ({ address: `T${i}`, voteCount: 340_000_000 })),
		{ address: 'FUERA', voteCount: 1 },
	]

	test('128 TRX/bloque de voto + 8 TRX/bloque de producción (solo top 27), menos el brokerage', () => {
		const apys = tronTargetApys(witnesses, 128_000_000n, { [P2P]: 5, [NANSEN]: 20, FUERA: 0 }, [P2P, NANSEN, 'FUERA', 'SIN'], 8_000_000n)
		const total = 853_009_558 + 783_811_347 + 125 * 340_000_000
		const vote = 128 * 365 * 24 * 1200 / total
		const block = 8 * 365 * 24 * 1200 / 27 / 853_009_558
		expect(apys[P2P]).toBeCloseTo((vote + block) * 0.95, 12)
		expect(apys[NANSEN]).toBeLessThan(apys[P2P])
		expect(apys.FUERA).toBeNull()
		expect(apys.SIN).toBeNull()
	})

	test('VERIFICADO contra lo cobrado: P2P.org ≈ 3,24 % real (143.000 votos, 121 días, jun–sep 2026)', () => {
		// Foto de la red del 2026-09-30: 445 SR, top 127 = 43.630.371.924 votos, P2P.org puesto 20
		// con 853.009.558 votos y brokerage 5 %. Un votante con 143.000 votos fijos a P2P.org
		// cobró 1.534,859 TRX entre el 01-jun y el 30-sep: 1534.859 / 143000 / (120.93 / 365.25)
		const measured = 1534.859 / 143000 / (120.93 / 365.25)
		const network = [
			{ address: P2P, voteCount: 853_009_558 },
			// El resto del top 127, repartido para sumar el total real (P2P queda en el top 27)
			...Array.from({ length: 126 }, (_, i) => ({ address: `T${i}`, voteCount: Math.round((43_630_371_924 - 853_009_558) / 126) + (i < 19 ? 1e9 : 0) - (i >= 19 ? Math.round(19e9 / 107) : 0) })),
		]
		const apy = tronTargetApys(network, 128_000_000n, { [P2P]: 5 }, [P2P], 8_000_000n)[P2P]
		expect(Math.abs(apy - measured) / measured).toBeLessThan(0.02)
		// Sin la recompensa de producción se quedaba un 10 % corto: el error corregido
		const voteOnly = tronTargetApys(network, 128_000_000n, { [P2P]: 5 }, [P2P])[P2P]
		expect((measured - voteOnly) / measured).toBeGreaterThan(0.08)
	})

	test('la lista de SR llega en HEX (TronGrid) y el registry en base58: se comparan igual', () => {
		// Formato real de /wallet/listwitnesses en TronGrid, incluso pidiendo visible: true
		const hexNetwork = [{ address: `41${hex20(P2P)}`, voteCount: 853_009_558 }, ...Array.from({ length: 30 }, (_, i) => ({ address: `41${i.toString(16).padStart(40, '0')}`, voteCount: 300_000_000 }))]
		const apys = tronTargetApys(hexNetwork, 128_000_000n, { [P2P]: 5 }, [P2P], 8_000_000n)
		expect(apys[P2P]).not.toBeNull()
		expect(witnessKey(`41${hex20(P2P)}`)).toBe(witnessKey(P2P))
	})

	test('la comisión nunca se lee de TronGrid (devuelve siempre 0)', () => {
		expect(TRON_BROKERAGE_RPC({ url: 'https://api.trongrid.io', owner: 'trongrid', priority: 10 })).toBe(false)
		expect(TRON_BROKERAGE_RPC({ url: 'https://tron-rpc.publicnode.com', owner: 'publicnode', priority: 20 })).toBe(true)
		expect(TRON_BROKERAGE_RPC({ url: 'https://api.trongrid.io/jsonrpc', owner: 'trongrid', priority: 100, api: 'jsonrpc' })).toBe(false)
	})

	test('los SR del registry están verificados', () => {
		expect(bundled.chains.tron.staking.targets.map(t => t.name)).toEqual(['P2P.org', 'Nansen', 'Luganodes', 'Kiln'])
	})
})

describe('stake = congelar + votar en un PIN', () => {

	test('el nodo construye el congelado, la app el voto con TODO el poder al SR', async () => {
		mockNode({ '/wallet/getaccount': ({ address }) => (address === OWNER ? ACCOUNT({ frozenV2: [{ amount: 50_000_000 }, { type: 'ENERGY' }], votes: [{ vote_address: NANSEN, vote_count: 50 }] }) : { is_witness: true }) })
		const prepared = await prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P }, { now: () => 1790788201000 })
		expect(prepared.txs.map(t => t.step)).toEqual(['freeze', 'vote'])
		// 50 TRX ya congelados + 100 nuevos = 150 votos, todos a P2P (sustituye el voto a Nansen)
		expect(prepared.votes).toEqual([{ address: P2P, count: 150n }])
		expect(prepared.notices).toEqual(['replacesVotes'])
		expect(prepared.powerNeededSun).toBe(150_000_000n)
		expect(prepared.waitMs).toBe(3 * 3600_000 - 1000)
		// Con 600 bytes gratis caben las dos tx de sistema (~190 bytes cada una): comisión 0
		expect(prepared.feeSun).toBe(0n)
		const signed = signTronStake(prepared, PRIV)
		expect(signed.signatures).toHaveLength(2)
		prepared.txs.forEach(({ tx }, i) => expect(recoverSigner(tx.raw_data_hex, signed.signatures[i])).toBe(OWNER))
	})

	test('rechaza un destino que no es SR, menos de 1 TRX y saldo que no alcanza', async () => {
		mockNode()
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: BINANCE_SR })).rejects.toThrow('Super Representative')
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 999_999n, sr: P2P })).rejects.toThrow('1 TRX')
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 500_000_001n, sr: P2P })).rejects.toThrow('insuficiente')
	})

	test('sin bolsa gratuita suficiente, la segunda tx quema ancho de banda y se cobra', async () => {
		mockNode({ '/wallet/getaccountresource': () => ({ freeNetLimit: 600, freeNetUsed: 400 }) })
		const prepared = await prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P })
		const voteBytes = BigInt(prepared.txs[1].tx.raw_data_hex.length / 2) + 69n
		expect(prepared.feeSun).toBe(voteBytes * 1000n)
		// Y con el saldo justo para el congelado, ya no alcanza para ese ancho de banda
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 500_000_000n, sr: P2P })).rejects.toThrow('insuficiente')
	})

	test('un nodo que devuelve OTRO congelado (cantidad o recurso) no pasa la verificación', async () => {
		mockNode({ '/wallet/freezebalancev2': ({ owner_address }) => nodeTx('FreezeBalanceV2Contract', freezeValue(owner_address, 400_000_000n)) })
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P })).rejects.toThrow(TronVerifyError)
		mockNode({ '/wallet/freezebalancev2': ({ owner_address, frozen_balance }) => nodeTx('FreezeBalanceV2Contract', freezeValue(owner_address, BigInt(frozen_balance), 0)) })
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P })).rejects.toThrow('congelado distinto')
	})

	test('un congelado con el importe REPETIDO (100 TRX a la vista, 499 en la red) no llega a prepararse', async () => {
		// protobuf ejecuta el último valor de un campo singular repetido: la red congelaría 499 TRX 14 días
		mockNode({ '/wallet/freezebalancev2': ({ owner_address, frozen_balance }) => nodeTx('FreezeBalanceV2Contract', concatBytes(freezeValue(owner_address, BigInt(frozen_balance)), encodeVarintField(2, 499_000_000n))) })
		const err = await prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P }).catch(e => e)
		expect(err).toBeInstanceOf(TronVerifyError)
		expect(err.message).toMatch(/FreezeBalanceV2Contract trae el campo 2 repetido/)
	})

	test('un congelado con un campo de más no llega a prepararse', async () => {
		// FreezeBalanceV2 no tiene campo 4: lo que venga ahí la wallet no lo ha leído, así que no se firma
		mockNode({ '/wallet/freezebalancev2': ({ owner_address, frozen_balance }) => nodeTx('FreezeBalanceV2Contract', concatBytes(freezeValue(owner_address, BigInt(frozen_balance)), encodeBytesField(4, hexToBytes(`41${hex20(NANSEN)}`)))) })
		await expect(prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P })).rejects.toThrow(/campo 4, que no se admite/)
	})

	test('votos manipulados después de preparar: la firma se niega', async () => {
		mockNode()
		const prepared = await prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P })
		expect(() => signTronStake({ ...prepared, votes: [{ address: NANSEN, count: 100n }] }, PRIV)).toThrow('votos distintos')
		const extra = buildLocalVoteTx(OWNER, [{ address: P2P, count: 100n }, { address: NANSEN, count: 1n }], refBlockFrom(BLOCK), 1)
		const forged = { ...prepared, txs: [prepared.txs[0], { step: 'vote', tx: extra, raw: decodeTronRaw(extra.raw_data_hex) }] }
		expect(() => verifyTronStake(forged)).toThrow('votos distintos')
	})

	// El TRON Power del congelado se ve cuando `seen()` lo diga: nunca al preparar
	const FROZEN = { frozenV2: [{}, { type: 'ENERGY', amount: 100_000_000 }] }
	const stakeNode = (seen, overrides = {}) => mockNode({
		'/wallet/getaccount': ({ address }) => (address === OWNER ? ACCOUNT(seen() ? FROZEN : {}) : { is_witness: true }),
		...overrides,
	})
	const prepareStake = () => prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P })
	/** Reloj de mentira: `sleep` lo adelanta, así una espera sin fin acaba en el plazo y no cuelga la suite. */
	const fakeClock = () => { const clock = { ms: 0 }; return { clock, deps: { sleep: async (ms) => { clock.ms += ms }, now: () => clock.ms } } }
	const FREEZE_RESULT = { txid: 'FREEZE', duplicate: false }

	test('difunde el congelado, espera a ver el TRON Power y difunde el voto', async () => {
		let powered = false
		stakeNode(() => powered, { '/wallet/broadcasthex': () => { powered = true; return { result: true } } })
		const prepared = await prepareStake()
		const signed = signTronStake(prepared, PRIV)
		const frozen = await broadcastTronStake(RPC, prepared, signed)
		// La primera llamada difunde SOLO el congelado
		expect(calls.filter(c => c.path === '/wallet/broadcasthex')).toHaveLength(1)
		const result = await finishTronStake(freshRun(), prepared, signed, frozen, fakeClock().deps)
		expect(result).toEqual({ txid: prepared.txs[0].tx.txID, duplicate: false })
		expect(calls.filter(c => c.path === '/wallet/broadcasthex')).toHaveLength(2)
	})

	// S-01: todo iba dentro de la llamada del congelado, con su señal de 8 s. Si el TRON Power
	// tardaba más, las lecturas siguientes fallaban al instante y el voto no llegaba a salir
	test('la espera y el voto no dependen de la señal del congelado: cada paso lleva la suya', async () => {
		let reads = -1
		// El TRON Power tarda cuatro lecturas (9 s de espera) en verse: más que la llamada del congelado
		stakeNode(() => reads >= 0 && ++reads >= 4)
		const prepared = await prepareStake()
		const signed = signTronStake(prepared, PRIV)
		const first = new AbortController()
		const frozen = await broadcastTronStake(RPC, prepared, signed, { signal: first.signal })
		// La llamada del congelado se acabó: su señal ya no sirve
		first.abort()
		reads = 0
		const signals = []
		const { clock, deps } = fakeClock()
		const result = await finishTronStake(freshRun(signals), prepared, signed, frozen, deps)
		expect(result).toEqual({ txid: prepared.txs[0].tx.txID, duplicate: false })
		expect(calls.filter(c => c.path === '/wallet/broadcasthex')).toHaveLength(2)
		// Cuatro lecturas y el voto: cinco llamadas, cinco señales distintas y ninguna es la primera
		expect(signals).toHaveLength(5)
		expect(new Set(signals).size).toBe(5)
		expect(signals).not.toContain(first.signal)
		expect(clock.ms).toBe(9_000)
	})

	test('con la señal del congelado, lo de antes: ni una lectura sale y el voto no llega', async () => {
		let powered = false
		stakeNode(() => powered)
		const prepared = await prepareStake()
		const signed = signTronStake(prepared, PRIV)
		const first = new AbortController()
		const frozen = await broadcastTronStake(RPC, prepared, signed, { signal: first.signal })
		first.abort()
		powered = true
		const before = calls.length
		// Un `run` que reusara la señal caducada es justo el fallo: nada sale y el voto queda pendiente
		const result = await finishTronStake((fn) => fn(RPC, first.signal), prepared, signed, frozen, fakeClock().deps)
		expect(result).toMatchObject({ note: 'votePending' })
		expect(calls.length).toBe(before)
	})

	test('las lecturas de la espera son idempotentes (pueden rotar de nodo); el voto no', async () => {
		let powered = false
		stakeNode(() => powered)
		const prepared = await prepareStake()
		powered = true
		const options = []
		const run = (fn, opts) => { options.push(opts); return fn(RPC, undefined) }
		await finishTronStake(run, prepared, signTronStake(prepared, PRIV), FREEZE_RESULT, fakeClock().deps)
		expect(options).toEqual([{ idempotent: true }, undefined])
	})

	test('si el TRON Power no llega a verse, el voto se intenta al cumplirse el plazo: 24 s, no un minuto', async () => {
		stakeNode(() => false)
		const prepared = await prepareStake()
		const { clock, deps } = fakeClock()
		const result = await finishTronStake(freshRun(), prepared, signTronStake(prepared, PRIV), FREEZE_RESULT, deps)
		expect(clock.ms).toBe(VOTE_WAIT_DEADLINE_MS)
		expect(VOTE_WAIT_DEADLINE_MS).toBeLessThanOrEqual(30_000)
		// El nodo que se sondeaba podía ir atrasado: el voto sale igualmente, una vez
		expect(calls.filter(c => c.path === '/wallet/broadcasthex')).toHaveLength(1)
		expect(result).toEqual(FREEZE_RESULT)
	})

	test('una lectura que falla no corta la espera', async () => {
		let powered = false
		stakeNode(() => powered)
		const prepared = await prepareStake()
		powered = true
		let reads = 0
		const run = (fn, opts) => (opts?.idempotent && ++reads === 1 ? Promise.reject(new Error('ningún nodo responde')) : fn(RPC, undefined))
		const { clock, deps } = fakeClock()
		const result = await finishTronStake(run, prepared, signTronStake(prepared, PRIV), FREEZE_RESULT, deps)
		expect(result).toEqual(FREEZE_RESULT)
		expect(reads).toBe(2)
		expect(clock.ms).toBe(3_000)
	})

	test('el nodo que recibe el voto aún no ve el congelado: se repite mientras quede plazo', async () => {
		// El mensaje del nodo viaja en hex del texto ASCII
		const notYet = Array.from('Contract validate error : The total number of votes[100000000] is greater than the tronPower[0]', char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
		let powered = false
		let lagging = 2
		let votes = 0
		stakeNode(() => powered, { '/wallet/broadcasthex': () => { votes++; return lagging-- > 0 ? { result: false, code: 'CONTRACT_VALIDATE_ERROR', message: notYet } : { result: true } } })
		const prepared = await prepareStake()
		const signed = signTronStake(prepared, PRIV)
		powered = true
		const result = await finishTronStake(freshRun(), prepared, signed, FREEZE_RESULT, fakeClock().deps)
		expect(votes).toBe(3)
		expect(result).toEqual(FREEZE_RESULT)

		// Y si no llega a verlo dentro del plazo, queda pendiente en vez de repetirse sin fin
		lagging = Infinity
		const { clock, deps } = fakeClock()
		const late = await finishTronStake(freshRun(), prepared, signed, FREEZE_RESULT, deps)
		expect(late).toEqual({ ...FREEZE_RESULT, note: 'votePending' })
		expect(clock.ms).toBe(VOTE_WAIT_DEADLINE_MS)
	})

	test('si el voto no entra, el congelado sí: resultado con note votePending', async () => {
		let n = 0
		mockNode({ '/wallet/broadcasthex': () => (++n === 1 ? { result: true } : { result: false, code: 'CONTRACT_VALIDATE_ERROR', message: '' }) })
		const prepared = await prepareStake()
		const signed = signTronStake(prepared, PRIV)
		const frozen = await broadcastTronStake(RPC, prepared, signed)
		const result = await finishTronStake(freshRun(), prepared, signed, frozen, fakeClock().deps)
		expect(result).toMatchObject({ txid: prepared.txs[0].tx.txID, note: 'votePending' })
		// Otro rechazo del voto no se repite: sería igual en cualquier nodo
		expect(n).toBe(2)
	})

	test('una acción de una sola tx no tiene segunda parte', async () => {
		const single = { txs: [{ step: 'claim', tx: { raw_data_hex: '00' } }], powerNeededSun: null, intent: { owner: OWNER } }
		const run = jest.fn()
		await expect(finishTronStake(run, single, { signatures: ['00'] }, { txid: 'CLAIM', duplicate: false })).resolves.toEqual({ txid: 'CLAIM', duplicate: false })
		expect(run).not.toHaveBeenCalled()
	})
})

describe('cobrar, votar, descongelar y retirar', () => {

	test('cobrar: solo con recompensas y pasadas 24 h del último cobro', async () => {
		mockNode()
		const prepared = await prepareTronStake(RPC, { action: 'claim', owner: OWNER }, { now: () => 10 })
		expect(prepared).toMatchObject({ amount: 2_206_544n })
		expect(prepared.txs[0].raw.contracts[0].type).toBe('WithdrawBalanceContract')
		mockNode({ '/wallet/getaccount': () => ACCOUNT({ latest_withdraw_time: 1000 }) })
		await expect(prepareTronStake(RPC, { action: 'claim', owner: OWNER }, { now: () => 2000 })).rejects.toThrow('24 h')
		mockNode({ '/wallet/getReward': () => ({ reward: 0 }) })
		await expect(prepareTronStake(RPC, { action: 'claim', owner: OWNER })).rejects.toThrow('no hay recompensas')
	})

	describe('vigencia con el reloj del teléfono desajustado', () => {
		// `expiration` es hora de la CADENA; este teléfono va una hora por delante de ella
		const phone = 1790788260000 + 3_600_000

		test('cobrar: un teléfono adelantado no ve la tx caducada nada más construirla', async () => {
			mockNode()
			const prepared = await prepareTronStake(RPC, { action: 'claim', owner: OWNER }, { now: () => phone })
			expect(Number(prepared.txs[0].raw.expiration)).toBeLessThan(phone)
			expect(prepared.expiresAt).toBe(phone + TRON_TX_VALIDITY_MS)
		})

		test('stake: el voto local, con su timestamp del teléfono, no descuadra la vigencia', async () => {
			mockNode()
			const prepared = await prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 5_000_000n, sr: P2P }, { now: () => phone })
			expect(prepared.txs.map(t => t.step)).toEqual(['freeze', 'vote'])
			expect(prepared.expiresAt).toBe(phone + TRON_TX_VALIDITY_MS)
		})
	})

	test('votar: todo el poder al SR elegido; sin poder no hay voto', async () => {
		mockNode({ '/wallet/getaccount': ({ address }) => (address === OWNER ? ACCOUNT({ frozenV2: [{}, { type: 'ENERGY', amount: 7_500_000 }] }) : { is_witness: true }) })
		const prepared = await prepareTronStake(RPC, { action: 'vote', owner: OWNER, sr: NANSEN })
		expect(prepared.votes).toEqual([{ address: NANSEN, count: 7n }])
		expect(prepared.txs.map(t => t.step)).toEqual(['vote'])
		mockNode()
		await expect(prepareTronStake(RPC, { action: 'vote', owner: OWNER, sr: NANSEN })).rejects.toThrow('TRON Power')
	})

	test('votar: un voto del nodo con OTRO SR escondido detrás del elegido no pasa', async () => {
		const sr = (address) => encodeBytesField(1, hexToBytes(`41${hex20(address)}`))
		// Vote { SR elegido, votos, SR del atacante }: leído al principio es el bueno; la red vota al último
		const hidden = (owner, votes) => concatBytes(ownerField(owner), ...votes.map(v => encodeBytesField(2, concatBytes(sr(v.vote_address), encodeVarintField(2, BigInt(v.vote_count)), sr(P2P)))))
		mockNode({
			'/wallet/getaccount': ({ address }) => (address === OWNER ? ACCOUNT({ frozenV2: [{}, { type: 'ENERGY', amount: 7_500_000 }] }) : { is_witness: true }),
			'/wallet/votewitnessaccount': ({ owner_address, votes }) => nodeTx('VoteWitnessContract', hidden(owner_address, votes)),
		})
		const err = await prepareTronStake(RPC, { action: 'vote', owner: OWNER, sr: NANSEN }).catch(e => e)
		expect(err).toBeInstanceOf(TronVerifyError)
		expect(err.message).toMatch(/Vote trae el campo 1 repetido/)
	})

	test('firmar: una tx manipulada después de preparar (campo repetido) no se firma', async () => {
		mockNode()
		const prepared = await prepareTronStake(RPC, { action: 'claim', owner: OWNER }, { now: () => 10 })
		const tampered = nodeTx('WithdrawBalanceContract', concatBytes(ownerField(OWNER), ownerField(NANSEN)))
		expect(() => signTronStake({ ...prepared, txs: [{ ...prepared.txs[0], tx: tampered }] }, PRIV)).toThrow(TronVerifyError)
	})

	test('descongelar: del recurso elegido, sin pasarse, 14 días de espera y aviso de votos', async () => {
		const frozen = () => ACCOUNT({ frozenV2: [{}, { type: 'ENERGY', amount: 200_000_000 }], votes: [{ vote_address: P2P, vote_count: 200 }] })
		mockNode({ '/wallet/getaccount': frozen })
		const prepared = await prepareTronStake(RPC, { action: 'unstake', owner: OWNER, amount: 50_000_000n, resource: 'ENERGY' })
		expect(prepared).toMatchObject({ amount: 50_000_000n, waitMs: 14 * 24 * 3600_000, notices: ['votesAdjust'] })
		await expect(prepareTronStake(RPC, { action: 'unstake', owner: OWNER, amount: 300_000_000n, resource: 'ENERGY' })).rejects.toThrow('tanto congelado')
		mockNode({ '/wallet/getaccount': () => ACCOUNT({ frozenV2: [{}, { type: 'ENERGY', amount: 200_000_000 }], unfrozenV2: Array.from({ length: 32 }, () => ({ unfreeze_amount: 1, unfreeze_expire_time: 9e12 })) }) })
		await expect(prepareTronStake(RPC, { action: 'unstake', owner: OWNER, amount: 50_000_000n, resource: 'ENERGY' })).rejects.toThrow('32')
	})

	test('retirar: suma solo lo ya vencido', async () => {
		mockNode({ '/wallet/getaccount': () => ACCOUNT({ unfrozenV2: [{ unfreeze_amount: 3_000_000, unfreeze_expire_time: 100 }, { unfreeze_amount: 9_000_000, unfreeze_expire_time: 9e12 }] }) })
		const prepared = await prepareTronStake(RPC, { action: 'withdraw', owner: OWNER }, { now: () => 200 })
		expect(prepared.amount).toBe(3_000_000n)
		await expect(prepareTronStake(RPC, { action: 'withdraw', owner: OWNER }, { now: () => 50 })).rejects.toThrow('nada descongelado')
	})
})

// Sin esto el staking no preguntaba a la cadena: tras una difusión sin respuesta la pantalla
// se quedaba en «no pudimos confirmar» y quien salía y repetía congelaba dos veces
describe('lookup: ¿qué fue de un staking ya difundido?', () => {
	const { tronStakeAdapter } = require('./stake')
	const { TRON_LOOKUP_MARGIN_MS } = require('./tx')
	const NOW = 1790788201000

	/** El nodo conoce (con ese resultado) las tx de `known`; `headTime` es la hora de su punta. */
	const withChain = (known, headTime = NOW) => mockNode({
		'/wallet/getnowblock': () => ({ ...BLOCK, block_header: { ...BLOCK.block_header, raw_data: { ...BLOCK.block_header.raw_data, timestamp: headTime } } }),
		'/wallet/gettransactionbyid': ({ value }) => (value in known ? { txID: value, ret: [{ contractRet: known[value] }] } : {}),
	})
	const prepareStake = async () => {
		mockNode()
		return prepareTronStake(RPC, { action: 'stake', owner: OWNER, amount: 100_000_000n, sr: P2P }, { now: () => NOW })
	}
	const ids = (prepared) => prepared.txs.map(({ tx }) => tronTxId(tx.raw_data_hex))

	test('el congelado y el voto están en la cadena → landed, con el id del congelado', async () => {
		const prepared = await prepareStake()
		const [freeze, vote] = ids(prepared)
		withChain({ [freeze]: 'SUCCESS', [vote]: 'SUCCESS' })
		await expect(tronStakeAdapter.lookup(RPC, prepared, { signatures: [] }, {})).resolves.toEqual({ status: 'landed', txid: freeze })
	})

	test('el congelado entró y del voto no consta: landed, pero avisando de que falta votar', async () => {
		const prepared = await prepareStake()
		const [freeze] = ids(prepared)
		withChain({ [freeze]: 'SUCCESS' })
		await expect(tronStakeAdapter.lookup(RPC, prepared, { signatures: [] }, {})).resolves.toEqual({ status: 'landed', txid: freeze, note: 'votePending' })
	})

	test('el congelado no entró y su vigencia ya pasó → dropped (el voto ni se mira)', async () => {
		const prepared = await prepareStake()
		const [freeze, vote] = ids(prepared)
		withChain({}, Number(prepared.txs[0].raw.expiration) + TRON_LOOKUP_MARGIN_MS + 1_000)
		await expect(tronStakeAdapter.lookup(RPC, prepared, { signatures: [] }, {})).resolves.toEqual({ status: 'dropped' })
		const asked = calls.filter(c => c.path === '/wallet/gettransactionbyid').map(c => c.body.value)
		expect(asked).toEqual([freeze])
		expect(asked).not.toContain(vote)
	})

	test('el congelado no está y aún puede entrar → unknown', async () => {
		const prepared = await prepareStake()
		withChain({})
		await expect(tronStakeAdapter.lookup(RPC, prepared, { signatures: [] }, {})).resolves.toEqual({ status: 'unknown' })
	})

	test('una acción de una sola tx (cobrar) pregunta por ella y no añade nota', async () => {
		mockNode()
		const prepared = await prepareTronStake(RPC, { action: 'claim', owner: OWNER }, { now: () => NOW })
		expect(prepared.txs).toHaveLength(1)
		const [claim] = ids(prepared)
		withChain({ [claim]: 'SUCCESS' })
		await expect(tronStakeAdapter.lookup(RPC, prepared, { signatures: [] }, {})).resolves.toEqual({ status: 'landed', txid: claim })
	})
})

describe('adaptador', () => {
	test('mínimo de la red para congelar: 1 TRX', async () => {
		const { tronStakeAdapter } = require('./stake')
		await expect(tronStakeAdapter.entryMinimum(RPC, {})).resolves.toBe(1_000_000n)
	})

	test('traduce la intención genérica', () => {
		const base = { chainKey: 'tron', kind: 'tron', from: OWNER, amount: null, target: null }
		expect(toTronStakeIntent({ ...base, action: 'stake', amount: 5n, target: { id: P2P, name: 'P2P.org' } })).toEqual({ action: 'stake', owner: OWNER, amount: 5n, sr: P2P })
		expect(toTronStakeIntent({ ...base, action: 'unstake', amount: 5n, positionId: 'frozen:BANDWIDTH' })).toEqual({ action: 'unstake', owner: OWNER, amount: 5n, resource: 'BANDWIDTH' })
		expect(() => toTronStakeIntent({ ...base, action: 'unstake', amount: 5n, positionId: 'delegated:ENERGY' })).toThrow('posición')
		expect(toTronStakeIntent({ ...base, action: 'claim' })).toEqual({ action: 'claim', owner: OWNER })
		expect(() => toTronStakeIntent({ ...base, action: 'revoke' })).toThrow()
	})
})
