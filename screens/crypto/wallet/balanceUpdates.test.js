/**
 * Cómo llegan los saldos a la caché entre pasada y pasada: quién pisa a quién, cuándo se
 * repinta y cuándo se vuelve a mirar la red de un envío propio.
 * @jest-environment node
 */
import { applyBalances, chaseBalance, CHASE_DELAYS_MS, startBalanceChase } from './balanceUpdates'
import { stakedForeignId, stakedOwnId } from '../../../wallet/chains'

let seq = 0
// Cada test con su wallet: el orden de las lecturas se recuerda por wallet y red
const storeOf = (balances) => {
	let data = balances === undefined ? undefined : { balances, failedChains: ['bitcoin'], updatedAt: 42 }
	const set = jest.fn(next => { data = next })
	return { id: `wallet-${++seq}`, get: () => data, set }
}

describe('applyBalances', () => {
	test('sin foto todavía no pinta nada: la primera pasada sale entera, no red a red', () => {
		const store = storeOf(undefined)
		expect(applyBalances(store, { 'stacks:native': '5' }, { chainKey: 'stacks', startedAt: 10 })).toBe(false)
		expect(store.set).not.toHaveBeenCalled()
	})

	test('lleva lo leído a la caché y conserva lo demás', () => {
		const store = storeOf({ 'stacks:native': '5', 'bsc:native': '9' })
		expect(applyBalances(store, { 'stacks:native': '3', 'stacks:qusd': '25' }, { chainKey: 'stacks', startedAt: 10 })).toBe(true)
		expect(store.get()).toEqual({
			balances: { 'stacks:native': '3', 'stacks:qusd': '25', 'bsc:native': '9' },
			failedChains: ['bitcoin'],
			updatedAt: 42,
		})
	})

	test('si nada cambia no escribe: nadie se repinta por una lectura igual', () => {
		const store = storeOf({ 'stacks:native': '5', 'bsc:native': '9' })
		expect(applyBalances(store, { 'stacks:native': '5' }, { chainKey: 'stacks', startedAt: 10 })).toBe(false)
		expect(store.set).not.toHaveBeenCalled()
	})

	test('una lectura pedida ANTES que la última aplicada de esa red se descarta', () => {
		const store = storeOf({ 'stacks:qusd': '50' })
		// La de un envío propio, pedida en el segundo 200, ya ve el saldo nuevo
		expect(applyBalances(store, { 'stacks:qusd': '25' }, { chainKey: 'stacks', startedAt: 200 })).toBe(true)
		// La de la pasada se pidió en el 100 y llega después con el saldo viejo
		expect(applyBalances(store, { 'stacks:qusd': '50' }, { chainKey: 'stacks', startedAt: 100 })).toBe(false)
		expect(store.get().balances['stacks:qusd']).toBe('25')
		// Otra red de esa misma pasada sí entra
		expect(applyBalances(store, { 'bsc:native': '7' }, { chainKey: 'bsc', startedAt: 100 })).toBe(true)
		// Y una lectura posterior de la primera vuelve a mandar
		expect(applyBalances(store, { 'stacks:qusd': '20' }, { chainKey: 'stacks', startedAt: 300 })).toBe(true)
		expect(store.get().balances).toEqual({ 'stacks:qusd': '20', 'bsc:native': '7' })
	})

	test('el orden es por wallet: la lectura de una no descarta la de otra', () => {
		const one = storeOf({ 'stacks:qusd': '50' })
		const other = storeOf({ 'stacks:qusd': '50' })
		applyBalances(one, { 'stacks:qusd': '25' }, { chainKey: 'stacks', startedAt: 200 })
		expect(applyBalances(other, { 'stacks:qusd': '10' }, { chainKey: 'stacks', startedAt: 100 })).toBe(true)
	})

	test('la parte lenta entra sin orden de red y el total sale de las dos partes', () => {
		const own = stakedOwnId('solana:native')
		const foreign = stakedForeignId('solana:native')
		const store = storeOf({ 'solana:native': '9', [own]: '100', 'solana:native#staked': '100' })
		expect(applyBalances(store, { [foreign]: '50' })).toBe(true)
		expect(store.get().balances['solana:native#staked']).toBe('150')
		// La pasada siguiente trae otra vez su parte: el total sigue contando la lenta
		expect(applyBalances(store, { 'solana:native': '4', [own]: '105' }, { chainKey: 'solana', startedAt: 500 })).toBe(true)
		expect(store.get().balances['solana:native#staked']).toBe('155')
	})
})

// Temporizadores a mano: `fire` dispara el siguiente y deja asentar la lectura que lanza
const fakeTimers = () => {
	const queue = []
	let next = 1
	return {
		queue,
		setTimeout: (fn, ms) => { const handle = next++; queue.push({ handle, fn, ms }); return handle },
		clearTimeout: (handle) => { const index = queue.findIndex(timer => timer.handle === handle); if (index >= 0) queue.splice(index, 1) },
		fire: async () => {
			queue.shift().fn()
			await new Promise(resolve => setImmediate(resolve))
		},
	}
}

describe('startBalanceChase', () => {
	test('no lee en el segundo 0: espera, y espacia las lecturas según la tabla', async () => {
		const timers = fakeTimers()
		const read = jest.fn(async () => '50')
		startBalanceChase({ read, baseline: '50', delays: [3_000, 7_000, 13_000], timers })
		expect(read).not.toHaveBeenCalled()
		expect(timers.queue.map(timer => timer.ms)).toEqual([3_000])
		await timers.fire()
		expect(timers.queue.map(timer => timer.ms)).toEqual([4_000])
		await timers.fire()
		expect(timers.queue.map(timer => timer.ms)).toEqual([6_000])
		await timers.fire()
		// Agotada la tabla no queda nada pendiente: sigue el sondeo normal de la pantalla
		expect(read).toHaveBeenCalledTimes(3)
		expect(timers.queue).toHaveLength(0)
	})

	test('para en cuanto el saldo se mueve', async () => {
		const timers = fakeTimers()
		const read = jest.fn().mockResolvedValueOnce('50').mockResolvedValueOnce('25')
		startBalanceChase({ read, baseline: '50', timers })
		await timers.fire()
		expect(timers.queue).toHaveLength(1)
		await timers.fire()
		expect(read).toHaveBeenCalledTimes(2)
		expect(timers.queue).toHaveLength(0)
	})

	test('sin saldo de partida, la primera lectura lo es', async () => {
		const timers = fakeTimers()
		const read = jest.fn().mockResolvedValueOnce('50').mockResolvedValueOnce('50').mockResolvedValueOnce('25')
		startBalanceChase({ read, baseline: undefined, timers })
		await timers.fire()
		// Diferente de «nada» no es haberse movido
		expect(timers.queue).toHaveLength(1)
		await timers.fire()
		await timers.fire()
		expect(read).toHaveBeenCalledTimes(3)
		expect(timers.queue).toHaveLength(0)
	})

	test('un nodo caído no corta la serie, ni una lectura que no trae el activo', async () => {
		const timers = fakeTimers()
		const read = jest.fn().mockRejectedValueOnce(new Error('nodo caído')).mockResolvedValueOnce(undefined).mockResolvedValueOnce('25')
		startBalanceChase({ read, baseline: '50', timers })
		await timers.fire()
		expect(timers.queue).toHaveLength(1)
		await timers.fire()
		expect(timers.queue).toHaveLength(1)
		await timers.fire()
		expect(timers.queue).toHaveLength(0)
	})

	test('cancelar quita lo pendiente, también con una lectura en vuelo', async () => {
		const timers = fakeTimers()
		const read = jest.fn(async () => '50')
		const cancel = startBalanceChase({ read, baseline: '50', timers })
		cancel()
		expect(timers.queue).toHaveLength(0)
		expect(read).not.toHaveBeenCalled()

		let release
		const slow = jest.fn(() => new Promise(resolve => { release = resolve }))
		const cancelSlow = startBalanceChase({ read: slow, baseline: '50', timers })
		await timers.fire()
		cancelSlow()
		release('50')
		await new Promise(resolve => setImmediate(resolve))
		expect(timers.queue).toHaveLength(0)
	})

	test('la tabla por defecto empieza a los pocos segundos y crece', () => {
		expect(CHASE_DELAYS_MS[0]).toBeGreaterThanOrEqual(2_000)
		expect([...CHASE_DELAYS_MS].sort((a, b) => a - b)).toEqual(CHASE_DELAYS_MS)
		expect(new Set(CHASE_DELAYS_MS).size).toBe(CHASE_DELAYS_MS.length)
	})
})

describe('chaseBalance', () => {
	test('una sola por red y wallet: la de un envío nuevo sustituye a la del anterior', async () => {
		const timers = fakeTimers()
		const first = jest.fn(async () => '50')
		const second = jest.fn(async () => '50')
		chaseBalance('wallet-x|stacks', { read: first, baseline: '50', timers })
		chaseBalance('wallet-x|stacks', { read: second, baseline: '50', timers })
		// De la primera no queda temporizador; de otra red sí puede haber otra a la vez
		expect(timers.queue).toHaveLength(1)
		chaseBalance('wallet-x|bsc', { read: first, baseline: '1', timers })
		expect(timers.queue).toHaveLength(2)
		await timers.fire()
		expect(second).toHaveBeenCalledTimes(1)
		expect(first).not.toHaveBeenCalled()
	})
})
