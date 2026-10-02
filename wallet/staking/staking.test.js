/**
 * @jest-environment node
 *
 * Fase 0 de staking: config del registry (saneada y con respaldo del
 * empaquetado), interruptores por cadena, resúmenes de posiciones, APY
 * estimados, lector de Stacks y el saldo gastable vs. comprometido.
 */
import bundled from '../registry/bundled.json'
import { buildAssetCatalog, isAssetVisible, stakedAssetId, toAssetView } from '../assets'
import { fetchChainBalances } from '../chains'
import { resolveStakingConfig, sanitizeStaking, sortStakeTargets } from './config'
import { actionNeedsAmount, actionNeedsTarget, canStakeAction, entryActionFor, exitActionFor, isStakingEntryVisible, isStakingHubEnabled, STAKING_CAPABILITIES } from './capabilities'
import { sortPositions, summarizePositions, timeLeft } from './staking'
import { compound, isPlausibleApy, projectEarnings, solanaStakingApy, stacksCycleApy, tronVoteApr } from './apy'
import { BTC_BLOCK_MS, fetchStakingSnapshot, stacksPositionsFrom } from './readers'
import { maxStakeUnits, validateStakeForm } from '../../screens/crypto/wallet/stakeFormModel'
import { isNeutralStakeActivity, stakeActivityOf } from './activity'

const STX_ADDR = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7'
const TRON_SR = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'
const SOL_VOTE = 'CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu'
const POX = 'SP000000000000000000002Q6VF78.pox-5'
const POOL = 'SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP.pox4-fast-pool-v3'
const STAKE_A = 'C8BSJt7GVYZNpkLTM9rHFzh1VQm14bYQPQFS77NSSugG'
const STAKE_B = '8MyWcZGvLKWcnePJCdgE7aZEt3Bf7ttM7RkCRCyDtYMi'
const STAKE_C = 'B9KmVaHF62CRLeiDHLGhN7J8EpmK2NRKh3dydzeiXxfJ'

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('config', () => {

	test('el bundled trae staking para las tres redes y el contrato PoX vigente', () => {
		expect(resolveStakingConfig('tron', bundled, bundled).targets).toHaveLength(4)
		// Validadores de Solana verificados on-chain (vote accounts activas) el 2026-09-30
		// Tres, por calidad y descentralización (fuera Helius: 15,9 M SOL, el más concentrado);
		// cada uno con 3 stake accounts reales para MEDIR su APY
		const solana = resolveStakingConfig('solana', bundled, bundled).targets
		expect(solana.map(t => t.name)).toEqual(['Anagram', 'Alchemy', 'Staking Facilities'])
		solana.forEach(t => expect(t.samples).toHaveLength(3))
		expect(resolveStakingConfig('stacks', bundled, bundled)).toEqual({ targets: [], poxContract: POX })
		expect(resolveStakingConfig('ethereum', bundled, bundled)).toBeNull()
		expect(resolveStakingConfig('nope', bundled, bundled)).toBeNull()
	})

	test('un remoto anterior al bloque staking no borra la config empaquetada', () => {
		const remote = JSON.parse(JSON.stringify(bundled))
		delete remote.chains.stacks.staking
		expect(resolveStakingConfig('stacks', remote, bundled)).toEqual({ targets: [], poxContract: POX })
	})

	test('el remoto gana cuando trae su propio bloque (así entran los partners sin publicar app)', () => {
		const remote = JSON.parse(JSON.stringify(bundled))
		remote.chains.tron.staking = { targets: [{ id: TRON_SR, name: 'QvaPay SR', partner: true }] }
		expect(resolveStakingConfig('tron', remote, bundled).targets).toEqual([{ id: TRON_SR, name: 'QvaPay SR', partner: true }])
	})

	test('sanea: descarta ids de otra familia, duplicados, campos basura y URLs no https', () => {
		const clean = sanitizeStaking('solana', {
			targets: [
				{ id: SOL_VOTE, name: ' Certus ', featured: true, url: 'http://inseguro', payout: 'eth', minAmount: '-1' },
				{ id: SOL_VOTE, name: 'Duplicado' },
				{ id: TRON_SR, name: 'Id de TRON en Solana' },
				{ id: 'x', name: '' },
				null,
			],
		})
		expect(clean).toEqual({ targets: [{ id: SOL_VOTE, name: 'Certus', featured: true }] })
	})

	test('muestras de APY: solo Solana, solo direcciones válidas, como mucho 3', () => {
		const clean = sanitizeStaking('solana', { targets: [{ id: SOL_VOTE, name: 'X', samples: [SOL_VOTE, 'basura', STAKE_A, STAKE_B, STAKE_C] }] })
		expect(clean.targets[0].samples).toEqual([SOL_VOTE, STAKE_A, STAKE_B])
		expect(sanitizeStaking('tron', { targets: [{ id: TRON_SR, name: 'Y', samples: [SOL_VOTE] }] }).targets[0].samples).toBeUndefined()
	})

	test('Stacks sin contrato PoX válido = sin staking', () => {
		expect(sanitizeStaking('stacks', { targets: [] })).toBeNull()
		expect(sanitizeStaking('stacks', { poxContract: 'SP000000000000000000002Q6VF78', targets: [] })).toBeNull()
		expect(sanitizeStaking('stacks', { poxContract: POX, targets: [{ id: POOL, name: 'Fast Pool', payout: 'stx', minAmount: '40000000' }] }))
			.toEqual({ poxContract: POX, targets: [{ id: POOL, name: 'Fast Pool', payout: 'stx', minAmount: '40000000' }] })
	})

	test('orden: partners, destacados y resto, estable', () => {
		const order = sortStakeTargets([
			{ id: 'a', name: 'A' },
			{ id: 'b', name: 'B', featured: true },
			{ id: 'c', name: 'C', partner: true },
			{ id: 'd', name: 'D', featured: true },
		]).map(t => t.id)
		expect(order).toEqual(['c', 'b', 'd', 'a'])
	})
})

describe('capabilities', () => {

	test('fases 1 y 2: Solana y TRON firman; Stacks aún solo se lee', () => {
		expect(STAKING_CAPABILITIES.solana).toEqual({ read: true, actions: ['stake', 'unstake', 'withdraw'] })
		expect(STAKING_CAPABILITIES.tron).toEqual({ read: true, actions: ['stake', 'vote', 'claim', 'unstake', 'withdraw'] })
		expect(STAKING_CAPABILITIES.stacks).toEqual({ read: true, actions: [] })
		expect(canStakeAction('solana', 'stake')).toBe(true)
		expect(canStakeAction('solana', 'claim')).toBe(false)
		expect(canStakeAction('tron', 'claim')).toBe(true)
		expect(canStakeAction('stacks', 'delegate')).toBe(false)
		expect(canStakeAction('evm', 'stake')).toBe(false)
	})

	test('la entrada "Ganar" solo en redes que ya firman; en desarrollo, en todas las de staking', () => {
		expect(isStakingEntryVisible({ kind: 'solana', contract: null })).toBe(true)
		expect(isStakingEntryVisible({ kind: 'tron', contract: null })).toBe(true)
		expect(isStakingEntryVisible({ kind: 'stacks', contract: null })).toBe(false)
		expect(isStakingEntryVisible({ kind: 'stacks', contract: null }, { dev: true })).toBe(true)
		expect(isStakingEntryVisible({ kind: 'solana', contract: 'EPjF…' }, { dev: true })).toBe(false)
		expect(isStakingEntryVisible({ kind: 'evm', contract: null }, { dev: true })).toBe(false)
		expect(isStakingHubEnabled()).toBe(true)
	})

	test('entrada/salida por red y qué acciones llevan importe o destino', () => {
		expect(entryActionFor('stacks')).toBe('delegate')
		expect(exitActionFor('stacks')).toBe('revoke')
		expect(entryActionFor('tron')).toBe('stake')
		expect(exitActionFor('solana')).toBe('unstake')
		expect(['stake', 'delegate', 'unstake'].every(a => actionNeedsAmount(a))).toBe(true)
		// Solana desactiva la stake account ENTERA: salir no lleva importe
		expect(actionNeedsAmount('unstake', 'solana')).toBe(false)
		expect(actionNeedsAmount('unstake', 'tron')).toBe(true)
		expect(['withdraw', 'claim', 'revoke', 'vote'].some(actionNeedsAmount)).toBe(false)
		expect(['stake', 'delegate', 'vote'].every(actionNeedsTarget)).toBe(true)
		expect(actionNeedsTarget('unstake')).toBe(false)
	})
})

describe('summarizePositions / timeLeft / sortPositions', () => {

	const pos = (status, amount, extra = {}) => ({ chainKey: 'solana', kind: 'solana', id: `${status}-${amount}`, status, amount, ...extra })

	test('reparte por estado y suma lo comprometido en bigint', () => {
		const summary = summarizePositions([
			pos('active', 5n, { rewards: 1n, unlockAt: 9_000 }),
			pos('locked', 2n),
			pos('activating', 3n, { unlockAt: 4_000 }),
			pos('cooling', 7n, { unlockAt: 6_000 }),
			pos('withdrawable', 11n, { unlockAt: 1_000 }),
		])
		expect(summary).toMatchObject({ active: 7n, activating: 3n, cooling: 7n, withdrawable: 11n, committed: 28n, rewardsPending: 1n, count: 5 })
		// Lo ya retirable no cuenta como "próximo cambio"
		expect(summary.nextUnlockAt).toBe(4_000)
		expect(summarizePositions(null)).toMatchObject({ committed: 0n, nextUnlockAt: null, count: 0 })
	})

	test('tiempo restante en la unidad legible', () => {
		const now = 1_000_000
		expect(timeLeft(null, now)).toBeNull()
		expect(timeLeft(now - 1, now)).toBeNull()
		expect(timeLeft(now + 5 * 60_000, now)).toEqual({ unit: 'minutes', value: 5 })
		expect(timeLeft(now + 90 * 60_000, now)).toEqual({ unit: 'hours', value: 2 })
		expect(timeLeft(now + 14 * 24 * 3600_000, now)).toEqual({ unit: 'days', value: 14 })
	})

	test('lo retirable primero, luego lo activo de mayor a menor', () => {
		const order = sortPositions([pos('cooling', 1n), pos('active', 2n), pos('withdrawable', 1n), pos('active', 9n), pos('activating', 5n)]).map(p => p.id)
		expect(order).toEqual(['withdrawable-1', 'active-9', 'active-2', 'activating-5', 'cooling-1'])
	})
})

describe('apy', () => {

	test('Solana: inflación / ratio stakeado × (1 − comisión), capitalizada por epoch', () => {
		const apy = solanaStakingApy({ validatorInflation: 0.045, stakedRatio: 0.65, commission: 0.05 })
		const apr = (0.045 / 0.65) * 0.95
		expect(apy).toBeGreaterThan(apr)
		expect(apy).toBeCloseTo(compound(apr, 182.625), 10)
		expect(solanaStakingApy({ validatorInflation: 0.045, stakedRatio: 0, commission: 0 })).toBeNull()
		// Comisión del 100 %: el delegador no gana nada → sin cifra
		expect(solanaStakingApy({ validatorInflation: 0.045, stakedRatio: 0.65, commission: 1 })).toBeNull()
	})

	test('TRON: voto (igual por voto) + producción de bloques si el SR es del top 27, × (1 − brokerage)', () => {
		const apr = tronVoteApr({ payPerBlockSun: 128_000_000n, totalVotes: 40_000_000_000n, brokerage: 0.2 })
		expect(apr).toBeCloseTo((128 * 365 * 24 * 1200 / 40e9) * 0.8, 12)
		const producer = tronVoteApr({ payPerBlockSun: 128_000_000n, totalVotes: 40_000_000_000n, brokerage: 0.2, producer: { witnessPayPerBlockSun: 8_000_000n, srVotes: 800_000_000 } })
		expect(producer).toBeCloseTo((128 * 365 * 24 * 1200 / 40e9 + 8 * 365 * 24 * 1200 / 27 / 800e6) * 0.8, 12)
		expect(tronVoteApr({ payPerBlockSun: 0, totalVotes: 1, brokerage: 0 })).toBeNull()
	})

	test('Stacks: rendimiento por ciclo anualizado, con o sin reinversión', () => {
		expect(stacksCycleApy({ cycleReturn: 0.004, cyclesPerYear: 25 })).toBeCloseTo(0.1, 12)
		expect(stacksCycleApy({ cycleReturn: 0.004, cyclesPerYear: 25, compounding: true })).toBeCloseTo(1.004 ** 25 - 1, 12)
		expect(stacksCycleApy({ cycleReturn: 0 })).toBeNull()
	})

	test('cifras absurdas no se muestran; el simulador es ilustrativo', () => {
		expect(isPlausibleApy(0.07)).toBe(true)
		expect(isPlausibleApy(0.9)).toBe(false)
		expect(isPlausibleApy(null)).toBe(false)
		expect(projectEarnings(100, 0.07, 365)).toBeCloseTo(7, 10)
		expect(projectEarnings(100, 0.9, 365)).toBe(0)
	})
})

describe('lector de Stacks', () => {

	test('STX bloqueado → una posición con cuenta atrás en bloques de Bitcoin', () => {
		const positions = stacksPositionsFrom({ stx: { balance: '9000000', locked: '5000000', burnchain_unlock_height: 900_010 } }, 900_000, 1_000)
		expect(positions).toEqual([{ chainKey: 'stacks', kind: 'stacks', id: 'pox', status: 'locked', amount: 5_000_000n, unlockAt: 1_000 + 10 * BTC_BLOCK_MS, target: null }])
		expect(stacksPositionsFrom({ stx: { balance: '9', locked: '0' } }, 1, 0)).toEqual([])
		// Sin altura del nodo la posición se ve igual, sin cuenta atrás
		expect(stacksPositionsFrom({ stx: { locked: '1' } }, null, 0)[0].unlockAt).toBeNull()
	})

	test('una llamada del router por cadena, contra el mismo nodo', async () => {
		global.fetch = jest.fn(async url => (url.endsWith('/balances')
			? jsonResponse({ stx: { balance: '9000000', locked: '5000000', burnchain_unlock_height: 900_010 } })
			: jsonResponse({ burn_block_height: 900_004 })))
		const rpc = { url: 'https://api.hiro.so', priority: 1, owner: 'hiro', api: 'hiro' }
		const router = { call: jest.fn((chainKey, fn) => fn(rpc, undefined)) }
		const snap = await fetchStakingSnapshot(router, bundled, 'stacks', STX_ADDR, () => 5_000)
		expect(router.call).toHaveBeenCalledTimes(1)
		expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
			`https://api.hiro.so/extended/v1/address/${STX_ADDR}/balances`,
			'https://api.hiro.so/v2/info',
		])
		expect(snap).toMatchObject({ chainKey: 'stacks', kind: 'stacks', updatedAt: 5_000 })
		expect(snap.positions[0]).toMatchObject({ amount: 5_000_000n, unlockAt: 5_000 + 6 * BTC_BLOCK_MS })
	})

	test('redes que aún no se saben leer devuelven null (sin posiciones, no error)', async () => {
		const router = { call: jest.fn() }
		await expect(fetchStakingSnapshot(router, bundled, 'ethereum', 'x')).resolves.toBeNull()
		expect(router.call).not.toHaveBeenCalled()
	})
})

describe('saldo gastable vs. comprometido', () => {

	const catalog = buildAssetCatalog(bundled)
	const stx = catalog.find(a => a.id === 'stacks:native')

	test('los saldos de Stacks separan lo bloqueado en su propia clave', async () => {
		global.fetch = jest.fn(async () => jsonResponse({ stx: { balance: '9000000', locked: '5000000' }, fungible_tokens: {} }))
		const rpc = { url: 'https://api.hiro.so', priority: 1, owner: 'hiro', api: 'hiro' }
		const router = { call: (chainKey, fn) => fn(rpc, undefined) }
		const balances = await fetchChainBalances(router, bundled, 'stacks', { stx: STX_ADDR })
		expect(balances['stacks:native']).toBe('4000000')
		expect(balances[stakedAssetId('stacks:native')]).toBe('5000000')
	})

	test('la vista separa gastable, staking y total; el USD vale el total', () => {
		const view = toAssetView(stx, { 'stacks:native': '4000000', [stakedAssetId('stacks:native')]: '5000000' }, { STX: 2 })
		expect(view).toMatchObject({ amount: '4', staked: '5', total: '9', usd: 18, hasBalance: true, hasStake: true })
		const onlyStaked = toAssetView(stx, { [stakedAssetId('stacks:native')]: '5000000' }, {})
		expect(onlyStaked).toMatchObject({ amount: '0', hasBalance: false, hasStake: true })
		// Un activo con todo en staking no se esconde de la lista
		expect(isAssetVisible({ ...onlyStaked, id: 'otra:native' }, {})).toBe(true)
	})
})

describe('formulario de staking', () => {

	const base = { action: 'stake', decimals: 9, sourceUnits: 2_000_000_000n, hasTarget: true }

	test('importe válido, cero, de más, con demasiados decimales', () => {
		expect(validateStakeForm({ ...base, amountText: '1.5' })).toEqual({ amountUnits: 1_500_000_000n, error: null, canContinue: true })
		expect(validateStakeForm({ ...base, amountText: '0' }).error).toEqual({ key: 'amountZero' })
		expect(validateStakeForm({ ...base, amountText: '3' }).error).toEqual({ key: 'insufficient' })
		expect(validateStakeForm({ ...base, amountText: '0.0000000001' }).error).toEqual({ key: 'amountInvalid', decimals: 9 })
		expect(validateStakeForm({ ...base, amountText: '' })).toEqual({ amountUnits: null, error: null, canContinue: false })
	})

	test('mínimo del pool y destino obligatorio (sin gritar antes de escribir)', () => {
		expect(validateStakeForm({ ...base, action: 'delegate', amountText: '1', minUnits: 1_500_000_000n }).error).toEqual({ key: 'belowMin', min: 1_500_000_000n })
		expect(validateStakeForm({ ...base, hasTarget: false, amountText: '' }).error).toBeNull()
		expect(validateStakeForm({ ...base, hasTarget: false, amountText: '1' }).error).toEqual({ key: 'noTarget' })
	})

	test('acciones sin importe: retirar pasa directo; cambiar de SR exige destino', () => {
		expect(validateStakeForm({ ...base, action: 'withdraw', amountText: '' })).toEqual({ amountUnits: null, error: null, canContinue: true })
		expect(validateStakeForm({ ...base, action: 'vote', amountText: '', hasTarget: false }).canContinue).toBe(false)
	})

	test('salir en Solana es la posición entera: sin importe; en TRON sí lo lleva', () => {
		expect(validateStakeForm({ ...base, action: 'unstake', kind: 'solana', amountText: '' })).toEqual({ amountUnits: null, error: null, canContinue: true })
		expect(validateStakeForm({ ...base, action: 'unstake', kind: 'tron', amountText: '' }).canContinue).toBe(false)
	})

	test('MÁX deja la reserva de comisión y nunca es negativo', () => {
		expect(maxStakeUnits(10n, 3n)).toBe(7n)
		expect(maxStakeUnits(2n, 3n)).toBe(0n)
	})
})

describe('actividad: movimientos de staking reconocidos', () => {

	const ME = new Set(['STAKE1', 'STAKE2'])

	test('un "Enviado" a una stake account propia es Staking; volver de ella es Retirado', () => {
		expect(stakeActivityOf({ direction: 'out', from: 'YO', to: 'STAKE1' }, ME)).toBe('stake')
		expect(stakeActivityOf({ direction: 'in', from: 'STAKE2', to: 'YO' }, ME)).toBe('withdraw')
		// Desactivar no mueve SOL: llega como tx de solo comisión sobre la stake account
		expect(stakeActivityOf({ kind: 'fee', direction: 'out', from: 'YO', to: 'STAKE1' }, ME)).toBe('unstake')
	})

	test('TRON: los tipos que ya marca el servidor se respetan, sin necesitar stake accounts', () => {
		for (const kind of ['stake', 'unstake', 'vote', 'claim', 'withdraw']) {
			expect(stakeActivityOf({ kind, direction: 'self', from: 'YO', to: null }, new Set())).toBe(kind)
		}
		// Votar o congelar no es dinero que se fue (sin signo); cobrar o retirar sí entra
		expect(['stake', 'unstake', 'vote'].every(isNeutralStakeActivity)).toBe(true)
		expect(['claim', 'withdraw'].some(isNeutralStakeActivity)).toBe(false)
	})

	test('cualquier otra cosa sigue siendo un envío o un recibo normal', () => {
		expect(stakeActivityOf({ direction: 'out', from: 'YO', to: 'OTRO' }, ME)).toBeNull()
		expect(stakeActivityOf({ direction: 'in', from: 'OTRO', to: 'YO' }, ME)).toBeNull()
		expect(stakeActivityOf({ kind: 'fee', direction: 'out', from: 'YO', to: 'OTRO' }, ME)).toBeNull()
		expect(stakeActivityOf({ direction: 'out', from: 'YO', to: 'STAKE1' }, new Set())).toBeNull()
	})
})
