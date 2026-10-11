/**
 * Swap ON-CHAIN en la wallet (capa React → capa pura). Mismo contrato que Enviar y el
 * staking: construir → VERIFICAR → firmar → difundir, y la seed solo se toca en
 * `withWalletKey`, el instante de firmar.
 *
 * Despacha por familia a los módulos puros: `wallet/evm/swap.ts` (LI.FI),
 * `wallet/solana/swap.ts` (Jupiter), `wallet/tron/swap.ts` (SunSwap) y
 * `wallet/btc/thorchain.ts` (THORChain). En EVM y TRON un swap puede ser varias
 * transacciones (permiso → swap): cada `prepare` devuelve el SIGUIENTE paso según el permiso
 * que haya en la cadena, y la pantalla repite hasta llegar al swap.
 */
import { getAppRpcRouter } from '../../../wallet/registry/appRpcRouter'
import { evmReceiptStatus, prepareEvmSwapStep, signEvmSwapStep } from '../../../wallet/evm/swap'
import type { EvmRouteBuild, EvmSwapStep, PreparedEvmSwapStep } from '../../../wallet/evm/swap'
import { broadcastEvmTransaction } from '../../../wallet/evm/tx'
import type { SignedEvmTx } from '../../../wallet/evm/tx'
import { prepareSolanaSwap, signSolanaSwap } from '../../../wallet/solana/swap'
import type { JupiterBuild, PreparedSolanaSwap } from '../../../wallet/solana/swap'
import { broadcastSolanaTransaction } from '../../../wallet/solana/tx'
import type { SignedSolanaTx } from '../../../wallet/solana/tx'
import { prepareTronSwapStep, tronTxStatus } from '../../../wallet/tron/swap'
import type { PreparedTronSwapStep } from '../../../wallet/tron/swap'
import { broadcastTronTransaction, signTronTransaction, TRON_TX_RPC } from '../../../wallet/tron/tx'
import { prepareThorchainBtcSwap, signThorchainBtcSwap } from '../../../wallet/btc/thorchain'
import type { PreparedThorchainBtc } from '../../../wallet/btc/thorchain'
import { broadcastBtcTransaction } from '../../../wallet/btc/tx'
import type { SignedBtcTx } from '../../../wallet/btc/tx'
import type { ExchangeOnchainBuild } from '../../../types/domain'
import type { OnchainSwapPlan } from './onchainSwapModel'
import { withWalletKey } from './walletSendActions'

export type OnchainSwapSummary = {
	/** Solana: caducidad del blockhash. EVM: null (el nonce manda). */
	expiresAt: number | null
	/** EVM: permiso, reinicio del permiso o swap. Solana: siempre swap. */
	step: EvmSwapStep
	/** Transacciones que quedan después de esta. */
	remaining: number
	/** Comisión de red estimada, en unidades del nativo. */
	feeEstimated: bigint
	/** Solana: lo que la SIMULACIÓN dice que se recibe. TRON: lo que cotiza el router ahora. EVM/BTC: null. */
	simulatedOut: bigint | null
}

export type PreparedOnchainSwap =
	| { family: 'evm', chainKey: string, summary: OnchainSwapSummary, inner: PreparedEvmSwapStep }
	| { family: 'solana', chainKey: string, summary: OnchainSwapSummary, inner: PreparedSolanaSwap }
	| { family: 'tron', chainKey: string, summary: OnchainSwapSummary, inner: PreparedTronSwapStep }
	| { family: 'btc', chainKey: string, summary: OnchainSwapSummary, inner: PreparedThorchainBtc }

export type SignedOnchainSwap =
	| { family: 'evm', signed: SignedEvmTx }
	| { family: 'solana', signed: SignedSolanaTx }
	| { family: 'tron', signature: string }
	| { family: 'btc', signed: SignedBtcTx }

export const prepareOnchainSwap = async (build: ExchangeOnchainBuild, plan: OnchainSwapPlan): Promise<PreparedOnchainSwap> => {
	const router = getAppRpcRouter()
	if (plan.family === 'evm' && build.family === 'evm') {
		const routeBuild: EvmRouteBuild = { chainId: build.chainId, tx: build.tx, approval: build.approval }
		const inner = await router.call(plan.chainKey, (rpc, signal) => prepareEvmSwapStep(rpc, routeBuild, plan.intent, { signal }))
		return {
			family: 'evm', chainKey: plan.chainKey, inner,
			summary: { expiresAt: null, step: inner.step, remaining: inner.remaining, feeEstimated: inner.fee.estimatedWei, simulatedOut: null },
		}
	}
	if (plan.family === 'solana' && build.family === 'solana') {
		const jupiter: JupiterBuild = { instructions: build.instructions, lookupTables: build.lookupTables }
		const inner = await router.call(plan.chainKey, (rpc, signal) => prepareSolanaSwap(rpc, jupiter, plan.intent, { signal }))
		return {
			family: 'solana', chainKey: plan.chainKey, inner,
			summary: { expiresAt: inner.expiresAt, step: 'swap', remaining: 0, feeEstimated: inner.feeLamports, simulatedOut: inner.simulatedOut },
		}
	}
	if (plan.family === 'tron' && build.family === 'tron') {
		const inner = await router.call(plan.chainKey, (rpc, signal) => prepareTronSwapStep(rpc, plan.intent, { signal }), { accept: TRON_TX_RPC })
		return {
			family: 'tron', chainKey: plan.chainKey, inner,
			summary: { expiresAt: inner.expiresAt, step: inner.step, remaining: inner.remaining, feeEstimated: inner.fee.burnSun, simulatedOut: inner.quotedOut },
		}
	}
	if (plan.family === 'btc' && build.family === 'btc') {
		const inner = await router.call(plan.chainKey, (rpc, signal) => prepareThorchainBtcSwap(rpc, plan.intent, { signal }))
		return {
			family: 'btc', chainKey: plan.chainKey, inner,
			summary: { expiresAt: null, step: 'swap', remaining: 0, feeEstimated: inner.selection.fee, simulatedOut: null },
		}
	}
	throw new Error('wallet: la ruta y el plan son de familias distintas')
}

export const signOnchainSwap = (prepared: PreparedOnchainSwap): Promise<SignedOnchainSwap> => {
	switch (prepared.family) {
		case 'evm': {
			const inner = prepared.inner
			return withWalletKey('evm', async key => ({ family: 'evm', signed: await signEvmSwapStep(inner, key) }))
		}
		case 'solana': {
			const inner = prepared.inner
			return withWalletKey('solana', async key => ({ family: 'solana', signed: signSolanaSwap(inner, key) }))
		}
		case 'tron': {
			const raw = prepared.inner.tx.raw_data_hex
			return withWalletKey('tron', async key => ({ family: 'tron', signature: signTronTransaction(raw, key) }))
		}
		case 'btc': {
			const inner = prepared.inner
			return withWalletKey('btc', async key => ({ family: 'btc', signed: signThorchainBtcSwap(inner, key) }))
		}
	}
}

export const broadcastOnchainSwap = async (prepared: PreparedOnchainSwap, signed: SignedOnchainSwap): Promise<{ txid: string, duplicate: boolean }> => {
	const router = getAppRpcRouter()
	if (prepared.family === 'evm' && signed.family === 'evm') {
		const result = await router.call(prepared.chainKey, (rpc, signal) => broadcastEvmTransaction(rpc, signed.signed, { signal }))
		return { txid: result.hash, duplicate: result.duplicate }
	}
	if (prepared.family === 'solana' && signed.family === 'solana') {
		return router.call(prepared.chainKey, (rpc, signal) => broadcastSolanaTransaction(rpc, signed.signed, { signal }))
	}
	if (prepared.family === 'tron' && signed.family === 'tron') {
		const raw = prepared.inner.tx.raw_data_hex
		return router.call(prepared.chainKey, (rpc, signal) => broadcastTronTransaction(rpc, raw, signed.signature, { signal }), { accept: TRON_TX_RPC })
	}
	if (prepared.family === 'btc' && signed.family === 'btc') {
		return router.call(prepared.chainKey, (rpc, signal) => broadcastBtcTransaction(rpc, signed.signed, { signal }))
	}
	throw new Error('wallet: firma y transacción de familias distintas')
}

/** Tope de espera a que se mine un permiso antes de seguir con el swap. */
export const APPROVAL_WAIT_MS = 120_000
const APPROVAL_POLL_MS = 3_000

/**
 * Espera a que el permiso quede minado (EVM o TRON). true = listo, false = revirtió. Lanza si
 * se agota el tiempo: la pantalla ofrece reintentar, y como `prepare` lee el permiso de la
 * cadena, no se vuelve a pedir uno que ya entró.
 */
export const waitForApproval = async (family: 'evm' | 'tron', chainKey: string, hash: string, { timeoutMs = APPROVAL_WAIT_MS, sleep = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms) }) } = {}): Promise<boolean> => {
	const router = getAppRpcRouter()
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const status = await (family === 'evm'
			? router.call(chainKey, (rpc, signal) => evmReceiptStatus(rpc, hash, { signal }), { idempotent: true })
			: router.call(chainKey, (rpc, signal) => tronTxStatus(rpc, hash, { signal }), { idempotent: true, accept: TRON_TX_RPC })
		).catch(() => null)
		if (status !== null) return status
		await sleep(APPROVAL_POLL_MS)
	}
	throw new Error('wallet: el permiso tarda en confirmarse')
}
