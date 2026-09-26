/**
 * Cuánto se puede entregar DE VERDAD de un activo.
 *
 * Un MÁX que deja la cuenta sin gas para su propia transacción es el error más común de las
 * wallets: el botón rellena el campo con el saldo entero y el envío falla después. Esta es
 * la cuenta que lo evita, compartida por la pantalla de enviar y la de intercambiar.
 * @jest-environment node
 */
const { maxSendableUnits, TRX_MAX_RESERVE_SUN } = require('./walletSendActions')

describe('máximo entregable', () => {

	it('un TOKEN no reserva nada: el gas se paga en el nativo, que no se toca', () => {
		expect(maxSendableUnits({ balance: 90_000000n, isNative: false, kind: 'tron', reserve: TRX_MAX_RESERVE_SUN })).toBe(90_000000n)
	})

	it('un NATIVO descuenta la reserva de su cadena', () => {
		// 100 TRX menos los 1,4 de ancho de banda y activación
		expect(maxSendableUnits({ balance: 100_000000n, isNative: true, kind: 'tron', reserve: TRX_MAX_RESERVE_SUN })).toBe(98_600000n)
	})

	it('Bitcoin no reserva: la comisión se descuenta del propio envío', () => {
		expect(maxSendableUnits({ balance: 5_000000n, isNative: true, kind: 'btc', reserve: 50_000n })).toBe(5_000000n)
	})

	it('con menos saldo que la reserva devuelve CERO, no un número negativo', () => {
		// Un negativo se colaría al campo y el envío moriría con un error sin sentido
		expect(maxSendableUnits({ balance: 500_000n, isNative: true, kind: 'tron', reserve: TRX_MAX_RESERVE_SUN })).toBe(0n)
	})

	it('sin reserva conocida ofrece el saldo entero: el envío ya avisará', () => {
		expect(maxSendableUnits({ balance: 42n, isNative: true, kind: 'solana', reserve: 0n })).toBe(42n)
	})
})
