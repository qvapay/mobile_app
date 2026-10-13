/**
 * Swap desde Bitcoin nativo vía THORChain. Módulo PURO (fetch global + @scure/btc-signer),
 * tests en node.
 *
 * THORChain no tiene contratos en Bitcoin: un swap es un envío normal a la BÓVEDA del
 * protocolo con una salida `OP_RETURN` que lleva el MEMO (`=:ACTIVO:DESTINO:LÍMITE/…:AFILIADO:BPS`).
 * Los nodos de THORChain ven el depósito, cambian y pagan al destino del memo en la otra
 * cadena. Si el precio cae por debajo del LÍMITE, devuelven el BTC (menos comisiones).
 *
 * Lo que la wallet comprueba por su cuenta, sin fiarse del backend:
 *   · La bóveda se pide a los nodos de THORChain (dos, en el CÓDIGO) y tienen que coincidir;
 *     con la cadena pausada o detenida no se firma.
 *   · El memo se DECODIFICA: el activo es el elegido, el destino es una wallet del propio
 *     usuario, el límite no es 0 (sin límite no hay protección de precio) y está cerca de lo
 *     enseñado, y el afiliado cobra como mucho lo que se le dijo al usuario.
 *   · La tx tiene exactamente: bóveda, cambio a la propia dirección y el OP_RETURN con ESE
 *     memo. Nada más.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { Address, OutScript, p2wpkh, Script, Transaction } from '@scure/btc-signer'

import { ChainHttpError } from '../chains/http'
import type { RegistryRpc } from '../registry/types'
import { BtcVerifyError, DUST_SATS, getBtcFeeRates, getBtcUtxos, isValidBtcAddress, MAX_FEE_SATS, selectUtxos } from './tx'
import type { BtcSelection, SignedBtcTx } from './tx'

/** Nodos de THORChain para leer la bóveda. Dos operadores distintos: tienen que coincidir. */
export const THORNODE_ENDPOINTS = [
	'https://gateway.liquify.com/chain/thorchain_api',
	'https://thornode.ninerealms.com',
]

/**
 * Pool de THORChain de cada activo de la wallet (id de la wallet → nombre completo del pool).
 * Vive en la app A PROPÓSITO: el memo se coteja contra ESTO, no contra lo que diga el
 * backend. SOL queda fuera hasta verificar el alias que usa su memo.
 */
export const THORCHAIN_POOLS: Record<string, string> = {
	'ethereum:native': 'ETH.ETH',
	'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7': 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7',
	'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
	'bsc:native': 'BSC.BNB',
	'bsc:0x55d398326f99059fF775485246999027B3197955': 'BSC.USDT-0X55D398326F99059FF775485246999027B3197955',
	'bsc:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': 'BSC.USDC-0X8AC76A51CC950D9822D68B83FE1AD97B32CD580D',
	'base:native': 'BASE.ETH',
	'base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'BASE.USDC-0X833589FCD6EDB6E08F4C7C32D4F71B54BDA02913',
	'tron:native': 'TRON.TRX',
	'tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': 'TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T',
}

/** Un OP_RETURN estándar admite 80 bytes de datos. */
export const MAX_MEMO_BYTES = 80
/** Cuánto puede quedar el límite del memo por debajo de lo enseñado al usuario. */
export const MAX_LIMIT_GAP_BPS = 300n
/** RBF, como en los envíos normales. */
const RBF_SEQUENCE = 0xfffffffd

export type ThorchainMemo = {
	asset: string
	destination: string
	/** Mínimo a recibir, en unidades de 1e8 (THORChain normaliza todos los activos a 8 decimales). */
	limit: bigint
	interval: number
	quantity: number
	affiliate: string | null
	affiliateBps: number
}

/** `123e5` (notación corta de THORChain) o un entero. */
const parseAmount = (text: string): bigint => {
	const match = /^(\d+)(?:e(\d+))?$/i.exec(text)
	if (!match) throw new BtcVerifyError(`memo: cantidad ilegible "${text}"`)
	return BigInt(match[1]) * 10n ** BigInt(match[2] ?? '0')
}

/** Decodifica un memo de swap. Lanza ante cualquier cosa que no sea un swap simple. */
export const parseThorchainSwapMemo = (memo: string): ThorchainMemo => {
	const parts = memo.split(':')
	if (!['=', 'SWAP', 's'].includes(parts[0])) throw new BtcVerifyError('memo: no es un swap')
	if (parts.length < 4 || parts.length > 6) throw new BtcVerifyError('memo: forma inesperada')
	const [, asset, destination, limitPart, affiliate = '', bps = ''] = parts
	const [limit, interval = '1', quantity = '0'] = limitPart.split('/')
	if (affiliate.includes('/') || bps.includes('/')) throw new BtcVerifyError('memo: más de un afiliado')
	return {
		asset,
		destination,
		limit: parseAmount(limit),
		interval: Number(interval),
		quantity: Number(quantity),
		affiliate: affiliate || null,
		affiliateBps: bps ? Number(bps) : 0,
	}
}

/**
 * Alias de una o dos letras con los que la API de THORChain abrevia los nativos en el memo
 * (verificados contra sus cotizaciones el 10 oct 2026). Una tabla CERRADA: un alias que no
 * esté aquí no casa, y el swap no se firma.
 */
export const THORCHAIN_ALIASES: Record<string, string> = {
	'BTC.BTC': 'B',
	'ETH.ETH': 'E',
	'BSC.BNB': 'S',
	'BASE.ETH': 'F',
	'TRON.TRX': 'TR',
}

/**
 * ¿El activo del memo es el pool esperado? THORChain admite la forma completa
 * (`ETH.USDT-0XDAC17…`), la abreviada sin contrato (`ETH.USDT`, si solo hay un pool con
 * ese símbolo en esa cadena), la del final del contrato (`ETH.USDT-EC7`) y, en los
 * nativos, su alias corto (`e`).
 */
export const memoAssetMatches = (memoAsset: string, pool: string): boolean => {
	const a = memoAsset.toUpperCase()
	const p = pool.toUpperCase()
	if (a === p) return true
	if (THORCHAIN_ALIASES[p] === a) return true
	const [chainSymbol, contract] = p.split('-')
	if (a === chainSymbol) return true
	if (!contract) return false
	const [memoChainSymbol, suffix] = a.split('-')
	return memoChainSymbol === chainSymbol && !!suffix && suffix.length >= 3 && contract.endsWith(suffix)
}

export type ThorchainBtcIntent = {
	/** Dirección BTC del usuario (paga y recibe el cambio). */
	from: string
	amountSats: bigint
	memo: string
	/** Pool de destino (forma completa, p. ej. `ETH.USDT-0XDAC17…`). */
	pool: string
	/** Wallet PROPIA del usuario en la cadena de destino. */
	destination: string
	/** Lo enseñado al usuario, en 1e8: el límite no puede quedar muy por debajo. */
	shownOut: bigint
	/** La comisión de afiliado que se le dijo al usuario. */
	maxAffiliateBps: number
}

/** Comprueba el memo contra la intención. Exportado para tests. */
export const verifyThorchainMemo = (intent: ThorchainBtcIntent): ThorchainMemo => {
	// Solo ASCII imprimible: cualquier otro carácter cambiaría de bytes al codificarlo
	if (/[^\x20-\x7e]/.test(intent.memo)) throw new BtcVerifyError('memo: caracteres no permitidos')
	if (intent.memo.length > MAX_MEMO_BYTES) throw new BtcVerifyError('memo: no cabe en un OP_RETURN')
	const memo = parseThorchainSwapMemo(intent.memo)
	if (!memoAssetMatches(memo.asset, intent.pool)) throw new BtcVerifyError('memo: otro activo de destino')
	const evm = /^0x[0-9a-fA-F]{40}$/.test(intent.destination)
	const sameDestination = evm ? memo.destination.toLowerCase() === intent.destination.toLowerCase() : memo.destination === intent.destination
	if (!sameDestination) throw new BtcVerifyError('memo: el destino no es tu wallet')
	if (memo.limit <= 0n) throw new BtcVerifyError('memo: sin límite de precio')
	if (memo.limit * 10_000n < intent.shownOut * (10_000n - MAX_LIMIT_GAP_BPS)) throw new BtcVerifyError('memo: el límite queda muy por debajo de lo cotizado')
	if (memo.affiliateBps > intent.maxAffiliateBps) throw new BtcVerifyError('memo: comisión de afiliado mayor de la anunciada')
	return memo
}

// ASCII → bytes sin TextEncoder (no garantizado en Hermes)
class TextEncoderLite { encode(text: string): Uint8Array { return Uint8Array.from(text, ch => ch.charCodeAt(0)) } }

// ---------------------------------------------------------------------------
// Bóveda
// ---------------------------------------------------------------------------

type InboundAddress = { chain: string, address: string, halted?: boolean, chain_trading_paused?: boolean, global_trading_paused?: boolean, dust_threshold?: string }

/**
 * Bóveda de BTC según los nodos de THORChain. Tiene que responder al menos uno, y si
 * responden los dos, tienen que coincidir: un nodo mentiroso no puede desviar el depósito.
 */
export const fetchBtcVault = async ({ signal, endpoints = THORNODE_ENDPOINTS }: { signal?: AbortSignal, endpoints?: string[] } = {}): Promise<{ address: string, dustThreshold: bigint }> => {
	const answers = await Promise.all(endpoints.map(async (base) => {
		try {
			const res = await fetch(`${base}/thorchain/inbound_addresses`, { signal })
			if (!res.ok) return null
			const list = await res.json() as InboundAddress[]
			return Array.isArray(list) ? list.find(entry => entry.chain === 'BTC') ?? null : null
		} catch { return null }
	}))
	const got = answers.filter((a): a is InboundAddress => a !== null)
	if (got.length === 0) throw new ChainHttpError('thorchain: no responde ningún nodo', { retryable: true })
	if (new Set(got.map(a => a.address)).size !== 1) throw new BtcVerifyError('thorchain: los nodos no coinciden en la bóveda')
	const vault = got[0]
	if (vault.halted || vault.chain_trading_paused || vault.global_trading_paused) throw new ChainHttpError('thorchain: el trading de BTC está pausado', { retryable: false })
	if (!isValidBtcAddress(vault.address)) throw new BtcVerifyError('thorchain: bóveda inválida')
	return { address: vault.address, dustThreshold: BigInt(vault.dust_threshold ?? '1000') }
}

// ---------------------------------------------------------------------------
// Construir, firmar, verificar
// ---------------------------------------------------------------------------

export type PreparedThorchainBtc = {
	intent: ThorchainBtcIntent
	vault: string
	memo: ThorchainMemo
	selection: BtcSelection
	expiresAt: null
}

/** Bytes de la salida OP_RETURN: valor (8) + longitud del script (1) + OP_RETURN + pushdata + memo. */
export const opReturnVbytes = (memo: string): number => 8 + 1 + 1 + (memo.length > 75 ? 2 : 1) + memo.length

export const prepareThorchainBtcSwap = async (rpc: RegistryRpc, intent: ThorchainBtcIntent, deps: { signal?: AbortSignal, endpoints?: string[] } = {}): Promise<PreparedThorchainBtc> => {
	const memo = verifyThorchainMemo(intent)
	const [vault, utxos, feeRates] = await Promise.all([
		fetchBtcVault(deps),
		getBtcUtxos(rpc, intent.from, deps),
		getBtcFeeRates(rpc, deps),
	])
	if (intent.amountSats < vault.dustThreshold || intent.amountSats < DUST_SATS) throw new ChainHttpError('thorchain: importe por debajo del mínimo', { retryable: false })
	const selection = selectUtxos(utxos, intent.amountSats, feeRates.normal, opReturnVbytes(intent.memo))
	// "Enviar todo" descuenta la comisión del importe: a la bóveda llegaría menos de lo cotizado
	if (selection.sendAll || selection.amount !== intent.amountSats) throw new ChainHttpError('thorchain: deja saldo para la comisión de red', { retryable: false })
	if (selection.fee > MAX_FEE_SATS) throw new ChainHttpError(`btc: comisión anómala (${selection.fee} sats)`, { retryable: false })
	return { intent, vault: vault.address, memo, selection, expiresAt: null }
}

const opReturnScript = (memo: string) => Script.encode(['RETURN', new TextEncoderLite().encode(memo)])

/** Bóveda → cambio propio → OP_RETURN, el orden que pide THORChain. Firma y re-verifica. */
export const signThorchainBtcSwap = (prepared: PreparedThorchainBtc, privateKey: Uint8Array): SignedBtcTx => {
	const { intent, selection, vault } = prepared
	const own = p2wpkh(secp256k1.getPublicKey(privateKey, true))
	if (own.address !== intent.from) throw new BtcVerifyError('la clave no corresponde a la dirección de origen')

	const tx = new Transaction({ allowUnknownOutputs: true })
	for (const utxo of selection.inputs) {
		tx.addInput({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { script: own.script, amount: utxo.value }, sequence: RBF_SEQUENCE })
	}
	tx.addOutputAddress(vault, selection.amount)
	if (selection.change > 0n) tx.addOutputAddress(intent.from, selection.change)
	tx.addOutput({ script: opReturnScript(intent.memo), amount: 0n })
	tx.sign(privateKey)
	tx.finalize()

	const signed = { hex: tx.hex, txid: tx.id }
	verifyThorchainBtcTx(signed, prepared)
	return signed
}

const sameScript = (script: Uint8Array | undefined, expected: Uint8Array) => !!script && script.length === expected.length && script.every((b, i) => b === expected[i])

export const verifyThorchainBtcTx = ({ hex }: SignedBtcTx, { intent, selection, vault }: PreparedThorchainBtc): void => {
	const parsed = Transaction.fromRaw(hexToBytes(hex), { allowUnknownOutputs: true })
	const expectedOutputs = selection.change > 0n ? 3 : 2
	if (parsed.outputsLength !== expectedOutputs) throw new BtcVerifyError(`la tx trae ${parsed.outputsLength} salidas, se esperaban ${expectedOutputs}`)
	if (parsed.inputsLength !== selection.inputs.length) throw new BtcVerifyError('número de inputs distinto')

	const toVault = parsed.getOutput(0)
	if (!sameScript(toVault.script, OutScript.encode(Address().decode(vault)))) throw new BtcVerifyError('el depósito no va a la bóveda')
	if (toVault.amount !== intent.amountSats) throw new BtcVerifyError('cantidad distinta')
	if (selection.change > 0n) {
		const change = parsed.getOutput(1)
		if (!sameScript(change.script, OutScript.encode(Address().decode(intent.from)))) throw new BtcVerifyError('el cambio no vuelve a la propia dirección')
		if (change.amount !== selection.change) throw new BtcVerifyError('cambio distinto')
	}
	const data = parsed.getOutput(expectedOutputs - 1)
	if (!sameScript(data.script, opReturnScript(intent.memo)) || data.amount !== 0n) throw new BtcVerifyError('el OP_RETURN no lleva el memo verificado')

	const totalIn = selection.inputs.reduce((sum, u) => sum + u.value, 0n)
	if (totalIn - intent.amountSats - selection.change !== selection.fee) throw new BtcVerifyError('fee distinta de la calculada')
	if (selection.fee > MAX_FEE_SATS) throw new BtcVerifyError('fee por encima del tope')
}
