/**
 * @jest-environment node
 *
 * Lo que hace DE VERDAD la llamada al router de LI.FI (O-02). Los vectores de
 * `lifiVectors.json` son transacciones REALES de su API (14 nov 2026) para la dirección de la
 * clave 0x11…11 y, cuando cruzan a Solana, para 9WzD…AWWM. Las variantes de ataque se
 * fabrican decodificando una real, cambiándole un campo y volviéndola a codificar.
 */
import VECTORS from './lifiVectors.json'
import {
	decodeLifiCall,
	decodeMayanCall,
	encodeLifiCall,
	encodeMayanCall,
	EvmRouteExpiredError,
	EvmUnsupportedRouteError,
	lifiSelectors,
	mayanSelectors,
	SWIFT_MIN_DEADLINE_S,
	verifyLifiCalldata,
} from './lifi'
import { EvmVerifyError } from './tx'

const OWNER = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'
const SOL_RECEIVER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const ATTACKER = '0x000000000000000000000000000000000000dEaD'
const ATTACKER_WORD = '0x' + '0'.repeat(24) + ATTACKER.slice(2).toLowerCase()
const SOL_ATTACKER_WORD = '0x' + 'ab'.repeat(32)
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const OTHER_TOKEN = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'

/** Lo que la wallet sabe de la operación: sale del par y del importe, no de la ruta. */
const expectationOf = (name, overrides = {}) => {
	const v = VECTORS[name]
	return {
		chainId: v.build.chainId,
		owner: OWNER,
		receiver: v.to.chainId === 'solana' ? SOL_RECEIVER : OWNER,
		token: v.from.token,
		decimals: v.from.decimals,
		amountIn: BigInt(v.from.amount),
		to: v.to,
		// La holgura de la app: lo cotizado menos un 3 %
		minOut: BigInt(v.toAmount) * 97n / 100n,
		quoted: BigInt(v.toAmount),
		...overrides,
	}
}
const dataOf = (name) => VECTORS[name].build.tx.data
/** Por defecto «ahora» es el momento en que LI.FI dio la ruta. */
const verify = (name, data = dataOf(name), overrides = {}, now = VECTORS[name].capturedAt) => verifyLifiCalldata(data, expectationOf(name, overrides), now)

/** Copia profunda que respeta los bigint (JSON no los admite). */
const deepClone = (value) => (Array.isArray(value)
	? value.map(deepClone)
	: value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, deepClone(inner)])) : value)

/** Una real con un campo cambiado: `change` recibe los argumentos decodificados y los toca. */
const forged = (name, change) => {
	const { name: fn, args } = decodeLifiCall(dataOf(name))
	const next = deepClone(args)
	change(next)
	return encodeLifiCall(fn, next)
}
/** Lo mismo con la orden de Mayan que va dentro. */
const forgedMayan = (name, change) => forged(name, (args) => {
	const mayan = args[args.length - 1]
	const inner = decodeMayanCall(mayan.protocolData)
	const next = deepClone(inner.args)
	change(next, mayan)
	mayan.protocolData = encodeMayanCall(inner.name, next)
})
const last = (args) => args[args.length - 1]

describe('la lista blanca', () => {

	test('son 14 funciones del Diamond, con los selectores vistos en la cadena', () => {
		const selectors = lifiSelectors()
		expect(selectors.size).toBe(14)
		expect(Object.fromEntries([...selectors].filter(([, fn]) => !fn.startsWith('startBridge')))).toEqual({
			'0x4666fc80': 'swapTokensSingleV3ERC20ToERC20',
			'0x733214a3': 'swapTokensSingleV3ERC20ToNative',
			'0xaf7060fd': 'swapTokensSingleV3NativeToERC20',
			'0x5fd9ae2e': 'swapTokensMultipleV3ERC20ToERC20',
			'0x2c57e884': 'swapTokensMultipleV3ERC20ToNative',
			'0x736eac0b': 'swapTokensMultipleV3NativeToERC20',
			'0x02631b09': 'swapAndStartBridgeTokensViaNEARIntents',
			'0x1794958f': 'swapAndStartBridgeTokensViaAcrossV4',
			'0x17917a4e': 'swapAndStartBridgeTokensViaPolymerCCTP',
			'0x80c65808': 'swapAndStartBridgeTokensViaMayan',
		})
	})

	test('y cuatro órdenes de Mayan, con los selectores que su faceta reconoce', () => {
		expect(Object.fromEntries(mayanSelectors())).toEqual({
			'0xa3a30834': 'createOrderWithToken',
			'0x2072197f': 'bridgeWithFee',
			'0x9be95bb4': 'bridgeWithLockedFee',
			'0xf58b6de8': 'bridge',
		})
	})

	// Relay Depository lleva solo un identificador de orden: a quién se paga no consta en lo que se firma
	test.each(['relayDepository', 'stargate'])('%s: una función de LI.FI que no está en la lista no se firma', (name) => {
		const err = (() => { try { verify(name) } catch (e) { return e } return null })()
		expect(err).toBeInstanceOf(EvmUnsupportedRouteError)
		// Sigue siendo un fallo de verificación para quien solo mira eso
		expect(err).toBeInstanceOf(EvmVerifyError)
		expect(err.message).toMatch(/fuera de la lista/)
	})

	test('ni una llamada que no sea del router', () => {
		expect(() => verify('swapTokenToToken', '0x095ea7b3' + '0'.repeat(128))).toThrow(EvmUnsupportedRouteError)
		expect(() => verify('swapTokenToToken', '0x')).toThrow(/inválida/)
		expect(() => verify('swapTokenToToken', 'no es hex')).toThrow(/inválida/)
	})
})

describe('las rutas reales pasan, y el mínimo que devuelven es el de la cadena', () => {

	// En estas el mínimo que lleva la transacción es exactamente el que anuncia LI.FI
	test.each([
		'swapTokenToNative', 'swapNativeToToken', 'swapTokenToToken',
		'nearToSolNative', 'nearToSolToken', 'nearNativeToNative', 'nearTokenToToken',
		'acrossNativeToNative', 'acrossTokenToToken', 'acrossSwapFirst',
		'polymerToSol', 'polymerToEvm',
	])('%s', (name) => {
		expect(verify(name).minOut).toBe(BigInt(VECTORS[name].toAmountMin))
	})

	// Mayan Swift anota el mínimo con 8 decimales: queda justo por debajo, menos de una unidad de esas
	test.each([
		['mayanSwiftToSol', 10n], ['mayanSwiftNativeToSol', 10n], ['mayanSwiftToEvmToken', 10n ** 10n], ['mayanSwiftToEvmNative', 10n ** 10n],
	])('%s', (name, unit) => {
		const { minOut, fn } = verify(name)
		const announced = BigInt(VECTORS[name].toAmountMin)
		expect(fn).toBe('swapAndStartBridgeTokensViaMayan')
		expect(minOut).toBeLessThanOrEqual(announced)
		expect(announced - minOut).toBeLessThan(unit)
	})

	// CCTP: llega lo que cruza menos las comisiones que van en la llamada, que es lo cotizado
	test.each(['mayanMctpToSol', 'mayanMctpLockedFee'])('%s', (name) => {
		expect(verify(name).minOut).toBe(BigInt(VECTORS[name].toAmount))
	})

	test('mayanFastMctp: la comisión de protocolo de Mayan no va en la llamada, pero no llega al 0,1 %', () => {
		const { minOut } = verify('mayanFastMctp')
		const quoted = BigInt(VECTORS.mayanFastMctp.toAmount)
		expect(minOut).toBeGreaterThanOrEqual(quoted)
		expect((minOut - quoted) * 1000n).toBeLessThan(quoted)
	})
})

describe('intercambio en la misma red', () => {

	// El caso del hallazgo: la dirección del usuario en un campo decorativo, otro receptor y mínimo 0
	test('la dirección del usuario en `_transactionId` no sirve de nada: se mira a quién paga', () => {
		const data = forged('swapTokenToToken', (args) => {
			args[0] = '0x' + '0'.repeat(24) + OWNER.slice(2).toLowerCase()
			args[3] = ATTACKER
			args[4] = 0n
		})
		expect(data.toLowerCase()).toContain(OWNER.slice(2).toLowerCase())
		expect(() => verify('swapTokenToToken', data)).toThrow(/no paga a tu wallet/)
	})

	test('con el receptor bien y un mínimo irrisorio tampoco', () => {
		expect(() => verify('swapTokenToToken', forged('swapTokenToToken', (args) => { args[4] = 1n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('swapTokenToToken', forged('swapTokenToToken', (args) => { args[4] = 0n }))).toThrow(/menos de lo cotizado/)
	})

	// Con un permiso viejo y amplio al router (otra app con la misma frase), esto se lo llevaría
	test('no puede tomar de la wallet otro token, ni otro importe', () => {
		const other = forged('swapTokenToToken', (args) => { args[5].push({ ...args[5][0], sendingAssetId: OTHER_TOKEN, fromAmount: 5_000_000n }) })
		expect(() => verify('swapTokenToToken', other)).toThrow(/otro activo de tu wallet/)
		const more = forged('swapTokenToToken', (args) => { args[5][0].fromAmount += 1n })
		expect(() => verify('swapTokenToToken', more)).toThrow(/otro importe/)
		const twice = forged('swapTokenToToken', (args) => { args[5][1].requiresDeposit = true })
		expect(() => verify('swapTokenToToken', twice)).toThrow(/otro importe/)
		const none = forged('swapTokenToToken', (args) => { args[5][0].requiresDeposit = false })
		expect(() => verify('swapTokenToToken', none)).toThrow(/de dónde sale/)
	})

	test('el mínimo se mide en el activo del último paso: tiene que ser el del destino', () => {
		const data = forged('swapTokenToToken', (args) => { args[5][1].receivingAssetId = BASE_USDC })
		expect(() => verify('swapTokenToToken', data)).toThrow(/acaba en otro activo/)
	})

	test('la función tiene que ser la del par: nativo por token no es token por token', () => {
		expect(() => verify('swapTokenToNative', dataOf('swapTokenToNative'), { to: { chainId: 56, token: OTHER_TOKEN, decimals: 18 } })).toThrow(/otro par/)
		expect(() => verify('swapNativeToToken', dataOf('swapNativeToToken'), { token: OTHER_TOKEN })).toThrow(/otro par/)
		// Y un intercambio de la misma red no vale para un destino en otra
		expect(() => verify('swapTokenToToken', dataOf('swapTokenToToken'), { to: { chainId: 56, token: OTHER_TOKEN, decimals: 6 } })).toThrow(/no sale de esta red/)
	})

	test('las de un solo paso se leen igual (el contrato toma `fromAmount` diga lo que diga `requiresDeposit`)', () => {
		const { args } = decodeLifiCall(dataOf('swapTokenToToken'))
		const step = { ...args[5][1], fromAmount: 30_000_000n, requiresDeposit: false }
		const single = encodeLifiCall('swapTokensSingleV3ERC20ToERC20', [args[0], args[1], args[2], args[3], args[4], step])
		expect(verify('swapTokenToToken', single)).toEqual({ fn: 'swapTokensSingleV3ERC20ToERC20', minOut: BigInt(VECTORS.swapTokenToToken.toAmountMin) })
		const short = encodeLifiCall('swapTokensSingleV3ERC20ToERC20', [args[0], args[1], args[2], args[3], args[4], { ...step, fromAmount: 29_000_000n }])
		expect(() => verify('swapTokenToToken', short)).toThrow(/otro importe/)
	})
})

describe('codificación', () => {

	test('bytes de sobra o de menos: solo vale la forma canónica', () => {
		expect(() => verify('swapTokenToToken', dataOf('swapTokenToToken') + '00'.repeat(32))).toThrow(/no es la canónica/)
		expect(() => verify('swapTokenToToken', dataOf('swapTokenToToken').slice(0, -64))).toThrow(/mal formada/)
	})

	test('todas las reales son canónicas: leerlas y volver a escribirlas da los mismos bytes', () => {
		for (const [name, vector] of Object.entries(VECTORS)) {
			if (name === 'relayDepository' || name === 'stargate') continue
			const { name: fn, args } = decodeLifiCall(vector.build.tx.data)
			expect(encodeLifiCall(fn, args)).toBe(vector.build.tx.data.toLowerCase())
		}
	})
})

describe('puentes: lo común', () => {

	test('otra red de destino, o un puente para un cambio en la misma red', () => {
		expect(() => verify('nearTokenToToken', dataOf('nearTokenToToken'), { to: { chainId: 137, token: OTHER_TOKEN, decimals: 18 } })).toThrow(/va a otra red/)
		expect(() => verify('nearTokenToToken', dataOf('nearTokenToToken'), { to: { chainId: 8453, token: OTHER_TOKEN, decimals: 6 } })).toThrow(/misma red/)
		// Hacia Solana, el id propio de LI.FI
		expect(() => verify('nearToSolNative', forged('nearToSolNative', (args) => { args[0].destinationChainId = 1n }))).toThrow(/va a otra red/)
	})

	test('una llamada en destino pondría de receptor a un contrato: no se sabe leer, no se firma', () => {
		const err = (() => { try { verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[0].hasDestinationCall = true })) } catch (e) { return e } return null })()
		expect(err).toBeInstanceOf(EvmUnsupportedRouteError)
	})

	test('el receptor: la wallet en EVM, y hacia Solana la marca de «no EVM» de LI.FI', () => {
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[0].receiver = ATTACKER }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('nearToSolNative', forged('nearToSolNative', (args) => { args[0].receiver = OWNER }))).toThrow(/no paga a tu wallet/)
	})

	test('lo que sale de la wallet: el activo y el importe confirmados', () => {
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[1][0].sendingAssetId = OTHER_TOKEN }))).toThrow(/otro activo de tu wallet/)
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[1][0].fromAmount = 40_000_000n }))).toThrow(/otro importe/)
		// Lo que entra al puente es en lo que acaba el último paso
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[0].sendingAssetId = OTHER_TOKEN }))).toThrow(/acaba en otro activo/)
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[0].hasSourceSwaps = false }))).toThrow(/incoherentes/)
	})

	// Un «cobro de comisión» que se llevara el importe dejaría una orden diminuta con un mínimo de adorno
	test('si lo que cruza es lo que se paga, los pasos previos no se quedan más que las comisiones', () => {
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[0].minAmount = 29_000_000n }))).toThrow(/se queda parte del importe/)
		expect(verify('nearTokenToToken', forged('nearTokenToToken', (args) => { args[0].minAmount = 29_100_000n })).fn).toMatch(/NEARIntents/)
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { args[0].minAmount = 3_000_000n; last(args).outputAmountMultiplier = 10n ** 19n }))).toThrow(/se queda parte del importe/)
	})

	test('sin pasos previos el contrato toma `minAmount` de `sendingAssetId`: tienen que ser los confirmados', () => {
		const { args } = decodeLifiCall(dataOf('nearTokenToToken'))
		const direct = (bridge) => encodeLifiCall('startBridgeTokensViaNEARIntents', [{ ...args[0], hasSourceSwaps: false, minAmount: 30_000_000n, ...bridge }, args[2]])
		expect(verify('nearTokenToToken', direct({}))).toEqual({ fn: 'startBridgeTokensViaNEARIntents', minOut: BigInt(VECTORS.nearTokenToToken.toAmountMin) })
		expect(() => verify('nearTokenToToken', direct({ minAmount: 31_000_000n }))).toThrow(/otro importe/)
		expect(() => verify('nearTokenToToken', direct({ sendingAssetId: OTHER_TOKEN }))).toThrow(/otro activo de tu wallet/)
		expect(() => verify('nearTokenToToken', direct({ hasSourceSwaps: true }))).toThrow(/incoherentes/)
	})
})

describe('NEAR Intents', () => {

	test('quien cobra en Solana va en `nonEVMReceiver`', () => {
		expect(() => verify('nearToSolNative', forged('nearToSolNative', (args) => { last(args).nonEVMReceiver = SOL_ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('nearToSolNative', dataOf('nearToSolNative'), { receiver: 'GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9' })).toThrow(/no paga a tu wallet/)
		expect(() => verify('nearToSolNative', dataOf('nearToSolNative'), { receiver: 'no-es-una-direccion' })).toThrow(/formato desconocido/)
	})

	test('el activo que entrega: token, nativo (también el de Solana) o mint de Solana', () => {
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { last(args).destinationAsset = ATTACKER_WORD }))).toThrow(/entrega otro activo/)
		// Pedir el nativo y que la ruta entregue un token, y al revés
		expect(() => verify('nearNativeToNative', dataOf('nearNativeToNative'), { to: { chainId: 8453, token: BASE_USDC, decimals: 6 } })).toThrow(/entrega otro activo/)
		expect(() => verify('nearToSolToken', dataOf('nearToSolToken'), { to: { chainId: 'solana', token: null, decimals: 9 } })).toThrow(/entrega otro activo/)
		expect(() => verify('nearToSolToken', dataOf('nearToSolToken'), { to: { chainId: 'solana', token: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 } })).toThrow(/entrega otro activo/)
	})

	test('el mínimo, y a dónde vuelve el dinero si el puente no cumple', () => {
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { last(args).minAmountOut = 1n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { last(args).refundRecipient = ATTACKER }))).toThrow(/devoluciones/)
		expect(() => verify('nearTokenToToken', forged('nearTokenToToken', (args) => { last(args).depositAddress = '0x' + '0'.repeat(40) }))).toThrow(/dirección de depósito/)
	})
})

describe('Across', () => {

	// El contrato no comprueba el importe de salida: con uno irrisorio, cualquier relayer se queda la diferencia
	test('la salida es entrada × multiplicador: un multiplicador bajo no pasa', () => {
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { last(args).outputAmountMultiplier = 10n ** 17n }))).toThrow(/menos de lo cotizado/)
		// Con pasos previos el campo `outputAmount` no cuenta (el contrato lo recalcula): subirlo no arregla nada
		const data = forged('acrossTokenToToken', (args) => { last(args).outputAmountMultiplier = 1n; last(args).outputAmount = 10n ** 12n })
		expect(() => verify('acrossTokenToToken', data)).toThrow(/menos de lo cotizado/)
		// Ni vale bajar el mínimo de lo que entra al puente
		expect(() => verify('acrossSwapFirst', forged('acrossSwapFirst', (args) => { args[0].minAmount = 1000n }))).toThrow(/menos de lo cotizado/)
	})

	// Una orden que nadie cumple devuelve lo DEPOSITADO: con el importe perdido en un paso previo
	// y un multiplicador enorme, el «mínimo garantizado» sería de adorno
	test('la orden no puede prometer más de lo que deposita', () => {
		const data = forged('acrossSwapFirst', (args) => { args[0].minAmount = 1000n; last(args).outputAmountMultiplier = 10n ** 22n })
		expect(() => verify('acrossSwapFirst', data)).toThrow(/promete más de lo que deposita/)
		// Con decimales distintos a cada lado la cuenta es en unidades enteras: 6 → 18 multiplica por 1e12
		const { args } = decodeLifiCall(dataOf('acrossTokenToToken'))
		const direct = (outputAmount) => encodeLifiCall('startBridgeTokensViaAcrossV4', [{ ...args[0], hasSourceSwaps: false, minAmount: 30_000_000n, destinationChainId: 56n }, { ...args[2], receivingAssetId: '0x' + '0'.repeat(24) + '55d398326f99059ff775485246999027b3197955', outputAmount }])
		const toBsc = { to: { chainId: 56, token: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }, minOut: 29n * 10n ** 18n, quoted: 30n * 10n ** 18n }
		expect(verify('acrossTokenToToken', direct(29_900_000n * 10n ** 12n), toBsc).minOut).toBe(29_900_000n * 10n ** 12n)
		expect(() => verify('acrossTokenToToken', direct(30_000_001n * 10n ** 12n), toBsc)).toThrow(/promete más de lo que deposita/)
	})

	test('tras un intercambio a un activo que la wallet no conoce no hay con qué medirlo', () => {
		const data = forged('acrossSwapFirst', (args) => {
			args[0].sendingAssetId = OTHER_TOKEN
			args[1][1].receivingAssetId = OTHER_TOKEN
			last(args).sendingAssetId = '0x' + '0'.repeat(24) + OTHER_TOKEN.slice(2).toLowerCase()
		})
		expect(() => verify('acrossSwapFirst', data)).toThrow(EvmUnsupportedRouteError)
	})

	test('sin pasos previos manda `outputAmount`', () => {
		const { args } = decodeLifiCall(dataOf('acrossTokenToToken'))
		const direct = (across) => encodeLifiCall('startBridgeTokensViaAcrossV4', [{ ...args[0], hasSourceSwaps: false, minAmount: 30_000_000n }, { ...args[2], ...across }])
		expect(verify('acrossTokenToToken', direct({})).minOut).toBe(29_903_400n)
		expect(() => verify('acrossTokenToToken', direct({ outputAmount: 1n }))).toThrow(/menos de lo cotizado/)
	})

	test('receptor, devolución y activo de salida', () => {
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { last(args).receiverAddress = ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { last(args).refundAddress = ATTACKER_WORD }))).toThrow(/devoluciones/)
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { last(args).receivingAssetId = ATTACKER_WORD }))).toThrow(/entrega otro activo/)
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { last(args).sendingAssetId = ATTACKER_WORD }))).toThrow(/incoherentes/)
	})

	test('el nativo llega como su envuelto, que Across desenvuelve: el de ESA red y no otro token', () => {
		expect(verify('acrossNativeToNative').fn).toBe('swapAndStartBridgeTokensViaAcrossV4')
		expect(() => verify('acrossNativeToNative', dataOf('acrossNativeToNative'), { to: { chainId: 8453, token: BASE_USDC, decimals: 6 } })).toThrow(/entrega otro activo/)
		expect(() => verify('acrossTokenToToken', dataOf('acrossTokenToToken'), { to: { chainId: 8453, token: null, decimals: 18 } })).toThrow(/entrega otro activo/)
	})

	test('con mensaje para el destino, o hacia Solana, no se sabe leer', () => {
		expect(() => verify('acrossTokenToToken', forged('acrossTokenToToken', (args) => { last(args).message = '0x1234' }))).toThrow(EvmUnsupportedRouteError)
		const toSolana = forged('acrossTokenToToken', (args) => { args[0].destinationChainId = 1151111081099710n; args[0].receiver = '0x11f111f111f111F111f111f111F111f111f111F1' })
		expect(() => verify('acrossTokenToToken', toSolana, { to: { chainId: 'solana', token: null, decimals: 9 }, receiver: SOL_RECEIVER })).toThrow(EvmUnsupportedRouteError)
	})
})

describe('Polymer (CCTP)', () => {

	// El contrato no puede comprobar la cuenta de Solana en la que se acuña: lo hace la wallet
	test('hacia Solana se acuña en la cuenta de USDC del usuario, no en otra', () => {
		expect(() => verify('polymerToSol', forged('polymerToSol', (args) => { last(args).solanaReceiverATA = SOL_ATTACKER_WORD }))).toThrow(/tu cuenta de USDC/)
		expect(() => verify('polymerToSol', forged('polymerToSol', (args) => { last(args).nonEVMReceiver = SOL_ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		// La cuenta es la del receptor: con otro receptor, la de la ruta ya no cuadra
		expect(() => verify('polymerToSol', dataOf('polymerToSol'), { receiver: 'GM4eCsQuaLNXApYz6YYUQVMxajTaJ7dB4TbroFGBaou9' })).toThrow(/no paga a tu/)
	})

	test('llega lo que cruza menos las dos comisiones de la llamada', () => {
		expect(verify('polymerToEvm').minOut).toBe(29_925_000n - 2_993n)
		expect(() => verify('polymerToEvm', forged('polymerToEvm', (args) => { last(args).polymerTokenFee = 5_000_000n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('polymerToEvm', forged('polymerToEvm', (args) => { last(args).maxCCTPFee = 5_000_000n }))).toThrow(/menos de lo cotizado/)
		// Comisiones mayores que el importe: ni negativo ni cero
		expect(() => verify('polymerToEvm', forged('polymerToEvm', (args) => { last(args).polymerTokenFee = 10n ** 12n }))).toThrow(/menos de lo cotizado/)
	})

	test('solo USDC de Circle, en origen y en destino', () => {
		expect(() => verify('polymerToEvm', dataOf('polymerToEvm'), { to: { chainId: 8453, token: OTHER_TOKEN, decimals: 6 } })).toThrow(/entrega otro activo/)
		expect(() => verify('polymerToEvm', dataOf('polymerToEvm'), { to: { chainId: 8453, token: null, decimals: 18 } })).toThrow(/entrega otro activo/)
		expect(() => verify('polymerToEvm', dataOf('polymerToEvm'), { to: { chainId: 56, token: OTHER_TOKEN, decimals: 18 } })).toThrow(/va a otra red/)
		const toBsc = forged('polymerToEvm', (args) => { args[0].destinationChainId = 56n })
		expect(() => verify('polymerToEvm', toBsc, { to: { chainId: 56, token: OTHER_TOKEN, decimals: 18 } })).toThrow(EvmUnsupportedRouteError)
	})

	test('devoluciones y gancho de destino', () => {
		expect(() => verify('polymerToEvm', forged('polymerToEvm', (args) => { last(args).refundRecipient = ATTACKER }))).toThrow(/devoluciones/)
		expect(() => verify('polymerToEvm', forged('polymerToEvm', (args) => { last(args).hookData = '0x00' }))).toThrow(EvmUnsupportedRouteError)
	})
})

describe('Mayan', () => {

	test('Swift: receptor, red, activo y mínimo van dentro de la orden', () => {
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].destAddr = SOL_ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].destChainId = 2 }))).toThrow(/va a otra red/)
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].tokenOut = SOL_ATTACKER_WORD }))).toThrow(/entrega otro activo/)
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].minAmountOut = 1n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('mayanSwiftToEvmToken', forgedMayan('mayanSwiftToEvmToken', (args) => { args[2].tokenOut = ATTACKER_WORD }))).toThrow(/entrega otro activo/)
		expect(() => verify('mayanSwiftToEvmNative', dataOf('mayanSwiftToEvmNative'), { to: { chainId: 56, token: OTHER_TOKEN, decimals: 18 } })).toThrow(/entrega otro activo/)
	})

	test('Swift: el receptor declarado fuera de la orden también cuenta', () => {
		expect(() => verify('mayanSwiftToSol', forged('mayanSwiftToSol', (args) => { last(args).nonEVMReceiver = SOL_ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
	})

	// Quien cancela una orden que nadie cumplió se queda estas comisiones
	test('Swift: las devoluciones vuelven al usuario y las comisiones de cancelar no se comen el importe', () => {
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].trader = ATTACKER_WORD }))).toThrow(/devoluciones/)
		expect(() => verify('mayanSwiftToSol', forged('mayanSwiftToSol', (args) => { last(args).refundRecipient = ATTACKER }))).toThrow(/devoluciones/)
		// 29,925 USDT con 8 decimales = 2.992.500.000: el 5 % son 149.625.000
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].cancelFee = 149_625_001n; args[2].refundFee = 0n }))).toThrow(/cancelación desmesuradas/)
		expect(verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].cancelFee = 149_625_000n; args[2].refundFee = 0n })).fn).toMatch(/Mayan/)
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].referrerBps = 200 }))).toThrow(/referido/)
	})

	// Una orden que nadie puede cumplir acaba en cancelación: el dinero vuelve, menos las comisiones
	test('Swift: la orden tiene que poder cumplirse (ni caduca ya, ni pide más de lo cotizado)', () => {
		const deadline = Number(decodeMayanCall(last(decodeLifiCall(dataOf('mayanSwiftToSol')).args).protocolData).args[2].deadline)
		expect(deadline - VECTORS.mayanSwiftToSol.capturedAt).toBeGreaterThan(SWIFT_MIN_DEADLINE_S)
		expect(verify('mayanSwiftToSol', dataOf('mayanSwiftToSol'), {}, deadline - SWIFT_MIN_DEADLINE_S).fn).toMatch(/Mayan/)
		const err = (() => { try { verify('mayanSwiftToSol', dataOf('mayanSwiftToSol'), {}, deadline - SWIFT_MIN_DEADLINE_S + 1) } catch (e) { return e } return null })()
		expect(err).toBeInstanceOf(EvmRouteExpiredError)
		expect(err).toBeInstanceOf(EvmVerifyError)
		// 0,4267 SOL cotizados: con 8 decimales, el 103 % son 43.948.700
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].minAmountOut = 43_948_701n }))).toThrow(/exige más de lo cotizado/)
		expect(verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].minAmountOut = 43_948_700n })).minOut).toBe(439_487_000n)
		// Sin nada cotizado no hay con qué comparar por arriba
		expect(verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].minAmountOut = 10n ** 12n }), { quoted: null }).fn).toMatch(/Mayan/)
	})

	test('Swift con una carga para un contrato en destino no se sabe leer', () => {
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[2].payloadType = 2 }))).toThrow(EvmUnsupportedRouteError)
		expect(() => verify('mayanSwiftToSol', forgedMayan('mayanSwiftToSol', (args) => { args[3] = '0x1234' }))).toThrow(EvmUnsupportedRouteError)
	})

	test('Swift con nativo: Mayan lo envuelve antes, y solo en el envuelto de esa red y casi 1:1', () => {
		expect(() => verify('mayanSwiftNativeToSol', forged('mayanSwiftNativeToSol', (args) => { last(args).middleToken = BASE_USDC }))).toThrow(EvmUnsupportedRouteError)
		expect(() => verify('mayanSwiftNativeToSol', forged('mayanSwiftNativeToSol', (args) => { last(args).minMiddleAmount = 1n }))).toThrow(/paso intermedio/)
	})

	// Las comisiones de la orden van en unidades del activo que cruza, y aquí no es el que el usuario paga
	test('Swift tras un intercambio previo: la ruta es real, pero esta versión no la sabe medir', () => {
		const err = (() => { try { verify('mayanSwapFirst') } catch (e) { return e } return null })()
		expect(err).toBeInstanceOf(EvmUnsupportedRouteError)
		expect(err.message).toMatch(/intercambio previo/)
	})

	test('CCTP: receptor, dominio de destino y comisión', () => {
		expect(() => verify('mayanMctpToSol', forgedMayan('mayanMctpToSol', (args) => { args[4] = SOL_ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('mayanMctpToSol', forgedMayan('mayanMctpToSol', (args) => { args[5] = 6 }))).toThrow(/va a otra red/)
		expect(() => verify('mayanMctpToSol', forgedMayan('mayanMctpToSol', (args) => { args[2] = 20_000_000n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('mayanMctpToSol', forgedMayan('mayanMctpToSol', (args) => { args[6] = 2 }))).toThrow(EvmUnsupportedRouteError)
		expect(() => verify('mayanMctpToSol', dataOf('mayanMctpToSol'), { to: { chainId: 'solana', token: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 } })).toThrow(/entrega otro activo/)
	})

	test('CCTP con la comisión retenida en origen, y el rápido', () => {
		expect(() => verify('mayanMctpLockedFee', forgedMayan('mayanMctpLockedFee', (args) => { args[5] = ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('mayanMctpLockedFee', forgedMayan('mayanMctpLockedFee', (args) => { args[4] = 6 }))).toThrow(/va a otra red/)
		expect(() => verify('mayanMctpLockedFee', forgedMayan('mayanMctpLockedFee', (args) => { args[3] = 20_000_000n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('mayanFastMctp', forgedMayan('mayanFastMctp', (args) => { args[5] = SOL_ATTACKER_WORD }))).toThrow(/no paga a tu wallet/)
		expect(() => verify('mayanFastMctp', forgedMayan('mayanFastMctp', (args) => { args[3] = 20_000_000n }))).toThrow(/menos de lo cotizado/)
		expect(() => verify('mayanFastMctp', forgedMayan('mayanFastMctp', (args) => { args[8] = 255 }))).toThrow(/referido/)
	})

	test('la orden tiene que ser del activo que cruza, y por el importe que la faceta entrega', () => {
		expect(() => verify('mayanMctpToSol', forgedMayan('mayanMctpToSol', (args) => { args[0] = OTHER_TOKEN }))).toThrow(/otro activo/)
		expect(() => verify('mayanMctpToSol', forged('mayanMctpToSol', (args) => { last(args).mayanAmountIn = 1n }))).toThrow(/incoherente/)
	})

	test('una orden de Mayan que la wallet no sabe leer no se firma', () => {
		const err = (() => { try { verify('mayanSwiftToSol', forged('mayanSwiftToSol', (args) => { last(args).protocolData = '0x8e8d142b' + '0'.repeat(128) })) } catch (e) { return e } return null })()
		expect(err).toBeInstanceOf(EvmUnsupportedRouteError)
	})
})
