/**
 * Cuánto se puede entregar DE VERDAD de un activo.
 *
 * Un MÁX que deja la cuenta sin gas para su propia transacción es el error más común de las
 * wallets: el botón rellena el campo con el saldo entero y el envío falla después. Esta es
 * la cuenta que lo evita, compartida por la pantalla de enviar y la de intercambiar.
 * @jest-environment node
 */
const { maxSendableUnits, percentOfUnits, TRX_MAX_RESERVE_SUN } = require('./walletSendActions')

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

describe('porcentajes en unidades mínimas', () => {

	// El helper de dólares devolvía `toFixed(2)`, que REDONDEA: con estos saldos reales
	// "MÁX" pedía más de lo que hay y la pantalla dejaba de cotizar sin decir nada
	it('MÁX es el saldo EXACTO, nunca un céntimo más', () => {
		const balance = 5_436789n            // 5.436789 USDC (6 decimales)
		expect(percentOfUnits(balance, 100)).toBe(balance)
		expect(Number((5.436789).toFixed(2))).toBeGreaterThan(5.436789)   // lo que hacía antes
	})

	it('no se pierde en saldos diminutos, donde dos decimales son cero', () => {
		const btc = 123456n                  // 0.00123456 BTC (8 decimales)
		expect(percentOfUnits(btc, 100)).toBe(btc)
		expect(percentOfUnits(btc, 50)).toBe(61728n)
	})

	it('los porcentajes truncan hacia abajo: nunca ofrecen de más', () => {
		expect(percentOfUnits(7n, 50)).toBe(3n)
		expect(percentOfUnits(1_000_001n, 25)).toBe(250_000n)
	})

	it('sin saldo no hay nada que ofrecer', () => {
		expect(percentOfUnits(0n, 100)).toBe(0n)
		expect(percentOfUnits(-5n, 50)).toBe(0n)
	})
})
