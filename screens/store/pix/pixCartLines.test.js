/**
 * Qué líneas del carrito paga cada cobro: al pagarse salen esas, no las que haya en el carrito, lo
 * pagado sin el QR delante también sale, y un cobro cuya respuesta se perdió recupera las suyas.
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
const CART_KEY = '@qpmarketcart:v1'
const HOUR = 60 * 60 * 1000
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

	test.each(['refunded', 'expired', 'cancelled', 'failed'])('%s olvida el cobro sin tocar el carrito', async (stage) => {
		await cartLines.rememberCartLines('c1', ['A:'])
		await cartLines.settleCartLines('c1', stage)
		await cartLines.settleCartLines('c1', 'verifying')
		expect(removeCartLine).not.toHaveBeenCalled()
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
		mockDisk.set(STORAGE_KEY, JSON.stringify({ charges: { c0: ['A:'] }, unconfirmed: null }))
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
		mockDisk.set(STORAGE_KEY, JSON.stringify({ charges: { c0: 'A:', c1: [1], c2: ['C:'] }, unconfirmed: { keys: 'A:', at: 1 } }))
		boot()
		await cartLines.settleCartLines('c0', 'verifying')
		await cartLines.settleCartLines('c1', 'verifying')
		await cartLines.settleCartLines('c2', 'verifying')
		expect(removed()).toEqual(['C:'])
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

	describe('un cobro cuya respuesta se perdió', () => {
		test('el 409 del reintento recupera las líneas del intento sin respuesta', async () => {
			await cartLines.rememberUnconfirmedCartLines(['A:'])
			await cartLines.claimCartLines({ uuid: 'lost', surface: 'market' })
			await cartLines.settleCartLines('lost', 'verifying')
			expect(removed()).toEqual(['A:'])
		})

		test('si hubo varios intentos sin respuesta, se queda el primero', async () => {
			await cartLines.rememberUnconfirmedCartLines(['A:'])
			// Se añadió B y tampoco hubo respuesta: con el QR de A abierto, este solo pudo recibir el 409
			await cartLines.rememberUnconfirmedCartLines(['A:', 'B:'])
			await cartLines.claimCartLines({ uuid: 'lost', surface: 'market' })
			await cartLines.settleCartLines('lost', 'verifying')
			expect(removed()).toEqual(['A:'])
		})

		test('sobrevive a que se cierre la app entre el intento y el reintento', async () => {
			await cartLines.rememberUnconfirmedCartLines(['A:'])
			boot()
			await cartLines.claimCartLines({ uuid: 'lost', surface: 'market' })
			await cartLines.settleCartLines('lost', 'verifying')
			expect(removed()).toEqual(['A:'])
		})

		test('un QR con líneas apuntadas se queda con las suyas, y el intento queda resuelto', async () => {
			await cartLines.rememberCartLines('known', ['A:'])
			await cartLines.rememberUnconfirmedCartLines(['A:', 'B:'])
			await cartLines.claimCartLines({ uuid: 'known', surface: 'market' })
			await cartLines.claimCartLines({ uuid: 'web', surface: 'market' })
			await cartLines.settleCartLines('known', 'verifying')
			await cartLines.settleCartLines('web', 'verifying')
			expect(removed()).toEqual(['A:'])
		})

		test('un QR de otra compra no se las queda, y el intento queda resuelto', async () => {
			await cartLines.rememberUnconfirmedCartLines(['A:'])
			await cartLines.claimCartLines({ uuid: 'topup', surface: 'topup' })
			await cartLines.claimCartLines({ uuid: 'web', surface: 'market' })
			await cartLines.settleCartLines('topup', 'verifying')
			await cartLines.settleCartLines('web', 'verifying')
			expect(removeCartLine).not.toHaveBeenCalled()
		})

		test('un cobro nuevo prueba que el intento no creó nada', async () => {
			await cartLines.rememberUnconfirmedCartLines(['A:'])
			await cartLines.rememberCartLines('fresh', [])
			await cartLines.claimCartLines({ uuid: 'web', surface: 'market' })
			await cartLines.settleCartLines('web', 'verifying')
			expect(removeCartLine).not.toHaveBeenCalled()
		})

		test('pasada una hora ya no se usa, y entonces vale uno nuevo', async () => {
			const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
			await cartLines.rememberUnconfirmedCartLines(['A:'])
			now.mockReturnValue(1_000_000 + HOUR + 1)
			await cartLines.claimCartLines({ uuid: 'web', surface: 'market' })
			await cartLines.settleCartLines('web', 'verifying')
			expect(removeCartLine).not.toHaveBeenCalled()

			await cartLines.rememberUnconfirmedCartLines(['A:'])
			now.mockReturnValue(1_000_000 + 2 * HOUR + 2)
			await cartLines.rememberUnconfirmedCartLines(['B:'])
			await cartLines.claimCartLines({ uuid: 'lost', surface: 'market' })
			await cartLines.settleCartLines('lost', 'verifying')
			expect(removed()).toEqual(['B:'])
		})
	})

	describe('settlePendingCartLines', () => {
		test('saca lo pagado sin el QR delante, olvida lo cerrado y espera lo abierto', async () => {
			await cartLines.rememberCartLines('paid', ['A:'])
			await cartLines.rememberCartLines('open', ['B:'])
			await cartLines.rememberCartLines('gone', ['C:'])
			pixApi.getCheckout.mockImplementation(async uuid => ({ success: true, data: { uuid, stage: { paid: 'delivered', open: 'awaiting_payment', gone: 'expired' }[uuid] } }))
			await cartLines.settlePendingCartLines()
			expect(removed()).toEqual(['A:'])

			// Solo queda pendiente el abierto
			pixApi.getCheckout.mockClear()
			await cartLines.settlePendingCartLines()
			expect(pixApi.getCheckout.mock.calls.map(call => call[0])).toEqual(['open'])
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
