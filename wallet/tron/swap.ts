/**
 * Swap en TRON vía SunSwap V2 (TRX ↔ USDT). Módulo PURO (fetch vía `postJson`), tests en node.
 *
 * A diferencia de LI.FI o Jupiter, aquí no hay backend que proponga la transacción: la
 * llamada al router la CODIFICA la wallet (función, ruta, mínimo, receptor = el propio
 * usuario, plazo) y el nodo solo la envuelve en un `TriggerSmartContract`. Al volver se
 * decodifica y se exige que los datos sean BYTE A BYTE los codificados aquí: nada que
 * verificar a ciegas.
 *
 * - El router y el WTRX son constantes del CÓDIGO (verificados on-chain el 10 oct 2026:
 *   `UniswapV2Router02`, y su `WETH()` devuelve el WTRX). No viven en el registry remoto.
 * - El mínimo a recibir sale de `getAmountsOut` del propio router en el momento de firmar,
 *   menos un 0,5%; y no puede quedar por debajo del mínimo que se le enseñó al usuario.
 * - `triggerconstantcontract` con la misma llamada es la simulación: si revertiría, no se
 *   firma (y de paso da la energía real que consumirá).
 * - Pagar con un token exige antes un `approve` EXACTO al router: otro paso, como en EVM.
 *
 * SunSwap no admite comisión de integrador: esta ruta no le deja nada a QvaPay salvo,
 * indirectamente, el alquiler de energía (un swap consume ~100-150k).
 */
import { ChainHttpError, postJson } from '../chains/http'
import { tronToHex20 } from '../chains/tron'
import type { RegistryRpc } from '../registry/types'
import {
	computeFeeLimit,
	computeTronBurn,
	decodeNodeMessage,
	decodeTronRaw,
	getTronChainParams,
	getTronResources,
	tronTxId,
	SIGNATURE_OVERHEAD_BYTES,
	TronVerifyError,
} from './tx'
import type { DecodedTronRaw, TronChainParams, TronFeeEstimate, TronNodeTx, TronResources } from './tx'

/** SunSwap V2 Router (UniswapV2Router02 en TRON). */
export const SUNSWAP_V2_ROUTER = 'TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax'
/** WTRX: el `WETH()` del router. TRX entra y sale de los pools envuelto. */
export const WTRX = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR'

export const SLIPPAGE_BPS = 50n
/** Plazo de la llamada: si no entra en 10 min, el router la rechaza sin mover nada. */
const DEADLINE_SECONDS = 600

/** Firmas y selectores (keccak, comprobados en el test). */
export const TRON_SWAP_FUNCTIONS = {
	approve: { signature: 'approve(address,uint256)', selector: '095ea7b3' },
	allowance: { signature: 'allowance(address,address)', selector: 'dd62ed3e' },
	getAmountsOut: { signature: 'getAmountsOut(uint256,address[])', selector: 'd06ca61f' },
	tokensForTrx: { signature: 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)', selector: '18cbafe5' },
	trxForTokens: { signature: 'swapExactETHForTokens(uint256,address[],address,uint256)', selector: '7ff36ab5' },
	tokensForTokens: { signature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', selector: '38ed1739' },
} as const

export type TronSwapIntent = {
	owner: string
	/** null = TRX nativo. Contratos en base58. */
	inputToken: string | null
	outputToken: string | null
	amountIn: bigint
	/** Mínimo garantizado que se le enseñó al usuario (unidades del token de salida). */
	minOut: bigint
}

export type TronSwapStep = 'approve' | 'swap'

export type PreparedTronSwapStep = {
	step: TronSwapStep
	remaining: number
	intent: TronSwapIntent
	tx: TronNodeTx
	raw: DecodedTronRaw
	fee: TronFeeEstimate
	resources: TronResources
	params: TronChainParams
	/** Swap: lo que el router cotiza ahora y el mínimo que exige la tx. */
	quotedOut: bigint | null
	amountOutMin: bigint | null
	expiresAt: number
}

type Deps = { signal?: AbortSignal, now?: () => number }

const base = (rpc: RegistryRpc) => rpc.url.replace(/\/+$/, '')
const post = <T>(rpc: RegistryRpc, path: string, body: unknown, deps: Deps) =>
	postJson<T>(`${base(rpc)}${path}`, body, { signal: deps.signal, headers: rpc.headers })

// ---------------------------------------------------------------------------
// ABI
// ---------------------------------------------------------------------------

const uint = (value: bigint | number) => BigInt(value).toString(16).padStart(64, '0')
const addr = (address: string) => tronToHex20(address).padStart(64, '0')
const addressArray = (list: string[]) => uint(list.length) + list.map(addr).join('')

/** Ruta del pool: TRX viaja como WTRX; token↔token pasa por WTRX. */
export const swapPath = ({ inputToken, outputToken }: Pick<TronSwapIntent, 'inputToken' | 'outputToken'>): string[] => {
	if (inputToken && outputToken) return [inputToken, WTRX, outputToken]
	return [inputToken ?? WTRX, outputToken ?? WTRX]
}

/** La llamada al router (función + parámetros SIN selector, como los quiere el nodo). */
export const encodeSwapCall = (intent: TronSwapIntent, amountOutMin: bigint, deadline: number): { fn: keyof typeof TRON_SWAP_FUNCTIONS, parameter: string, callValue: bigint } => {
	const path = swapPath(intent)
	if (intent.inputToken === null) {
		// swapExactETHForTokens(amountOutMin, path, to, deadline) — el importe va en call_value
		return { fn: 'trxForTokens', callValue: intent.amountIn, parameter: uint(amountOutMin) + uint(0x80) + addr(intent.owner) + uint(deadline) + addressArray(path) }
	}
	const fn = intent.outputToken === null ? 'tokensForTrx' : 'tokensForTokens'
	return { fn, callValue: 0n, parameter: uint(intent.amountIn) + uint(amountOutMin) + uint(0xa0) + addr(intent.owner) + uint(deadline) + addressArray(path) }
}

export const encodeApproveCall = (spender: string, amount: bigint): string => addr(spender) + uint(amount)

/** Último elemento de un `uint256[]` devuelto por una llamada constante. */
export const lastUintOfArray = (hex: string): bigint => {
	const words = hex.match(/.{64}/g) ?? []
	if (words.length < 3) throw new TronVerifyError('respuesta de getAmountsOut ilegible')
	return BigInt(`0x${words[words.length - 1]}`)
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

/**
 * La tx del nodo debe ser EXACTAMENTE la llamada codificada aquí: un solo
 * `TriggerSmartContract`, del propio usuario, al contrato esperado, con el mismo
 * call_value y los mismos datos byte a byte, y el fee_limit dentro de lo autorizado.
 */
export const verifyTronCall = (tx: { txID: string, raw_data_hex: string }, expected: { owner: string, contract: string, callValue: bigint, data: string, feeLimitSun: bigint }): DecodedTronRaw => {
	if (tronTxId(tx.raw_data_hex) !== tx.txID.toLowerCase()) throw new TronVerifyError('txID no coincide con sha256(raw_data)')
	const raw = decodeTronRaw(tx.raw_data_hex)
	if (raw.contracts.length !== 1) throw new TronVerifyError(`la tx trae ${raw.contracts.length} contratos, se esperaba 1`)
	const contract = raw.contracts[0]
	if (contract.type !== 'TriggerSmartContract') throw new TronVerifyError(`tipo ${contract.type}, se esperaba TriggerSmartContract`)
	if (contract.owner !== tronToHex20(expected.owner)) throw new TronVerifyError('owner distinto')
	if (contract.contract !== tronToHex20(expected.contract)) throw new TronVerifyError('contrato distinto')
	if (contract.callValue !== expected.callValue) throw new TronVerifyError('call_value distinto')
	if (contract.data.toLowerCase() !== expected.data.toLowerCase()) throw new TronVerifyError('calldata distinta')
	if (raw.feeLimit > expected.feeLimitSun) throw new TronVerifyError('fee_limit por encima del autorizado')
	return raw
}

// ---------------------------------------------------------------------------
// Construir
// ---------------------------------------------------------------------------

type ConstantResult = { result?: { result?: boolean, message?: string }, energy_used?: number, constant_result?: string[] }

const constant = async (rpc: RegistryRpc, owner: string, contract: string, fn: keyof typeof TRON_SWAP_FUNCTIONS, parameter: string, callValue: bigint, deps: Deps): Promise<ConstantResult> => {
	const res = await post<ConstantResult>(rpc, '/wallet/triggerconstantcontract', {
		owner_address: owner, contract_address: contract, function_selector: TRON_SWAP_FUNCTIONS[fn].signature, parameter,
		...(callValue > 0n ? { call_value: Number(callValue) } : {}), visible: true,
	}, deps)
	if (res?.result?.result === false) throw new ChainHttpError(`tron: la simulación revierte: ${decodeNodeMessage(res.result.message)}`, { retryable: false })
	return res
}

/** Permiso actual de `owner` al router sobre `token`. */
export const readTronAllowance = async (rpc: RegistryRpc, token: string, owner: string, deps: Deps = {}): Promise<bigint> => {
	const res = await constant(rpc, owner, token, 'allowance', addr(owner) + addr(SUNSWAP_V2_ROUTER), 0n, deps)
	const word = res.constant_result?.[0]
	return word ? BigInt(`0x${word.slice(0, 64) || '0'}`) : 0n
}

/**
 * Prepara el SIGUIENTE paso (permiso o swap) con lo que hay en la cadena ahora. Lanza si
 * el precio empeoró por debajo del mínimo enseñado o si la simulación revierte.
 */
export const prepareTronSwapStep = async (rpc: RegistryRpc, intent: TronSwapIntent, deps: Deps = {}): Promise<PreparedTronSwapStep> => {
	const now = deps.now ?? Date.now
	if (intent.amountIn <= 0n) throw new ChainHttpError('tron: cantidad inválida', { retryable: false })
	if (intent.inputToken === intent.outputToken) throw new ChainHttpError('tron: mismo activo', { retryable: false })

	const [params, resources, allowance] = await Promise.all([
		getTronChainParams(rpc, deps),
		getTronResources(rpc, intent.owner, deps),
		intent.inputToken ? readTronAllowance(rpc, intent.inputToken, intent.owner, deps) : Promise.resolve(0n),
	])

	let step: TronSwapStep
	let contract: string
	let fn: keyof typeof TRON_SWAP_FUNCTIONS
	let parameter: string
	let callValue = 0n
	let quotedOut: bigint | null = null
	let amountOutMin: bigint | null = null

	if (intent.inputToken && allowance < intent.amountIn) {
		step = 'approve'
		contract = intent.inputToken
		fn = 'approve'
		parameter = encodeApproveCall(SUNSWAP_V2_ROUTER, intent.amountIn)
	} else {
		step = 'swap'
		contract = SUNSWAP_V2_ROUTER
		const quote = await constant(rpc, intent.owner, SUNSWAP_V2_ROUTER, 'getAmountsOut', uint(intent.amountIn) + uint(0x40) + addressArray(swapPath(intent)), 0n, deps)
		quotedOut = lastUintOfArray(quote.constant_result?.[0] ?? '')
		amountOutMin = quotedOut * (10_000n - SLIPPAGE_BPS) / 10_000n
		// El precio de ahora, con su deslizamiento, no puede quedar por debajo de lo prometido
		if (amountOutMin < intent.minOut) throw new TronVerifyError('el precio empeoró por debajo del mínimo garantizado')
		const call = encodeSwapCall(intent, amountOutMin, Math.floor(now() / 1000) + DEADLINE_SECONDS)
		fn = call.fn
		parameter = call.parameter
		callValue = call.callValue
	}

	// La simulación: misma llamada, desde el propio usuario. Da además la energía real
	const simulated = await constant(rpc, intent.owner, contract, fn, parameter, callValue, deps)
	if (typeof simulated.energy_used !== 'number') throw new ChainHttpError('tron: no se pudo estimar la energía', { retryable: false })
	const energyNeeded = BigInt(simulated.energy_used)
	const feeLimitSun = computeFeeLimit(energyNeeded, params)

	const built = await post<{ result?: { result?: boolean, message?: string }, transaction?: TronNodeTx }>(rpc, '/wallet/triggersmartcontract', {
		owner_address: intent.owner, contract_address: contract, function_selector: TRON_SWAP_FUNCTIONS[fn].signature, parameter,
		fee_limit: Number(feeLimitSun), call_value: Number(callValue), visible: true,
	}, deps)
	const tx = built?.transaction
	if (built?.result?.result === false || !tx?.raw_data_hex) throw new ChainHttpError(decodeNodeMessage(built?.result?.message) || 'tron: el nodo no construyó la transacción', { retryable: false })

	const raw = verifyTronCall(tx, { owner: intent.owner, contract, callValue, data: TRON_SWAP_FUNCTIONS[fn].selector + parameter, feeLimitSun })
	const bandwidthNeeded = BigInt(tx.raw_data_hex.length / 2) + SIGNATURE_OVERHEAD_BYTES
	const partial = { energyNeeded, bandwidthNeeded, activatesAccount: false }
	// La tx de TRON caduca a los ~60 s de construirse: se reconstruye un poco antes
	const expiresAt = Math.min(Number(raw.expiration) - 5_000, now() + 55_000)

	return {
		step, remaining: step === 'approve' ? 1 : 0, intent, tx, raw, resources, params,
		fee: { ...partial, burnSun: computeTronBurn(partial, resources, params), feeLimitSun },
		quotedOut, amountOutMin, expiresAt,
	}
}

/** ¿Ya entró? → true (éxito) · false (revirtió) · null (aún no). */
export const tronTxStatus = async (rpc: RegistryRpc, txid: string, deps: Deps = {}): Promise<boolean | null> => {
	const info = await post<{ id?: string, receipt?: { result?: string } }>(rpc, '/wallet/gettransactioninfobyid', { value: txid }, deps)
	if (!info?.id) return null
	// Sin `result` en el recibo = TRX/ancho de banda sin ejecutar contrato: solo cuenta SUCCESS
	return info.receipt?.result === 'SUCCESS'
}
