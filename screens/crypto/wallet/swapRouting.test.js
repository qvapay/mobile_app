/**
 * @jest-environment node
 */
const { assetIdOf, canSwapAsset, directionFor, flip, isBalance, railAmountUsd, routeFor } = require('./swapRouting')

const BALANCE = { kind: 'balance' }
const QUSD = { kind: 'asset', id: 'stacks:SP14CTSJZNKZ7YTR6C84368J2QXRW8RC20GSQ8KS2.QUSD::QUSD' }
const USDT_TRON = { kind: 'asset', id: 'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }
const SOL = { kind: 'asset', id: 'solana:native' }

const pairs = [QUSD.id]
// USDT-TRON tiene riel de retiro Y de depósito; SOL, ninguno (para probar el caso sin salida)
const railOut = [USDT_TRON.id]
const railIn = [USDT_TRON.id]
const route = (pay, receive) => routeFor({ pay, receive, pairAssetIds: pairs, railOut, railIn })

describe('qué motor atiende cada combinación', () => {

	it('saldo → QUSD es el motor custodial, sentido out', () => {
		expect(route(BALANCE, QUSD).mode).toBe('qusd-out')
		expect(directionFor('qusd-out')).toBe('out')
	})

	it('QUSD → saldo es el mismo motor, sentido in', () => {
		expect(route(QUSD, BALANCE).mode).toBe('qusd-in')
		expect(directionFor('qusd-in')).toBe('in')
	})

	it('dos activos de la wallet van al agregador', () => {
		expect(route(USDT_TRON, SOL).mode).toBe('exchange')
		expect(route(SOL, QUSD).mode).toBe('exchange')
		expect(directionFor('exchange')).toBeNull()
	})

	it('el saldo hacia un activo con riel de retiro va por NUESTRO riel', () => {
		// No es un swap, pero mueve lo que el usuario pidió con comisión nuestra y sin terceros
		expect(route(BALANCE, USDT_TRON).mode).toBe('withdraw')
	})

	it('un activo con riel de depósito hacia el saldo, igual', () => {
		expect(route(USDT_TRON, BALANCE).mode).toBe('deposit')
	})

	it('el par publicado GANA al riel: es instantáneo, 1:1 y sin comisión', () => {
		const r = routeFor({ pay: BALANCE, receive: QUSD, pairAssetIds: pairs, railOut: [QUSD.id], railIn: [QUSD.id] })
		expect(r.mode).toBe('qusd-out')
	})

	it('sin par y sin riel, se dice por qué en vez de fallar al confirmar', () => {
		const r = route(BALANCE, SOL)
		expect(r.mode).toBe('unsupported')
		expect(r.reasonKey).toContain('noRailOut')
		expect(route(SOL, BALANCE).reasonKey).toContain('noRailIn')
	})

	it('los rieles se leen por SENTIDO: uno puede estar abierto y el otro no', () => {
		const onlyOut = routeFor({ pay: BALANCE, receive: SOL, pairAssetIds: [], railOut: [SOL.id], railIn: [] })
		expect(onlyOut.mode).toBe('withdraw')
		const backwards = routeFor({ pay: SOL, receive: BALANCE, pairAssetIds: [], railOut: [SOL.id], railIn: [] })
		expect(backwards.mode).toBe('unsupported')
	})

	it('el saldo a los dos lados no es un intercambio', () => {
		expect(route(BALANCE, BALANCE).reasonKey).toContain('sameSide')
	})

	it('el mismo activo a los dos lados tampoco', () => {
		expect(route(SOL, SOL).reasonKey).toContain('sameAsset')
	})

	it('sin elegir todavía, no se enruta a ningún motor', () => {
		expect(route(null, SOL).mode).toBe('unsupported')
		expect(route(BALANCE, null).mode).toBe('unsupported')
	})

	it('los pares salen del BACKEND: si deja de publicar QUSD, esa ruta se cierra sola', () => {
		expect(routeFor({ pay: BALANCE, receive: QUSD, pairAssetIds: [] }).mode).toBe('unsupported')
	})
})

describe('utilidades', () => {

	it('distingue el saldo de un activo', () => {
		expect(isBalance(BALANCE)).toBe(true)
		expect(isBalance(SOL)).toBe(false)
		expect(isBalance(null)).toBe(false)
	})

	it('saca el assetId solo de los lados que lo tienen', () => {
		expect(assetIdOf(SOL)).toBe('solana:native')
		expect(assetIdOf(BALANCE)).toBeNull()
		expect(assetIdOf(undefined)).toBeNull()
	})

	it('invertir cambia los dos lados de sitio', () => {
		expect(flip(BALANCE, SOL)).toEqual([SOL, BALANCE])
	})
})

describe('¿se puede intercambiar este activo?', () => {
	const base = { assetId: SOL.id, isHouse: false, supportedAssetIds: [], railAssetIds: [] }

	it('QUSD siempre: tiene su par custodial publicado', () => {
		expect(canSwapAsset({ ...base, assetId: QUSD.id, isHouse: true })).toBe(true)
	})

	it('basta con que lo liste el proveedor', () => {
		expect(canSwapAsset({ ...base, supportedAssetIds: [SOL.id] })).toBe(true)
	})

	it('o con que lo mueva un riel de QvaPay', () => {
		expect(canSwapAsset({ ...base, railAssetIds: [SOL.id] })).toBe(true)
	})

	it('sin ninguna salida, no: el botón llevaría a una pantalla que solo sabe decir que no', () => {
		expect(canSwapAsset(base)).toBe(false)
		expect(canSwapAsset({ ...base, supportedAssetIds: [USDT_TRON.id], railAssetIds: [USDT_TRON.id] })).toBe(false)
	})
})

describe('el importe que viaja al riel', () => {

	it('en el RETIRO lo tecleado ya son dólares', () => {
		expect(railAmountUsd({ typed: 25, mode: 'withdraw', price: null })).toBe('25')
	})

	it('en el DEPÓSITO se convierte por el precio del activo', () => {
		// Teclear "1" con SOL en el lado que paga llegaba a Depositar como UN DÓLAR
		expect(railAmountUsd({ typed: 1, mode: 'deposit', price: 116.6 })).toBe('116.6')
		expect(railAmountUsd({ typed: 15, mode: 'deposit', price: 1 })).toBe('15')
	})

	it('redondea a centavos: una pantalla de dinero no enseña ocho decimales', () => {
		expect(railAmountUsd({ typed: 0.37, mode: 'deposit', price: 85661.905 })).toBe('31694.9')
	})

	it('sin precio conocido NO manda nada: mejor vacío que inventado', () => {
		expect(railAmountUsd({ typed: 1, mode: 'deposit', price: null })).toBeNull()
		expect(railAmountUsd({ typed: 1, mode: 'deposit', price: 0 })).toBeNull()
	})

	it('sin importe válido tampoco', () => {
		for (const typed of [0, -5, NaN, Infinity]) {
			expect(railAmountUsd({ typed, mode: 'withdraw', price: 1 })).toBeNull()
		}
	})

	it('los modos que no son riel no mandan importe', () => {
		for (const mode of ['qusd-out', 'qusd-in', 'exchange', 'unsupported']) {
			expect(railAmountUsd({ typed: 10, mode, price: 1 })).toBeNull()
		}
	})
})

