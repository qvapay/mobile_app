/**
 * Qué líneas del carrito paga cada cobro: al pagarse salen esas, no las que haya en el carrito, y
 * lo pagado sin el QR delante también sale, sin perder el resto del carrito guardado.
 * @jest-environment node
 */
// Un disco propio, compartido por cada arranque de la app que simula `boot`
const mockDisk = new Map()
jest.mock('@react-native-async-storage/async-storage', () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(async key => (mockDisk.has(key) ? mockDisk.get(key) : null)),
		setItem: jest.fn(async (key, value) => { mockDisk.set(key, String(value)) }),
	},
}))
// El carrito de verdad sobre ese disco, con `remove` espiado
jest.mock('../market/marketCartStore', () => {
	const actual = jest.requireActual('../market/marketCartStore')
	return { ...actual, remove: jest.fn(actual.remove) }
})
jest.mock('../../../api/pixApi', () => ({ pixApi: { getCheckout: jest.fn() } }))

const STORAGE_KEY = '@qppixcart:v1'
const T0 = Date.parse('2026-11-16T12:00:00Z')
const HOUR = 60 * 60 * 1000
const CART_KEY = '@qpmarketcart:v1'
const item = (uuid) => ({ product_uuid: uuid, qty: 1, title: uuid, price: 10, kind: 'digital', shop_slug: 's', shop_name: 'S', added_at: 1 })
const cartOnDisk = () => JSON.parse(mockDisk.get(CART_KEY) ?? '[]').map(line => line.product_uuid)

describe('pixCartLines', () => {
	let cartLines
	let removeCartLine
	let pixApi

	// Cada test arranca como una app recién abierta: memoria vacía, el disco es lo que haya
	const boot = () => {
		jest.isolateModules(() => {
			cartLines = require('./pixCartLines')
			removeCartLine = require('../market/marketCartStore').remove
			pixApi = require('../../../api/pixApi').pixApi
		})
	}
	const removed = () => removeCartLine.mock.calls.map(call => call[0])
	const clockAt = (ms) => jest.spyOn(Date, 'now').mockReturnValue(ms)

	beforeEach(() => {
		mockDisk.clear()
		boot()
	})

	afterEach(() => { jest.restoreAllMocks() })

	test('pagado saca solo las líneas con las que se creó ese cobro', async () => {
		// El QR se creó con A; luego se añadió B y volver a pagar reabrió el mismo QR
		await cartLines.rememberCartLines('c0', ['A:'])
		await cartLines.settleCartLines('c0', 'verifying')
		expect(removed()).toEqual(['A:'])
	})

	test('entregado también las saca, y una vez resuelto no vuelve a tocarlas', async () => {
		await cartLines.rememberCartLines('c1', ['A:', 'B:v1'])
		await cartLines.settleCartLines('c1', 'delivered')
		await cartLines.settleCartLines('c1', 'delivered')
		expect(removed()).toEqual(['A:', 'B:v1'])
	})

	test('devuelto olvida el cobro sin tocar el carrito: el dinero volvió y no se entrega nada', async () => {
		await cartLines.rememberCartLines('c1', ['A:'])
		await cartLines.settleCartLines('c1', 'refunded')
		await cartLines.settleCartLines('c1', 'verifying')
		expect(removeCartLine).not.toHaveBeenCalled()
	})

	test.each(['expired', 'cancelled', 'failed'])('%s no toca el carrito, pero un pago que entra tarde saca sus líneas', async (stage) => {
		await cartLines.rememberCartLines('c1', ['A:'])
		await cartLines.settleCartLines('c1', stage)
		expect(removeCartLine).not.toHaveBeenCalled()
		await cartLines.settleCartLines('c1', 'delivered')
		expect(removed()).toEqual(['A:'])
	})

	test('a las 24 h justas aún espera; pasadas, un cobro sin pagar se olvida', async () => {
		const clock = clockAt(T0)
		await cartLines.rememberCartLines('onTime', ['A:'])
		await cartLines.rememberCartLines('closed', ['B:'])
		await cartLines.rememberCartLines('open', ['C:'])
		clock.mockReturnValue(T0 + 24 * HOUR)
		await cartLines.settleCartLines('onTime', 'expired')
		await cartLines.settleCartLines('onTime', 'delivered')
		expect(removed()).toEqual(['A:'])

		clock.mockReturnValue(T0 + 24 * HOUR + 1)
		await cartLines.settleCartLines('closed', 'expired')
		await cartLines.settleCartLines('open', 'awaiting_payment')
		await cartLines.settleCartLines('closed', 'delivered')
		await cartLines.settleCartLines('open', 'delivered')
		expect(removed()).toEqual(['A:'])
	})

	test('el plazo cuenta desde que se creó, también tras cerrar la app', async () => {
		const clock = clockAt(T0)
		await cartLines.rememberCartLines('c1', ['A:'])
		boot()
		clock.mockReturnValue(T0 + 25 * HOUR)
		await cartLines.settleCartLines('c1', 'expired')
		await cartLines.settleCartLines('c1', 'delivered')
		expect(removeCartLine).not.toHaveBeenCalled()
	})

	test('lo que guardaba la versión anterior (solo las líneas) sigue valiendo, como recién creado', async () => {
		const clock = clockAt(T0)
		mockDisk.set(STORAGE_KEY, JSON.stringify({ c0: ['A:'] }))
		boot()
		await cartLines.settleCartLines('c0', 'expired')
		clock.mockReturnValue(T0 + 23 * HOUR)
		await cartLines.settleCartLines('c0', 'delivered')
		expect(removed()).toEqual(['A:'])
	})

	test('abierto, o en una etapa desconocida, se sigue esperando', async () => {
		await cartLines.rememberCartLines('c1', ['A:'])
		await cartLines.settleCartLines('c1', 'awaiting_payment')
		await cartLines.settleCartLines('c1', 'reviewing')
		expect(removeCartLine).not.toHaveBeenCalled()
		await cartLines.settleCartLines('c1', 'verifying')
		expect(removed()).toEqual(['A:'])
	})

	test('un cobro sin líneas apuntadas no toca el carrito', async () => {
		await cartLines.rememberCartLines('c1', [])
		await cartLines.settleCartLines('c1', 'verifying')
		await cartLines.settleCartLines('otro', 'verifying')
		expect(removeCartLine).not.toHaveBeenCalled()
	})

	test('sobrevive a que el sistema cierre la app mientras se paga en el banco', async () => {
		await cartLines.rememberCartLines('c1', ['A:'])
		boot()
		await cartLines.settleCartLines('c1', 'verifying')
		expect(removed()).toEqual(['A:'])
	})

	test('lo apuntado antes de leer el disco no pisa lo que ya había', async () => {
		mockDisk.set(STORAGE_KEY, JSON.stringify({ c0: ['A:'] }))
		boot()
		await cartLines.rememberCartLines('c1', ['B:'])
		await cartLines.settleCartLines('c0', 'verifying')
		await cartLines.settleCartLines('c1', 'verifying')
		expect(removed()).toEqual(['A:', 'B:'])
	})

	test('un disco ilegible cuenta como vacío', async () => {
		mockDisk.set(STORAGE_KEY, '{roto')
		boot()
		await cartLines.settleCartLines('c0', 'verifying')
		const at = Date.now()
		mockDisk.set(STORAGE_KEY, JSON.stringify({ c0: 'A:', c1: [1], c2: ['C:'], c3: { keys: ['D:'] }, c4: { keys: 'E:', at }, c5: { keys: ['F:'], at: String(at) }, c6: { keys: ['G:'], at } }))
		boot()
		for (const uuid of ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']) { await cartLines.settleCartLines(uuid, 'verifying') }
		expect(removed()).toEqual(['C:', 'G:'])
		mockDisk.set(STORAGE_KEY, JSON.stringify(['c0']))
		boot()
		await cartLines.settleCartLines('c0', 'verifying')
		expect(removed()).toEqual([])
	})

	test('recién abierta la app no borra lo demás del carrito guardado', async () => {
		// QR de A reabierto desde una gift card antes de que nada haya leído el carrito
		mockDisk.set(CART_KEY, JSON.stringify([item('pA'), item('pB')]))
		await cartLines.rememberCartLines('c0', ['pA:'])
		boot()
		await cartLines.settleCartLines('c0', 'verifying')
		expect(cartOnDisk()).toEqual(['pB'])
	})

	test('se quedan los 20 cobros más recientes', async () => {
		for (let i = 0; i < 21; i++) { await cartLines.rememberCartLines(`c${i}`, [`P${i}:`]) }
		await cartLines.settleCartLines('c0', 'verifying')
		await cartLines.settleCartLines('c1', 'verifying')
		await cartLines.settleCartLines('c20', 'verifying')
		expect(removed()).toEqual(['P1:', 'P20:'])
	})

	describe('settlePendingCartLines', () => {
		test('saca lo pagado sin el QR delante, olvida lo devuelto y espera lo abierto y lo caducado', async () => {
			await cartLines.rememberCartLines('paid', ['A:'])
			await cartLines.rememberCartLines('open', ['B:'])
			await cartLines.rememberCartLines('refunded', ['C:'])
			await cartLines.rememberCartLines('late', ['D:'])
			pixApi.getCheckout.mockImplementation(async uuid => ({ success: true, data: { uuid, stage: { paid: 'delivered', open: 'awaiting_payment', refunded: 'refunded', late: 'expired' }[uuid] } }))
			await cartLines.settlePendingCartLines()
			expect(removed()).toEqual(['A:'])

			// Quedan pendientes el abierto y el caducado
			pixApi.getCheckout.mockClear()
			await cartLines.settlePendingCartLines()
			expect(pixApi.getCheckout.mock.calls.map(call => call[0])).toEqual(['open', 'late'])
		})

		test('un pago que entra tarde sobre un QR caducado sale del carrito al volver a él', async () => {
			await cartLines.rememberCartLines('late', ['D:'])
			pixApi.getCheckout.mockResolvedValue({ success: true, data: { uuid: 'late', stage: 'expired' } })
			await cartLines.settlePendingCartLines()
			expect(removeCartLine).not.toHaveBeenCalled()

			pixApi.getCheckout.mockResolvedValue({ success: true, data: { uuid: 'late', stage: 'delivered' } })
			await cartLines.settlePendingCartLines()
			expect(removed()).toEqual(['D:'])
		})

		test('un 404 (otra cuenta, o ya no existe) se olvida; sin red se queda para la próxima', async () => {
			await cartLines.rememberCartLines('foreign', ['A:'])
			await cartLines.rememberCartLines('offline', ['B:'])
			pixApi.getCheckout.mockImplementation(async uuid => (uuid === 'foreign'
				? { success: false, status: 404, error: 'Not found' }
				: { success: false, error: 'Network Error' }))
			await cartLines.settlePendingCartLines()
			expect(removeCartLine).not.toHaveBeenCalled()

			pixApi.getCheckout.mockClear()
			pixApi.getCheckout.mockResolvedValue({ success: true, data: { uuid: 'offline', stage: 'verifying' } })
			await cartLines.settlePendingCartLines()
			expect(pixApi.getCheckout.mock.calls.map(call => call[0])).toEqual(['offline'])
			expect(removed()).toEqual(['B:'])
		})

		test('sin nada apuntado no pregunta, y dos llamadas a la vez preguntan una sola vez', async () => {
			await cartLines.settlePendingCartLines()
			expect(pixApi.getCheckout).not.toHaveBeenCalled()

			await cartLines.rememberCartLines('c1', ['A:'])
			pixApi.getCheckout.mockResolvedValue({ success: true, data: { uuid: 'c1', stage: 'awaiting_payment' } })
			await Promise.all([cartLines.settlePendingCartLines(), cartLines.settlePendingCartLines()])
			expect(pixApi.getCheckout).toHaveBeenCalledTimes(1)
		})
	})
})
