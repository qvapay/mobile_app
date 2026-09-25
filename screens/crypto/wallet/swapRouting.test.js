/**
 * @jest-environment node
 */
const { assetIdOf, directionFor, flip, isBalance, routeFor } = require('./swapRouting')

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
