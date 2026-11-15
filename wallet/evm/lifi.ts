/**
 * Qué hace DE VERDAD la llamada al router de LI.FI. Módulo PURO (viem), tests en node.
 *
 * Antes bastaba con que la dirección del usuario apareciera en la calldata: una ruta con esa
 * dirección en un campo decorativo (`_transactionId`), otro receptor y mínimo 0 pasaba. Aquí
 * la llamada se DECODIFICA y solo se firma si es una función de la lista y, en esa función:
 *
 *   · lo que sale de la wallet es el activo y el importe confirmados, y nada más;
 *   · quien cobra es la wallet del usuario, en la red y en el activo del destino;
 *   · el mínimo que el contrato (o el puente) hace cumplir no queda por debajo de lo que se
 *     le enseñó al usuario. Ese mínimo, y no el del JSON del backend, es el que se pinta.
 *
 * Un mínimo alto no basta en los puentes que funcionan como una ORDEN (Across, Mayan Swift):
 * si nadie la cumple, lo que vuelve es lo depositado, no lo prometido. Ahí además se exige
 * que la ruta no se quede nada por el camino antes de cruzar, que la orden sea cumplible (ni
 * promete más de lo que deposita, ni exige más de lo cotizado, ni caduca ya) y que cancelarla
 * no cueste casi todo el importe.
 *
 * Una función fuera de la lista NO se firma, aunque sea de LI.FI. No es un descuido: hay
 * puentes cuyo destino no consta en lo que se firma (Relay Depository lleva solo un
 * identificador de orden: a quién se paga lo decide un sistema fuera de la cadena) y ahí no
 * hay nada que comprobar. Los propios contratos lo avisan: «only use LI.FI backend-generated
 * calldata to avoid potential loss of funds» (AcrossFacetV4, sobre el importe de salida).
 *
 * Añadir una función = leer su contrato, ver qué ata y qué no, y capturar una tx real para
 * `lifiVectors.json`. Formas leídas de `lifinance/contracts@bb5123945f3f` (13 nov 2026);
 * selectores comprobados EN VIVO en el Diamond de Ethereum, BNB Chain, Polygon y Base
 * (`facetAddress`, 14 nov 2026).
 */
import { decodeFunctionData, encodeFunctionData, parseAbi, toFunctionSelector } from 'viem'
import type { Abi, AbiFunction } from 'viem'

import { associatedTokenAddress, pubkeyBytes, TOKEN_PROGRAM } from '../solana/codec'
import { EvmVerifyError } from './tx'

/** La ruta puede ser buena, pero esta versión no sabe comprobarla: no se firma. */
export class EvmUnsupportedRouteError extends EvmVerifyError {
	constructor(message: string) { super(message); this.name = 'EvmUnsupportedRouteError' }
}

/** La ruta era buena, pero se ha hecho vieja: hay que volver a cotizar. */
export class EvmRouteExpiredError extends EvmVerifyError {
	constructor(message: string) { super(message); this.name = 'EvmRouteExpiredError' }
}

/** El id que LI.FI le da a Solana (no tiene chainId EVM). */
export const LIFI_SOLANA_CHAIN_ID = 1151111081099710n

/** A dónde y en qué tiene que llegar. `token: null` = el nativo de esa red. */
export type LifiDestination = { chainId: number | 'solana', token: string | null, decimals: number }

/** Lo que la wallet sabe por su cuenta de la operación. Nada de esto sale del backend. */
export type LifiExpectation = {
	/** Red de origen. */
	chainId: number
	/** Quien paga y firma. */
	owner: string
	/** Quien cobra: la misma wallet EVM, o la de Solana del usuario si la ruta cruza allí. */
	receiver: string
	/** Lo que se paga: null = nativo. */
	token: string | null
	decimals: number
	amountIn: bigint
	to: LifiDestination
	/** Lo mínimo que la cadena tiene que garantizar, en unidades del activo de destino. */
	minOut: bigint
	/** Lo que la ruta prometía entregar cuando el usuario la eligió; null si no se enseñó nada. */
	quoted: bigint | null
}

export type LifiVerified = {
	/** La función del router que se va a llamar. */
	fn: string
	/** El mínimo que el contrato o el puente hacen cumplir, en unidades del activo de destino. */
	minOut: bigint
}

type SwapData = { callTo: string, approveTo: string, sendingAssetId: string, receivingAssetId: string, fromAmount: bigint, callData: `0x${string}`, requiresDeposit: boolean }
type BridgeData = {
	transactionId: string, bridge: string, integrator: string, referrer: string, sendingAssetId: string, receiver: string
	minAmount: bigint, destinationChainId: bigint, hasSourceSwaps: boolean, hasDestinationCall: boolean
}
type NearData = { nonEVMReceiver: string, destinationAsset: string, depositAddress: string, quoteId: string, deadline: bigint, minAmountOut: bigint, refundRecipient: string, signature: string }
type AcrossData = {
	receiverAddress: string, refundAddress: string, sendingAssetId: string, receivingAssetId: string, outputAmount: bigint, outputAmountMultiplier: bigint
	exclusiveRelayer: string, quoteTimestamp: number, fillDeadline: number, exclusivityParameter: number, message: string
}
type PolymerData = { polymerTokenFee: bigint, maxCCTPFee: bigint, nonEVMReceiver: string, solanaReceiverATA: string, minFinalityThreshold: number, refundRecipient: string, hookData: string }
type MayanData = {
	nonEVMReceiver: string, mayanProtocol: string, protocolData: `0x${string}`, swapProtocol: string, swapData: string
	middleToken: string, minMiddleAmount: bigint, refundRecipient: string, mayanAmountIn: bigint
}
type SwiftParams = {
	payloadType: number, trader: string, destAddr: string, destChainId: number, referrerAddr: string, tokenOut: string, minAmountOut: bigint
	gasDrop: bigint, cancelFee: bigint, refundFee: bigint, deadline: bigint, referrerBps: number, auctionMode: number, random: string
}

const STRUCTS = [
	'struct BridgeData { bytes32 transactionId; string bridge; string integrator; address referrer; address sendingAssetId; address receiver; uint256 minAmount; uint256 destinationChainId; bool hasSourceSwaps; bool hasDestinationCall; }',
	'struct SwapData { address callTo; address approveTo; address sendingAssetId; address receivingAssetId; uint256 fromAmount; bytes callData; bool requiresDeposit; }',
	'struct NEARIntentsData { bytes32 nonEVMReceiver; bytes32 destinationAsset; address depositAddress; bytes32 quoteId; uint256 deadline; uint256 minAmountOut; address refundRecipient; bytes signature; }',
	'struct AcrossV4Data { bytes32 receiverAddress; bytes32 refundAddress; bytes32 sendingAssetId; bytes32 receivingAssetId; uint256 outputAmount; uint128 outputAmountMultiplier; bytes32 exclusiveRelayer; uint32 quoteTimestamp; uint32 fillDeadline; uint32 exclusivityParameter; bytes message; }',
	'struct PolymerCCTPData { uint256 polymerTokenFee; uint256 maxCCTPFee; bytes32 nonEVMReceiver; bytes32 solanaReceiverATA; uint32 minFinalityThreshold; address refundRecipient; bytes hookData; }',
	'struct MayanData { bytes32 nonEVMReceiver; address mayanProtocol; bytes protocolData; address swapProtocol; bytes swapData; address middleToken; uint256 minMiddleAmount; address refundRecipient; uint256 mayanAmountIn; }',
]

/** La lista blanca: fuera de estas 14 funciones del Diamond, nada se firma. */
const LIFI_FUNCTIONS = [
	// GenericSwapFacetV3: intercambio dentro de una misma red
	'function swapTokensSingleV3ERC20ToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData _swapData)',
	'function swapTokensSingleV3ERC20ToNative(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData _swapData)',
	'function swapTokensSingleV3NativeToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData _swapData) payable',
	'function swapTokensMultipleV3ERC20ToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData[] _swapData)',
	'function swapTokensMultipleV3ERC20ToNative(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData[] _swapData)',
	'function swapTokensMultipleV3NativeToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData[] _swapData) payable',
	// Puentes: los que atan receptor, activo de destino e importe en lo que se firma
	'function startBridgeTokensViaNEARIntents(BridgeData _bridgeData, NEARIntentsData _nearData) payable',
	'function swapAndStartBridgeTokensViaNEARIntents(BridgeData _bridgeData, SwapData[] _swapData, NEARIntentsData _nearData) payable',
	'function startBridgeTokensViaAcrossV4(BridgeData _bridgeData, AcrossV4Data _acrossData) payable',
	'function swapAndStartBridgeTokensViaAcrossV4(BridgeData _bridgeData, SwapData[] _swapData, AcrossV4Data _acrossData) payable',
	'function startBridgeTokensViaPolymerCCTP(BridgeData _bridgeData, PolymerCCTPData _polymerData)',
	'function swapAndStartBridgeTokensViaPolymerCCTP(BridgeData _bridgeData, SwapData[] _swapData, PolymerCCTPData _polymerData) payable',
	'function startBridgeTokensViaMayan(BridgeData _bridgeData, MayanData _mayanData) payable',
	'function swapAndStartBridgeTokensViaMayan(BridgeData _bridgeData, SwapData[] _swapData, MayanData _mayanData) payable',
]

/**
 * Las órdenes de Mayan que la wallet sabe leer. La faceta de LI.FI ya exige en la cadena que
 * el receptor de la orden sea el declarado; lo demás (activo, mínimo, comisiones) va dentro
 * de `protocolData` y solo lo comprueba quien la decodifica.
 */
const MAYAN_FUNCTIONS = [
	'struct SwiftOrderParams { uint8 payloadType; bytes32 trader; bytes32 destAddr; uint16 destChainId; bytes32 referrerAddr; bytes32 tokenOut; uint64 minAmountOut; uint64 gasDrop; uint64 cancelFee; uint64 refundFee; uint64 deadline; uint8 referrerBps; uint8 auctionMode; bytes32 random; }',
	// Swift v2: subasta entre solvers
	'function createOrderWithToken(address tokenIn, uint256 amountIn, SwiftOrderParams params, bytes customPayload)',
	// MCTP: USDC quemado aquí y acuñado allí por Circle
	'function bridgeWithFee(address tokenIn, uint256 amountIn, uint64 redeemFee, uint64 gasDrop, bytes32 destAddr, uint32 destDomain, uint8 payloadType, bytes customPayload)',
	'function bridgeWithLockedFee(address tokenIn, uint256 amountIn, uint64 gasDrop, uint256 redeemFee, uint32 destDomain, bytes32 destAddr)',
	// MCTP rápido
	'function bridge(address tokenIn, uint256 amountIn, uint64 redeemFee, uint256 circleMaxFee, uint64 gasDrop, bytes32 destAddr, uint32 destDomain, bytes32 referrerAddress, uint8 referrerBps, uint8 payloadType, uint32 minFinalityThreshold, bytes customPayload)',
]

type Catalog = { abi: Abi, bySelector: Map<string, string> }
const catalog = (signatures: string[]): Catalog => {
	const abi = parseAbi(signatures) as Abi
	const bySelector = new Map<string, string>()
	for (const item of abi) { if (item.type === 'function') bySelector.set(toFunctionSelector(item as AbiFunction), item.name) }
	return { abi, bySelector }
}
// Perezosos: analizar las firmas cuesta y solo hace falta al ir a firmar un swap
let lifiCatalog: Catalog | null = null
let mayanCatalog: Catalog | null = null
const lifi = (): Catalog => (lifiCatalog ??= catalog([...STRUCTS, ...LIFI_FUNCTIONS]))
const mayan = (): Catalog => (mayanCatalog ??= catalog(MAYAN_FUNCTIONS))

/** Selector → nombre de las funciones admitidas. Exportado para tests. */
export const lifiSelectors = (): ReadonlyMap<string, string> => lifi().bySelector
export const mayanSelectors = (): ReadonlyMap<string, string> => mayan().bySelector

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_WORD = `0x${'0'.repeat(64)}`
/** Lo que LI.FI pone en `receiver` cuando quien cobra no es una dirección EVM. */
const NON_EVM_ADDRESS = '0x11f111f111f111f111f111f111f111f111f111f1'
/** Cómo nombra NEAR Intents al nativo de cualquier red (también al de Solana). */
const NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

/** El nativo envuelto de cada red: Across paga en él (y lo desenvuelve a una cuenta externa). */
const WRAPPED_NATIVE: Record<number, string> = {
	1: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
	56: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
	137: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
	8453: '0x4200000000000000000000000000000000000006',
}
/** El USDC de Circle (el único que CCTP quema y acuña) y el dominio de cada red. */
const CCTP_USDC: Record<number, string> = {
	1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
	137: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
	8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
}
const CCTP_USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const CCTP_DOMAIN: Record<number, number> = { 1: 0, 8453: 6, 137: 7 }
const CCTP_DOMAIN_SOLANA = 5
/** Los ids de red de Wormhole, que es como Mayan Swift nombra el destino. */
const WORMHOLE_CHAIN: Record<number, number> = { 1: 2, 56: 4, 137: 5, 8453: 30 }
const WORMHOLE_SOLANA = 1

/**
 * Lo que la ruta puede quedarse antes de cruzar cuando lo que cruza es el mismo activo que se
 * paga: LI.FI cobra el 0,25 % y QvaPay su comisión (0,4 %). Nunca más del 3 %.
 */
const MAX_SOURCE_FEES_PERCENT = 3n
/**
 * Mayan Swift: comisiones de cancelar y devolver, como mucho el 5 % de la orden. Las reales
 * van de céntimos a unos 0,40 USD cuando Ethereum es origen o destino (1,3 % de 30 USD).
 */
const SWIFT_MAX_CANCEL_FEES_DIVISOR = 20n
/**
 * Mayan Swift: una orden nace con 7-25 min de vida. Con menos de 3 por delante puede caducar
 * antes de que nadie la cumpla, y recuperar el dinero cuesta las comisiones de cancelación.
 */
export const SWIFT_MIN_DEADLINE_S = 180
/** Una orden que exige más que esto sobre lo cotizado no la cumple nadie. */
const MAX_OVER_QUOTE_PERCENT = 3n
/** Mayan: comisión de referido admitida, en puntos básicos. */
const MAYAN_MAX_REFERRER_BPS = 100
/** Across reparte la salida así: `entrada × multiplicador / 1e18`. */
const ACROSS_MULTIPLIER_BASE = 10n ** 18n

const lower = (value: string) => String(value).toLowerCase()
const eq = (a: string, b: string) => lower(a) === lower(b)
const isZero = (address: string) => eq(address, ZERO_ADDRESS)
const pad32 = (address: string) => `0x${lower(address).replace(/^0x/, '').padStart(64, '0')}`
const toHex = (bytes: Uint8Array) => `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
const solana32 = (address: string) => {
	try { return toHex(pubkeyBytes(address)) } catch { throw new EvmVerifyError('dirección de Solana con formato desconocido') }
}
/** El activo que se paga, como lo nombra LI.FI (el nativo es la dirección cero). */
const assetIn = (expected: LifiExpectation) => expected.token ?? ZERO_ADDRESS
/** Quien cobra, como palabra de 32 bytes. */
const receiver32 = (expected: LifiExpectation) => (expected.to.chainId === 'solana' ? solana32(expected.receiver) : pad32(expected.receiver))
/** Unidades con la precisión de 8 decimales en la que Mayan anota sus órdenes. */
const scale8 = (decimals: number) => (decimals > 8 ? 10n ** BigInt(decimals - 8) : 1n)

/**
 * Decodifica y exige la codificación CANÓNICA: volver a codificar lo leído tiene que dar los
 * mismos bytes. Sin eso cabrían bytes de sobra o regiones solapadas que este decodificador
 * ignora y que otro lector (hay facetas que leen `protocolData` por posiciones fijas) no.
 */
const decodeStrict = ({ abi, bySelector }: Catalog, data: string, what: string): { name: string, args: readonly unknown[] } => {
	const hex = lower(data) as `0x${string}`
	if (!/^0x[0-9a-f]{8,}$/.test(hex) || hex.length % 2 !== 0) throw new EvmVerifyError(`${what} inválida`)
	const selector = hex.slice(0, 10)
	if (!bySelector.has(selector)) throw new EvmUnsupportedRouteError(`${what}: función fuera de la lista (${selector})`)
	let decoded: { functionName: string, args?: readonly unknown[] }
	let again: string
	try {
		decoded = decodeFunctionData({ abi, data: hex }) as { functionName: string, args?: readonly unknown[] }
		again = encodeFunctionData({ abi, functionName: decoded.functionName, args: decoded.args as unknown[] })
	} catch {
		throw new EvmVerifyError(`${what} mal formada`)
	}
	if (lower(again) !== hex) throw new EvmVerifyError(`${what} con una codificación que no es la canónica`)
	return { name: decoded.functionName, args: decoded.args ?? [] }
}

/** Para tests: lee una llamada del router y la vuelve a escribir (así se fabrican variantes). */
export const decodeLifiCall = (data: string) => decodeStrict(lifi(), data, 'calldata')
export const encodeLifiCall = (name: string, args: readonly unknown[]): `0x${string}` => encodeFunctionData({ abi: lifi().abi, functionName: name, args: args as unknown[] })
export const decodeMayanCall = (data: string) => decodeStrict(mayan(), data, 'orden de Mayan')
export const encodeMayanCall = (name: string, args: readonly unknown[]): `0x${string}` => encodeFunctionData({ abi: mayan().abi, functionName: name, args: args as unknown[] })

/**
 * Los pasos previos (cobro de comisión, intercambio en un DEX). Lo que el router TOMA de la
 * wallet son los pasos con `requiresDeposit`: tienen que ser del activo confirmado y sumar el
 * importe exacto. Sin esto, un permiso viejo y amplio al router de otro token (de otra app
 * con la misma frase) dejaría que una ruta se lo llevara. El último paso tiene que acabar en
 * `finalAsset`, que es en lo que el contrato mide el mínimo.
 */
const checkSteps = (steps: SwapData[], expected: LifiExpectation, finalAsset: string): void => {
	if (!steps.length) throw new EvmVerifyError('la ruta no trae pasos')
	const deposits = steps.filter(step => step.requiresDeposit)
	if (!deposits.length) throw new EvmVerifyError('la ruta no dice de dónde sale el importe')
	let total = 0n
	for (const step of deposits) {
		if (!eq(step.sendingAssetId, assetIn(expected))) throw new EvmVerifyError('la ruta tomaría otro activo de tu wallet')
		total += step.fromAmount
	}
	if (total !== expected.amountIn) throw new EvmVerifyError('la ruta toma otro importe')
	if (!eq(steps[steps.length - 1].receivingAssetId, finalAsset)) throw new EvmVerifyError('la ruta acaba en otro activo')
}

/** Las seis de GenericSwapFacetV3: qué paga y qué entrega cada una. */
const SWAPS: Record<string, { fromNative: boolean, toNative: boolean, single: boolean }> = {
	swapTokensSingleV3ERC20ToERC20: { fromNative: false, toNative: false, single: true },
	swapTokensSingleV3ERC20ToNative: { fromNative: false, toNative: true, single: true },
	swapTokensSingleV3NativeToERC20: { fromNative: true, toNative: false, single: true },
	swapTokensMultipleV3ERC20ToERC20: { fromNative: false, toNative: false, single: false },
	swapTokensMultipleV3ERC20ToNative: { fromNative: false, toNative: true, single: false },
	swapTokensMultipleV3NativeToERC20: { fromNative: true, toNative: false, single: false },
}

/** Intercambio en la misma red: el contrato entrega a `_receiver` y revierte por debajo de `_minAmountOut`. */
const verifySwap = (name: string, args: readonly unknown[], expected: LifiExpectation): bigint => {
	const shape = SWAPS[name]
	const receiver = args[3] as string
	const minAmountOut = args[4] as bigint
	const steps = shape.single ? [args[5] as SwapData] : (args[5] as SwapData[])
	if (expected.to.chainId !== expected.chainId) throw new EvmVerifyError('la ruta no sale de esta red')
	if (shape.fromNative !== (expected.token === null) || shape.toNative !== (expected.to.token === null)) throw new EvmVerifyError('la ruta es de otro par')
	if (!eq(receiver, expected.receiver)) throw new EvmVerifyError('la ruta no paga a tu wallet')
	// En las de un solo paso el contrato toma `fromAmount` lo diga `requiresDeposit` o no
	const taken = shape.single ? steps.map(step => ({ ...step, requiresDeposit: true })) : steps
	checkSteps(taken, expected, expected.to.token ?? ZERO_ADDRESS)
	return minAmountOut
}

type BridgeCall = { expected: LifiExpectation, bridge: BridgeData, hasSwaps: boolean, now: number }

/** Decimales del activo que entra al puente, cuando la wallet los sabe sin fiarse de nadie. */
const bridgedDecimals = ({ expected, bridge }: BridgeCall): number | null => {
	if (eq(bridge.sendingAssetId, assetIn(expected))) return expected.decimals
	if (isZero(bridge.sendingAssetId)) return 18
	const usdc = CCTP_USDC[expected.chainId]
	return usdc && eq(bridge.sendingAssetId, usdc) ? 6 : null
}

/** Lo común a todo puente: destino, receptor y de dónde sale el dinero. */
const checkBridge = ({ expected, bridge, hasSwaps }: BridgeCall, steps: SwapData[] | null): void => {
	const { to } = expected
	if (to.chainId === expected.chainId) throw new EvmVerifyError('un puente para un cambio dentro de la misma red')
	if (bridge.destinationChainId !== (to.chainId === 'solana' ? LIFI_SOLANA_CHAIN_ID : BigInt(to.chainId))) throw new EvmVerifyError('la ruta va a otra red')
	// Una llamada en destino pone de receptor a un contrato y esconde el pago real en un mensaje
	if (bridge.hasDestinationCall) throw new EvmUnsupportedRouteError('ruta con una llamada en destino')
	if (!eq(bridge.receiver, to.chainId === 'solana' ? NON_EVM_ADDRESS : expected.receiver)) throw new EvmVerifyError('la ruta no paga a tu wallet')
	if (bridge.minAmount <= 0n) throw new EvmVerifyError('la ruta no lleva importe')
	if (bridge.hasSourceSwaps !== hasSwaps) throw new EvmVerifyError('pasos previos incoherentes')
	if (steps) {
		checkSteps(steps, expected, bridge.sendingAssetId)
		// Si lo que cruza es lo mismo que se paga, los pasos previos solo cobran comisiones: un
		// «cobro» que se llevara el importe dejaría una orden diminuta con un mínimo de adorno
		if (eq(bridge.sendingAssetId, assetIn(expected)) && bridge.minAmount * 100n < expected.amountIn * (100n - MAX_SOURCE_FEES_PERCENT)) {
			throw new EvmVerifyError('la ruta se queda parte del importe antes de cruzar')
		}
	} else {
		// Sin pasos previos el contrato toma `minAmount` de `sendingAssetId`, tal cual
		if (!eq(bridge.sendingAssetId, assetIn(expected))) throw new EvmVerifyError('la ruta tomaría otro activo de tu wallet')
		if (bridge.minAmount !== expected.amountIn) throw new EvmVerifyError('la ruta toma otro importe')
	}
}

/**
 * NEAR Intents: el dinero va a una dirección de depósito de un solo uso. Lo que la ata al
 * receptor, al activo y al mínimo es una firma del backend de LI.FI que el contrato comprueba
 * sobre estos mismos campos (`_verifySignature`): con otro receptor u otro mínimo, revierte.
 */
const verifyNear = ({ expected }: BridgeCall, near: NearData): bigint => {
	const { to } = expected
	if (to.chainId === 'solana' && lower(near.nonEVMReceiver) !== receiver32(expected)) throw new EvmVerifyError('la ruta no paga a tu wallet')
	const asset = to.token === null ? pad32(NATIVE_SENTINEL) : to.chainId === 'solana' ? solana32(to.token) : pad32(to.token)
	if (lower(near.destinationAsset) !== asset) throw new EvmVerifyError('la ruta entrega otro activo')
	// Si el puente no cumple, la devolución es a esta dirección
	if (!eq(near.refundRecipient, expected.owner)) throw new EvmVerifyError('las devoluciones no vuelven a tu wallet')
	if (isZero(near.depositAddress)) throw new EvmVerifyError('la ruta no lleva dirección de depósito')
	return near.minAmountOut
}

/**
 * Across: el contrato NO comprueba el importe de salida («only use LI.FI backend-generated
 * calldata»), y con uno irrisorio cualquier relayer se queda la diferencia. Con pasos previos
 * la salida es `entrada × multiplicador / 1e18`; sin ellos, el campo `outputAmount`.
 */
const verifyAcross = (call: BridgeCall, across: AcrossData): bigint => {
	const { expected, bridge, hasSwaps } = call
	const { to } = expected
	if (to.chainId === 'solana') throw new EvmUnsupportedRouteError('Across hacia Solana')
	const asset = to.token ?? WRAPPED_NATIVE[to.chainId]
	if (!asset) throw new EvmUnsupportedRouteError('Across hacia una red sin nativo envuelto conocido')
	if (lower(across.receiverAddress) !== pad32(expected.receiver)) throw new EvmVerifyError('la ruta no paga a tu wallet')
	if (lower(across.refundAddress) !== pad32(expected.owner)) throw new EvmVerifyError('las devoluciones no vuelven a tu wallet')
	if (lower(across.receivingAssetId) !== pad32(asset)) throw new EvmVerifyError('la ruta entrega otro activo')
	if (lower(across.message) !== '0x') throw new EvmUnsupportedRouteError('ruta con una llamada en destino')
	// En nativo el contrato usa su propio envuelto y no mira este campo
	if (!isZero(bridge.sendingAssetId) && lower(across.sendingAssetId) !== pad32(bridge.sendingAssetId)) throw new EvmVerifyError('activos de la ruta incoherentes')
	const output = hasSwaps ? bridge.minAmount * across.outputAmountMultiplier / ACROSS_MULTIPLIER_BASE : across.outputAmount
	// Across cruza un activo por su igual (USDC por USDC, ETH por ETH) y cobra por ello: nunca
	// entrega más de lo que entra. Una orden que «garantiza» más de lo que deposita no la cumple
	// nadie, y lo que vuelve entonces es solo lo depositado (lo demás se quedó en un paso previo)
	const decimals = bridgedDecimals(call)
	if (decimals === null) throw new EvmUnsupportedRouteError('Across tras un intercambio a un activo que la wallet no conoce')
	if (output * 10n ** BigInt(decimals) > bridge.minAmount * 10n ** BigInt(to.decimals)) throw new EvmVerifyError('la ruta promete más de lo que deposita')
	return output
}

/** ¿Origen y destino son el USDC de Circle? CCTP no mueve otra cosa. */
const requireCctp = ({ expected, bridge }: BridgeCall): void => {
	const { to } = expected
	const sourceUsdc = CCTP_USDC[expected.chainId]
	const targetUsdc = to.chainId === 'solana' ? CCTP_USDC_SOLANA : CCTP_USDC[to.chainId]
	if (!sourceUsdc || !targetUsdc) throw new EvmUnsupportedRouteError('CCTP en una red sin USDC de Circle')
	if (!eq(bridge.sendingAssetId, sourceUsdc)) throw new EvmVerifyError('lo que cruza no es USDC')
	if (to.token === null || (to.chainId === 'solana' ? to.token !== targetUsdc : !eq(to.token, targetUsdc))) throw new EvmVerifyError('la ruta entrega otro activo')
}

/**
 * Polymer (CCTP): USDC quemado aquí y acuñado allí, menos las dos comisiones que van en la
 * llamada. Hacia Solana se acuña en una cuenta de token que el contrato no puede comprobar
 * («relies entirely on trusted calldata generation»): tiene que ser la del usuario.
 */
const verifyPolymer = (call: BridgeCall, polymer: PolymerData): bigint => {
	const { expected, bridge, hasSwaps } = call
	requireCctp(call)
	if (lower(polymer.hookData) !== '0x') throw new EvmUnsupportedRouteError('ruta con una llamada en destino')
	if (expected.to.chainId === 'solana') {
		if (lower(polymer.nonEVMReceiver) !== receiver32(expected)) throw new EvmVerifyError('la ruta no paga a tu wallet')
		const account = associatedTokenAddress(expected.receiver, CCTP_USDC_SOLANA, TOKEN_PROGRAM)
		if (lower(polymer.solanaReceiverATA) !== solana32(account)) throw new EvmVerifyError('la ruta no paga a tu cuenta de USDC')
	}
	if (hasSwaps && !eq(polymer.refundRecipient, expected.owner)) throw new EvmVerifyError('las devoluciones no vuelven a tu wallet')
	return bridge.minAmount - polymer.polymerTokenFee - polymer.maxCCTPFee
}

/**
 * Mayan: la faceta exige en la cadena que el receptor de la orden sea el declarado, pero el
 * activo, el mínimo y las comisiones van dentro de `protocolData`.
 */
const verifyMayan = (call: BridgeCall, data: MayanData): bigint => {
	const { expected, bridge, hasSwaps, now } = call
	const { to } = expected
	if (!eq(data.refundRecipient, expected.owner)) throw new EvmVerifyError('las devoluciones no vuelven a tu wallet')
	if (to.chainId === 'solana' && lower(data.nonEVMReceiver) !== receiver32(expected)) throw new EvmVerifyError('la ruta no paga a tu wallet')
	// Con pasos previos la faceta entrega a Mayan `mayanAmountIn` y devuelve lo que sobre
	if (hasSwaps && data.mayanAmountIn !== bridge.minAmount) throw new EvmVerifyError('importe del puente incoherente')
	const amount = bridge.minAmount
	const native = isZero(bridge.sendingAssetId)
	if (native) {
		// Mayan envuelve el nativo antes de crear la orden: solo el envuelto de esta red, casi 1:1
		const wrapped = WRAPPED_NATIVE[expected.chainId]
		if (!wrapped || isZero(data.swapProtocol) || !eq(data.middleToken, wrapped)) throw new EvmUnsupportedRouteError('Mayan con nativo por un camino no admitido')
		if (data.minMiddleAmount * 100n < amount * 99n) throw new EvmVerifyError('la ruta admite perder en el paso intermedio')
	}

	const { name, args } = decodeMayanCall(data.protocolData)
	const tokenIn = args[0] as string
	if (!native && !eq(tokenIn, bridge.sendingAssetId)) throw new EvmVerifyError('la orden es de otro activo')

	if (name === 'createOrderWithToken') {
		const params = args[2] as SwiftParams
		// Las comisiones de la orden van en unidades del activo que cruza: hay que saber sus decimales
		if (!eq(bridge.sendingAssetId, assetIn(expected))) throw new EvmUnsupportedRouteError('Mayan Swift tras un intercambio previo')
		if (params.payloadType !== 1 || lower(args[3] as string) !== '0x') throw new EvmUnsupportedRouteError('ruta con una llamada en destino')
		// Si nadie cumple la orden, lo que se devuelve va al `trader`
		if (lower(params.trader) !== pad32(expected.owner)) throw new EvmVerifyError('las devoluciones no vuelven a tu wallet')
		if (lower(params.destAddr) !== receiver32(expected)) throw new EvmVerifyError('la ruta no paga a tu wallet')
		if (params.destChainId !== (to.chainId === 'solana' ? WORMHOLE_SOLANA : WORMHOLE_CHAIN[to.chainId])) throw new EvmVerifyError('la ruta va a otra red')
		const asset = to.token === null ? ZERO_WORD : to.chainId === 'solana' ? solana32(to.token) : pad32(to.token)
		if (lower(params.tokenOut) !== asset) throw new EvmVerifyError('la ruta entrega otro activo')
		// Quien cancela una orden que nadie cumplió se queda estas dos comisiones: con una
		// orden imposible de cumplir y comisiones enormes, eso sería casi todo el importe
		const order = amount / scale8(native ? 18 : expected.decimals)
		if ((params.cancelFee + params.refundFee) * SWIFT_MAX_CANCEL_FEES_DIVISOR > order) throw new EvmVerifyError('comisiones de cancelación desmesuradas')
		if (params.referrerBps > MAYAN_MAX_REFERRER_BPS) throw new EvmVerifyError('comisión de referido desmesurada')
		// Una orden que nadie puede cumplir (caduca ya, o pide más de lo cotizado) acaba en
		// cancelación: el dinero vuelve, menos esas comisiones y después de esperar
		if (params.deadline < BigInt(now + SWIFT_MIN_DEADLINE_S)) throw new EvmRouteExpiredError('la orden caduca antes de poder cumplirse')
		const guaranteed = params.minAmountOut * scale8(to.decimals)
		if (expected.quoted !== null && guaranteed * 100n > expected.quoted * (100n + MAX_OVER_QUOTE_PERCENT)) throw new EvmVerifyError('la ruta exige más de lo cotizado')
		return guaranteed
	}

	// Las tres de CCTP: llega el USDC que cruza menos las comisiones que van en la llamada
	requireCctp(call)
	const domain = to.chainId === 'solana' ? CCTP_DOMAIN_SOLANA : CCTP_DOMAIN[to.chainId as number]
	const check = (destAddr: string, destDomain: number) => {
		if (lower(destAddr) !== receiver32(expected)) throw new EvmVerifyError('la ruta no paga a tu wallet')
		if (destDomain !== domain) throw new EvmVerifyError('la ruta va a otra red')
	}
	const plain = (payloadType: number, customPayload: string) => {
		if (payloadType !== 1 || lower(customPayload) !== '0x') throw new EvmUnsupportedRouteError('ruta con una llamada en destino')
	}
	if (name === 'bridgeWithFee') {
		check(args[4] as string, args[5] as number)
		plain(args[6] as number, args[7] as string)
		return amount - (args[2] as bigint)
	}
	if (name === 'bridgeWithLockedFee') {
		check(args[5] as string, args[4] as number)
		return amount - (args[3] as bigint)
	}
	// `bridge` (MCTP rápido)
	check(args[5] as string, args[6] as number)
	plain(args[9] as number, args[11] as string)
	const referrerBps = args[8] as number
	if (referrerBps > MAYAN_MAX_REFERRER_BPS) throw new EvmVerifyError('comisión de referido desmesurada')
	return amount - (args[2] as bigint) - (args[3] as bigint) - amount * BigInt(referrerBps) / 10_000n
}

/** Cada puente de la lista con su verificador; el nombre es el final de la función del router. */
const verifyBridge = (tool: string, call: BridgeCall, data: unknown): bigint => {
	switch (tool) {
		case 'NEARIntents': return verifyNear(call, data as NearData)
		case 'AcrossV4': return verifyAcross(call, data as AcrossData)
		case 'PolymerCCTP': return verifyPolymer(call, data as PolymerData)
		case 'Mayan': return verifyMayan(call, data as MayanData)
		default: throw new EvmUnsupportedRouteError(`puente sin verificador (${tool})`)
	}
}

/**
 * Decodifica la llamada al router y comprueba que hace lo que el usuario confirmó. Lanza
 * `EvmUnsupportedRouteError` si la función no está en la lista (o es una variante que esta
 * versión no sabe leer), `EvmRouteExpiredError` si se ha hecho vieja y `EvmVerifyError` si
 * está pero no cuadra.
 *
 * @param now  segundos Unix (el reloj del teléfono): solo para la caducidad de una orden
 */
export const verifyLifiCalldata = (data: string, expected: LifiExpectation, now: number = Math.floor(Date.now() / 1000)): LifiVerified => {
	const { name, args } = decodeLifiCall(data)
	let guaranteed: bigint
	if (SWAPS[name]) {
		guaranteed = verifySwap(name, args, expected)
	} else {
		const match = /^(swapAndStart|start)BridgeTokensVia(\w+)$/.exec(name)
		if (!match) throw new EvmUnsupportedRouteError(`función sin verificador (${name})`)
		const hasSwaps = match[1] === 'swapAndStart'
		const call: BridgeCall = { expected, bridge: args[0] as BridgeData, hasSwaps, now }
		checkBridge(call, hasSwaps ? (args[1] as SwapData[]) : null)
		guaranteed = verifyBridge(match[2], call, args[args.length - 1])
	}
	if (guaranteed <= 0n || guaranteed < expected.minOut) throw new EvmVerifyError('la ruta garantiza menos de lo cotizado')
	return { fn: name, minOut: guaranteed }
}
