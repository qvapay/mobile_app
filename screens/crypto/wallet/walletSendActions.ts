/**
 * Orquestación de Enviar en la wallet self-custody (capa React → capa pura),
 * común a TRON y EVM. Aquí es el ÚNICO sitio donde la seed se lee para
 * firmar: se lee del Keychain justo antes, se deriva la clave, se firma y
 * ambas se descartan. Ninguna se guarda en estado, ref ni contexto.
 */
import { getAppRpcRouter } from '../../../wallet/registry/appRpcRouter'
import { getWalletMnemonic } from '../../../wallet/keystore'
import { mnemonicToSeed } from '../../../wallet/seed'
import { derivePrivateKey } from '../../../wallet/derive'
import type { RegistryChain } from '../../../wallet/registry/types'
import { broadcastTronTransaction, isValidTronAddress, prepareTronSend, signTronTransaction, TRON_TX_RPC } from '../../../wallet/tron/tx'
import type { PreparedTronSend } from '../../../wallet/tron/tx'
import { broadcastEvmTransaction, getEvmFeeData, isValidEvmAddress, NATIVE_TRANSFER_GAS, prepareEvmSend, signEvmTransaction } from '../../../wallet/evm/tx'
import type { PreparedEvmSend, SignedEvmTx } from '../../../wallet/evm/tx'
import { broadcastBtcTransaction, estimateVsize, feeFor, FEE_TIER_ETA_MINUTES, isValidBtcAddress, prepareBtcSend, signBtcTransaction } from '../../../wallet/btc/tx'
import type { FeeTier, PreparedBtcSend, SignedBtcTx } from '../../../wallet/btc/tx'
import { broadcastStacksTransaction, isValidStacksAddress, prepareStacksSend, signStacksTransaction } from '../../../wallet/stacks/tx'
import type { PreparedStacksSend, SignedStacksTx } from '../../../wallet/stacks/tx'
import { broadcastSolanaTransaction, getSolanaRentExemptMinimum, prepareSolanaSend, signSolanaTransaction } from '../../../wallet/solana/tx'
import type { PreparedSolanaSend, SignedSolanaTx } from '../../../wallet/solana/tx'
import { isValidSolanaAddress } from '../../../wallet/solana/codec'
import type { WalletAsset } from '../../../wallet/assets'

/** Todas las familias del registry envían: TRON, EVM, Bitcoin, Stacks y Solana. */
export const canSendAsset = (asset: Pick<WalletAsset, 'kind'>): boolean => ['tron', 'evm', 'btc', 'stacks', 'solana'].includes(asset.kind)

/** Validación LOCAL del destino por familia (checksum incluido). */
export const isValidAddressFor = (kind: WalletAsset['kind'], address: string): boolean =>
	kind === 'tron' ? isValidTronAddress(address) : kind === 'evm' ? isValidEvmAddress(address) : kind === 'stacks' ? isValidStacksAddress(address) : kind === 'solana' ? isValidSolanaAddress(address) : isValidBtcAddress(address)

export type SendIntent = {
	chainKey: string
	from: string
	/** Solo Stacks: clave pública comprimida del remitente (la tx sin firmar la lleva). */
	fromPublicKey?: string
	to: string
	/** Unidades mínimas del activo. */
	amount: bigint
	/** null = nativo. */
	contract: string | null
}

export type { FeeTier }

/** Una opción de comisión: importe estimado en el nativo y, si se conoce, minutos hasta confirmar. */
export type FeeOption = { tier: FeeTier, feeEstimated: bigint, etaMinutes: number | null }

/** Lo que la pantalla de confirmación pinta, igual para todas las cadenas. */
export type SendSummary = {
	/** Cantidad verificada en unidades mínimas (sale de la tx construida/decodificada, no del formulario). */
	amount: bigint
	/** Fee que se espera pagar, en unidades mínimas del NATIVO de la cadena. */
	feeEstimated: bigint
	/** Fee máxima autorizada por la tx (fee_limit TRON / gas × maxFeePerGas EVM); null si no aplica. */
	feeMax: bigint | null
	/** Solo TRON: el destino no existe y se paga 1 TRX por activarlo. */
	activatesAccount: boolean
	/** Solana: renta de la cuenta de token del destinatario que crea esta tx (incluida en feeEstimated); null si no se crea. */
	accountCreationFee?: bigint | null
	/** Vigencia de la tx construida (ms epoch); null = sin expiración (EVM). */
	expiresAt: number | null
	/** Nivel de comisión con el que se construyó (null = la cadena no lo permite elegir: TRON). */
	feeTier: FeeTier | null
	/** Opciones Rápido/Normal/Económico para cambiar de nivel (vacío en TRON). */
	feeOptions: FeeOption[]
}

export type PreparedSend =
	| { kind: 'tron', chain: RegistryChain, intent: SendIntent, summary: SendSummary, inner: PreparedTronSend }
	| { kind: 'evm', chain: RegistryChain, intent: SendIntent, summary: SendSummary, inner: PreparedEvmSend }
	| { kind: 'btc', chain: RegistryChain, intent: SendIntent, summary: SendSummary, inner: PreparedBtcSend }
	| { kind: 'stacks', chain: RegistryChain, intent: SendIntent, summary: SendSummary, inner: PreparedStacksSend }
	| { kind: 'solana', chain: RegistryChain, intent: SendIntent, summary: SendSummary, inner: PreparedSolanaSend }

/** Firma retenida solo para re-difundir la MISMA tx (mismo hash) tras un fallo de red. */
export type SignedSend =
	| { kind: 'tron', signature: string }
	| { kind: 'evm', signed: SignedEvmTx }
	| { kind: 'btc', signed: SignedBtcTx }
	| { kind: 'stacks', signed: SignedStacksTx }
	| { kind: 'solana', signed: SignedSolanaTx }

/** Opciones de patrocinio: la tx la paga QvaPay y `broadcastSigned` la rechaza (la difunde el backend). */
export type PrepareOptions = {
	/** Stacks: tx patrocinada (fee 0, authType sponsored). */
	sponsored?: boolean
	/** Solana: dirección del fee payer patrocinador (QvaPay); el usuario firma solo su hueco. */
	feePayer?: string | null
}

export const prepareSend = async (chain: RegistryChain, intent: SendIntent, tier: FeeTier = 'normal', options: PrepareOptions = {}): Promise<PreparedSend> => {
	const router = getAppRpcRouter()
	if (chain.kind === 'tron') {
		const inner = await router.call(intent.chainKey, (rpc, signal) => prepareTronSend(rpc, { from: intent.from, to: intent.to, amount: intent.amount, contract: intent.contract }, { signal }), { accept: TRON_TX_RPC })
		const contract = inner.raw.contracts[0]
		const amount = contract.type === 'TransferContract' ? contract.amount : intent.amount
		return {
			kind: 'tron', chain, intent, inner,
			summary: { amount, feeEstimated: inner.fee.burnSun, feeMax: inner.fee.feeLimitSun > 0n ? inner.fee.feeLimitSun : null, activatesAccount: inner.fee.activatesAccount, expiresAt: Number(inner.raw.expiration), feeTier: null, feeOptions: [] },
		}
	}
	if (chain.kind === 'evm') {
		if (!chain.chainId) throw new Error(`wallet: la cadena ${intent.chainKey} no declara chainId`)
		const evmIntent = { chainId: chain.chainId, from: intent.from, to: intent.to, amount: intent.amount, contract: intent.contract }
		const inner = await router.call(intent.chainKey, (rpc, signal) => prepareEvmSend(rpc, chain, evmIntent, { signal, tier }))
		// Lo verificado en EVM es la tx construida: value (nativo) o calldata (token) salen de ella
		const amount = intent.contract ? intent.amount : inner.tx.value ?? 0n
		return {
			kind: 'evm', chain, intent, inner,
			summary: {
				amount, feeEstimated: inner.fee.estimatedWei, feeMax: inner.fee.maxWei, activatesAccount: false, expiresAt: null, feeTier: inner.tier,
				feeOptions: (['fast', 'normal', 'slow'] as FeeTier[]).map(t => ({ tier: t, feeEstimated: inner.feeByTier[t], etaMinutes: null })),
			},
		}
	}
	if (chain.kind === 'btc') {
		const inner = await router.call(intent.chainKey, (rpc, signal) => prepareBtcSend(rpc, { from: intent.from, to: intent.to, amount: intent.amount }, { signal, tier }))
		// Con "enviar todo" la cantidad verificada es total − fee: lo que de verdad recibe el destino
		return {
			kind: 'btc', chain, intent, inner,
			summary: {
				amount: inner.selection.amount, feeEstimated: inner.selection.fee, feeMax: null, activatesAccount: false, expiresAt: null, feeTier: inner.tier,
				// Mismo tamaño de tx, distinta tasa: con "enviar todo" cambia lo enviado, no el tamaño
				feeOptions: (['fast', 'normal', 'slow'] as FeeTier[]).map(t => ({ tier: t, feeEstimated: feeFor(estimateVsize(inner.selection.inputs.length, inner.selection.change > 0n ? 2 : 1), inner.feeRates[t]), etaMinutes: FEE_TIER_ETA_MINUTES[t] })),
			},
		}
	}
	if (chain.kind === 'stacks') {
		if (!intent.fromPublicKey) throw new Error('wallet: falta la clave pública Stacks (metadata sin migrar)')
		const publicKey = intent.fromPublicKey
		const sponsored = options.sponsored === true
		const inner = await router.call(intent.chainKey, (rpc, signal) => prepareStacksSend(rpc, { from: intent.from, to: intent.to, amount: intent.amount, contract: intent.contract }, publicKey, { signal, tier, sponsored }))
		return {
			kind: 'stacks', chain, intent, inner,
			summary: {
				amount: intent.amount, feeEstimated: inner.fee, feeMax: null, activatesAccount: false, expiresAt: null, feeTier: sponsored ? null : inner.tier,
				feeOptions: sponsored ? [] : (['fast', 'normal', 'slow'] as FeeTier[]).map(t => ({ tier: t, feeEstimated: inner.feeByTier[t], etaMinutes: null })),
			},
		}
	}
	if (chain.kind === 'solana') {
		const token = intent.contract ? chain.tokens?.find(t => t.address === intent.contract) : null
		if (intent.contract && !token) throw new Error(`wallet: token ${intent.contract} fuera del registry`)
		const decimals = token ? token.decimals : chain.native.decimals
		// feePayer ajeno = patrocinada (QvaPay paga tarifa y renta); la difunde el backend
		const inner = await router.call(intent.chainKey, (rpc, signal) => prepareSolanaSend(rpc, { from: intent.from, to: intent.to, amount: intent.amount, mint: intent.contract, decimals }, { signal, feePayer: options.feePayer ?? null }))
		const userPays = !inner.sponsored
		return {
			kind: 'solana', chain, intent, inner,
			summary: {
				amount: intent.amount,
				feeEstimated: userPays ? inner.feeLamports + inner.rentLamports : 0n,
				feeMax: null,
				activatesAccount: false,
				accountCreationFee: inner.createsTokenAccount ? inner.rentLamports : null,
				expiresAt: inner.expiresAt,
				feeTier: null,
				feeOptions: [],
			},
		}
	}
	throw new Error(`wallet: enviar en ${chain.kind} aún no está disponible`)
}

/**
 * Reserva de gas para el botón MAX de un NATIVO: lo que costaría la propia
 * transferencia con la fee actual, con margen. TRON no lo necesita aquí
 * (reserva fija en WalletSend); EVM lee la fee del nodo; Bitcoin no reserva
 * nada: MAX = todo el saldo y la fee se descuenta del envío ("enviar todo").
 */
export const estimateNativeReserve = async (chain: RegistryChain, chainKey: string): Promise<bigint> => {
	// Solana: el mínimo exento de renta MÁS la comisión. Una cuenta que hoy está exenta
	// no puede quedarse por debajo de ese mínimo con saldo distinto de cero — el runtime
	// lo rechaza con InsufficientFundsForRent, y el rechazo llega en la simulación como
	// un "Transaction simulation failed" que no explica nada. Reservar solo la comisión
	// (lo que se hacía antes) dejaba la cuenta con calderilla y rompía el "enviar todo".
	if (chain.kind === 'solana') {
		const minimum = await getAppRpcRouter().call(chainKey, (rpc, signal) => getSolanaRentExemptMinimum(rpc, { signal }))
		return minimum + 20_000n
	}
	if (chain.kind !== 'evm') return 0n
	const fee = await getAppRpcRouter().call(chainKey, (rpc, signal) => getEvmFeeData(rpc, { signal }))
	const perGas = fee.eip1559 ? fee.baseFee * 2n + fee.priorityFee : fee.gasPrice
	return NATIVE_TRANSFER_GAS * perGas * 12n / 10n
}

/** Firma la tx ya verificada. La clave privada se pone a cero al salir. */
export const signPrepared = async (prepared: PreparedSend): Promise<SignedSend> => {
	const mnemonic = await getWalletMnemonic()
	if (!mnemonic) throw new Error('wallet: sin seed en el dispositivo')
	const privateKey = derivePrivateKey(mnemonicToSeed(mnemonic), prepared.kind)
	try {
		if (prepared.kind === 'tron') return { kind: 'tron', signature: signTronTransaction(prepared.inner.tx.raw_data_hex, privateKey) }
		if (prepared.kind === 'btc') return { kind: 'btc', signed: signBtcTransaction(prepared.inner, privateKey) }
		if (prepared.kind === 'stacks') return { kind: 'stacks', signed: signStacksTransaction(prepared.inner, privateKey) }
		if (prepared.kind === 'solana') return { kind: 'solana', signed: signSolanaTransaction(prepared.inner, privateKey) }
		return { kind: 'evm', signed: await signEvmTransaction(prepared.inner, privateKey) }
	} finally {
		privateKey.fill(0)
	}
}

export type BroadcastResult = { txid: string, duplicate: boolean }

export const broadcastSigned = async (prepared: PreparedSend, signed: SignedSend): Promise<BroadcastResult> => {
	const router = getAppRpcRouter()
	if (prepared.kind === 'tron' && signed.kind === 'tron') {
		return router.call(prepared.intent.chainKey, (rpc, signal) => broadcastTronTransaction(rpc, prepared.inner.tx.raw_data_hex, signed.signature, { signal }), { accept: TRON_TX_RPC })
	}
	if (prepared.kind === 'evm' && signed.kind === 'evm') {
		const result = await router.call(prepared.intent.chainKey, (rpc, signal) => broadcastEvmTransaction(rpc, signed.signed, { signal }))
		return { txid: result.hash, duplicate: result.duplicate }
	}
	if (prepared.kind === 'btc' && signed.kind === 'btc') {
		return router.call(prepared.intent.chainKey, (rpc, signal) => broadcastBtcTransaction(rpc, signed.signed, { signal }))
	}
	if (prepared.kind === 'stacks' && signed.kind === 'stacks') {
		// Una patrocinada sin co-firma no vale nada en la red y, si valiera, la pagaría el usuario
		if (prepared.inner.sponsored) throw new Error('wallet: una tx patrocinada no se difunde desde la app')
		return router.call(prepared.intent.chainKey, (rpc, signal) => broadcastStacksTransaction(rpc, signed.signed, { signal }))
	}
	if (prepared.kind === 'solana' && signed.kind === 'solana') {
		if (prepared.inner.sponsored) throw new Error('wallet: una tx patrocinada no se difunde desde la app')
		return router.call(prepared.intent.chainKey, (rpc, signal) => broadcastSolanaTransaction(rpc, signed.signed, { signal }))
	}
	throw new Error('wallet: firma y transacción de cadenas distintas')
}
