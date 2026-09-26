/**
 * @jest-environment node
 */
const { entryFromOrder, entryFromSwap, mergeHistory } = require('./historyModel')

const order = (uuid, created_at, extra = {}) => ({
	uuid, created_at,
	from_asset: 'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
	to_asset: 'solana:native',
	amount_in: '25.5', expected_out: '0.21', actual_out: null,
	status: 'awaiting_deposit',
	...extra,
})

const swap = (uuid, created_at, extra = {}) => ({
	uuid, created_at,
	pair: 'QVAPAY:QUSD_STACKS', direction: 'out', amount: 5,
	asset: 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD',
	status: 'completed',
	...extra,
})

describe('un swap custodial como fila del historial', () => {

	it('el sentido OUT paga saldo y recibe el activo', () => {
		const e = entryFromSwap(swap('s1', '2026-09-26T10:00:00Z'))
		expect(e.from).toEqual({ kind: 'balance' })
		// Solo el contrato: la red la resuelve el catálogo, no una cadena compuesta a mano
		expect(e.to).toEqual({ kind: 'token', contract: 'SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD' })
	})

	it('el sentido IN es el mismo par al revés', () => {
		const e = entryFromSwap(swap('s1', '2026-09-26T10:00:00Z', { direction: 'in' }))
		expect(e.from.kind).toBe('token')
		expect(e.to).toEqual({ kind: 'balance' })
	})

	it('1:1 y sin comisión: los dos lados son el mismo importe, a dos decimales', () => {
		const e = entryFromSwap(swap('s1', '2026-09-26T10:00:00Z', { amount: 5 }))
		expect(e.amountIn).toBe('5.00')
		expect(e.amountOut).toBe('5.00')
	})

	it('traduce su estado a la MISMA fase que el agregador, para un solo código de colores', () => {
		expect(entryFromSwap(swap('s', 'x', { status: 'completed' })).phase).toBe('done')
		expect(entryFromSwap(swap('s', 'x', { status: 'refunded' })).phase).toBe('returned')
		expect(entryFromSwap(swap('s', 'x', { status: 'failed' })).phase).toBe('problem')
		expect(entryFromSwap(swap('s', 'x', { status: 'needs_review' })).phase).toBe('problem')
		for (const status of ['pending', 'dispatching', 'sent']) {
			expect(entryFromSwap(swap('s', 'x', { status })).phase).toBe('working')
		}
	})

	it('cada motor lee su propia rama de traducciones', () => {
		expect(entryFromSwap(swap('s', 'x')).statusKey).toBe('crypto.wallet.swap.status.completed')
		expect(entryFromOrder(order('o', 'x')).statusKey).toBe('crypto.wallet.exchange.status.awaiting_deposit')
	})

	it('la clave lleva el motor delante: los uuid son únicos por tabla, no entre tablas', () => {
		expect(entryFromSwap(swap('same', 'x')).key).toBe('swap:same')
		expect(entryFromOrder(order('same', 'x')).key).toBe('exchange:same')
	})
})

describe('una orden de proveedor como fila', () => {

	it('enseña lo recibido de verdad en cuanto se sabe, y la promesa mientras tanto', () => {
		expect(entryFromOrder(order('o', 'x')).amountOut).toBe('0.21')
		expect(entryFromOrder(order('o', 'x', { actual_out: '0.208' })).amountOut).toBe('0.208')
		expect(entryFromOrder(order('o', 'x', { expected_out: null })).amountOut).toBeNull()
	})
})

describe('fundir las dos listas', () => {

	it('orden cronológico inverso, mezclando motores', () => {
		const merged = mergeHistory({
			orders: [order('o1', '2026-09-26T12:00:00Z'), order('o2', '2026-09-24T12:00:00Z')],
			swaps: [swap('s1', '2026-09-25T12:00:00Z'), swap('s2', '2026-09-23T12:00:00Z')],
		})
		expect(merged.map(e => e.uuid)).toEqual(['o1', 's1', 'o2', 's2'])
	})

	it('sin nada de un motor, la lista es la del otro', () => {
		const merged = mergeHistory({ orders: [], swaps: [swap('s1', '2026-09-25T12:00:00Z')] })
		expect(merged.map(e => e.uuid)).toEqual(['s1'])
	})

	it('vacío arriba y vacío abajo', () => {
		expect(mergeHistory({ orders: [], swaps: [] })).toEqual([])
	})

	it('con páginas pendientes corta en la frontera: nada más viejo que la fila más vieja cargada', () => {
		// A los swaps les quedan páginas y el más viejo cargado es del día 25: la orden del
		// 24 no se puede pintar todavía, porque entre medias podrían caber swaps sin llegar
		const merged = mergeHistory({
			orders: [order('o1', '2026-09-26T12:00:00Z'), order('o2', '2026-09-24T12:00:00Z')],
			swaps: [swap('s1', '2026-09-25T12:00:00Z')],
			moreSwaps: true,
		})
		expect(merged.map(e => e.uuid)).toEqual(['o1', 's1'])
	})

	it('la frontera es la MÁS RECIENTE de las dos cuando ambas tienen páginas', () => {
		const merged = mergeHistory({
			orders: [order('o1', '2026-09-26T12:00:00Z'), order('o2', '2026-09-20T12:00:00Z')],
			swaps: [swap('s1', '2026-09-25T12:00:00Z')],
			moreOrders: true,
			moreSwaps: true,
		})
		expect(merged.map(e => e.uuid)).toEqual(['o1', 's1'])
	})

	it('agotadas las dos listas no se corta nada: ya está todo', () => {
		const merged = mergeHistory({
			orders: [order('o1', '2026-09-26T12:00:00Z'), order('o2', '2026-09-20T12:00:00Z')],
			swaps: [swap('s1', '2026-09-25T12:00:00Z')],
		})
		expect(merged.map(e => e.uuid)).toEqual(['o1', 's1', 'o2'])
	})

	it('un motor sin cargar todavía y con páginas no deja pintar al otro por delante de él', () => {
		const merged = mergeHistory({ orders: [order('o1', '2026-09-26T12:00:00Z')], swaps: [], moreSwaps: true })
		expect(merged).toEqual([])
	})

	it('una fecha ilegible va al fondo en vez de romper el orden', () => {
		const merged = mergeHistory({
			orders: [order('o1', 'no-es-una-fecha')],
			swaps: [swap('s1', '2026-09-25T12:00:00Z')],
		})
		expect(merged.map(e => e.uuid)).toEqual(['s1', 'o1'])
	})
})
