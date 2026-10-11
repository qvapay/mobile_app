/**
 * Rutas de intercambio ON-CHAIN (LI.FI en EVM, Jupiter en Solana): de lo que manda qpweb a
 * la intención que verifica la wallet. Módulo PURO.
 *
 * Lo que el backend NO puede colar aquí, porque se contrasta con lo que el usuario vio y con
 * lo que la propia wallet sabe:
 *   · otro par u otro importe (se exige el importe EXACTO cotizado, en unidades mínimas);
 *   · otro receptor (sale de las direcciones de la propia wallet, nunca del backend);
 *   · un mínimo garantizado irrisorio: si el que dice la ruta queda muy por debajo de lo que
 *     se le enseñó al elegirla, no se sigue.
 */
import { addressForKind } from '../../../wallet/assets'
import type { WalletAsset } from '../../../wallet/assets'
import type { WalletAddresses } from '../../../wallet/derive'
import type { EvmSwapIntent } from '../../../wallet/evm/swap'
import type { SolanaSwapIntent } from '../../../wallet/solana/swap'
import type { TronSwapIntent } from '../../../wallet/tron/swap'
import { THORCHAIN_POOLS } from '../../../wallet/btc/thorchain'
import type { ThorchainBtcIntent } from '../../../wallet/btc/thorchain'
import type { ExchangeOnchainBuild } from '../../../types/domain'

/**
 * Familias cuyo swap on-chain sabe firmar esta versión. Es el interruptor por fases (como
 * `STAKING_CAPABILITIES`): vacío = la app no pide rutas on-chain y el backend no las ofrece.
 */
export const ONCHAIN_SWAP_FAMILIES: Array<'evm' | 'solana' | 'tron' | 'btc'> = ['evm', 'solana', 'tron', 'btc']

/** Lo que la cotización manda para que el backend ofrezca rutas on-chain. */
export const onchainQuoteParams = (addresses: WalletAddresses | null) => (
	ONCHAIN_SWAP_FAMILIES.length && addresses
		? { onchain: ONCHAIN_SWAP_FAMILIES, addresses: { evm: addresses.evm, solana: addresses.sol, tron: addresses.tron, btc: addresses.btc } }
		: {}
)

/** Cuánto puede quedar el mínimo garantizado por debajo de lo enseñado: 0,5% de deslizamiento + 1% de deriva + holgura. */
export const MAX_MIN_OUT_GAP_BPS = 300n

export class OnchainSwapMismatchError extends Error {
	constructor(message: string) { super(message); this.name = 'OnchainSwapMismatchError' }
}

/**
 * Decimal → unidades mínimas con la MISMA regla que qpweb (`onchain-assets.toUnits`): un
 * número se escribe con su forma más corta (0.1 → "0.1", nunca "0.100000000000000006").
 * Trunca lo que sobre de precisión.
 */
export const toUnits = (amount: number | string, decimals: number): bigint | null => {
	const text = typeof amount === 'number'
		? (/e/i.test(String(amount)) ? amount.toFixed(Math.min(decimals, 20)) : String(amount))
		: String(amount ?? '').trim()
	if (!/^\d+(\.\d+)?$/.test(text)) return null
	const [whole, frac = ''] = text.split('.')
	const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
	return units > 0n ? units : null
}

/** `minOut`: el mínimo garantizado, SIEMPRE en unidades del activo de destino (para pintarlo). */
export type OnchainSwapPlan =
	| { family: 'evm', chainKey: string, intent: EvmSwapIntent, minOut: bigint | null }
	| { family: 'solana', chainKey: string, intent: SolanaSwapIntent, minOut: bigint }
	| { family: 'tron', chainKey: string, intent: TronSwapIntent, minOut: bigint }
	| { family: 'btc', chainKey: string, intent: ThorchainBtcIntent, minOut: bigint | null }

/**
 * La intención que se va a verificar y firmar. Lanza `OnchainSwapMismatchError` si lo que
 * mandó el backend no es lo que el usuario eligió.
 *
 * @param amount       el importe COTIZADO que el usuario confirmó
 * @param expectedOut  lo que la ruta elegida prometía recibir (en la hoja de rutas)
 * @param chainId      el de la red de origen según el registry de la wallet (solo EVM)
 */
export const planOnchainSwap = ({ build, from, to, addresses, amount, expectedOut, chainId, serviceFeeBps = 0 }: {
	build: ExchangeOnchainBuild
	from: WalletAsset
	to: WalletAsset
	addresses: WalletAddresses
	amount: number
	expectedOut: number | null
	chainId?: number
	/** La comisión que se le dijo al usuario (THORChain: tope del afiliado del memo). */
	serviceFeeBps?: number
}): OnchainSwapPlan => {
	if (build.from_asset !== from.id || build.to_asset !== to.id) throw new OnchainSwapMismatchError('la ruta es de otro par')
	const amountIn = toUnits(amount, from.decimals)
	if (!amountIn || toUnits(build.amount, from.decimals) !== amountIn) throw new OnchainSwapMismatchError('la ruta es por otro importe')

	// El mínimo que la ruta garantiza, contra lo que se enseñó al elegirla
	const minOut = build.family === 'solana' || build.family === 'tron'
		? (build.toAmountMinUnits ? BigInt(build.toAmountMinUnits) : null)
		: (build.toAmountMin !== null ? toUnits(build.toAmountMin, to.decimals) : null)
	const shown = expectedOut !== null ? toUnits(expectedOut, to.decimals) : null
	if (shown !== null && (minOut === null || minOut * 10_000n < shown * (10_000n - MAX_MIN_OUT_GAP_BPS))) {
		throw new OnchainSwapMismatchError('la ruta garantiza mucho menos de lo cotizado')
	}

	if (build.family === 'evm') {
		if (from.kind !== 'evm') throw new OnchainSwapMismatchError('ruta EVM para un activo de otra red')
		if (chainId === undefined || build.chainId !== chainId) throw new OnchainSwapMismatchError('la ruta es de otra cadena')
		if (build.fromAmount !== null && BigInt(build.fromAmount) !== amountIn) throw new OnchainSwapMismatchError('la ruta es por otro importe')
		if (to.kind !== 'evm' && to.kind !== 'solana') throw new OnchainSwapMismatchError('destino no soportado')
		return {
			family: 'evm',
			chainKey: from.chainKey,
			minOut,
			intent: {
				chainId,
				owner: addresses.evm,
				// SIEMPRE una wallet del propio usuario, de la familia del destino
				receiver: addressForKind(addresses, to.kind),
				token: from.contract,
				amountIn,
			},
		}
	}

	if (build.family === 'tron') {
		if (from.kind !== 'tron' || to.kind !== 'tron') throw new OnchainSwapMismatchError('ruta de TRON para un activo de otra red')
		if (minOut === null || minOut <= 0n) throw new OnchainSwapMismatchError('la ruta no garantiza un mínimo')
		return {
			family: 'tron',
			chainKey: from.chainKey,
			minOut,
			// La wallet codifica la llamada ella misma (wallet/tron/swap.ts): del backend solo el mínimo
			intent: { owner: addresses.tron, inputToken: from.contract, outputToken: to.contract, amountIn, minOut },
		}
	}

	if (build.family === 'btc') {
		if (from.kind !== 'btc') throw new OnchainSwapMismatchError('ruta de BTC para un activo de otra red')
		const pool = THORCHAIN_POOLS[to.id]
		if (!pool || build.pool !== pool) throw new OnchainSwapMismatchError('la ruta es a otro activo')
		if (to.kind !== 'evm' && to.kind !== 'tron') throw new OnchainSwapMismatchError('destino no soportado')
		if (BigInt(build.amountSats) !== amountIn) throw new OnchainSwapMismatchError('la ruta es por otro importe')
		// THORChain cuenta todo en 1e8; lo enseñado al usuario, también en 1e8 para cotejar el límite
		const shownOut = expectedOut !== null ? toUnits(expectedOut, 8) : null
		if (shownOut === null) throw new OnchainSwapMismatchError('falta lo cotizado')
		return {
			family: 'btc',
			chainKey: from.chainKey,
			minOut,
			intent: {
				from: addresses.btc,
				amountSats: amountIn,
				memo: build.memo,
				pool,
				destination: addressForKind(addresses, to.kind),
				shownOut,
				maxAffiliateBps: serviceFeeBps,
			},
		}
	}

	if (from.kind !== 'solana' || to.kind !== 'solana') throw new OnchainSwapMismatchError('ruta de Solana para un activo de otra red')
	if (build.inAmount !== null && BigInt(build.inAmount) !== amountIn) throw new OnchainSwapMismatchError('la ruta es por otro importe')
	if (minOut === null || minOut <= 0n) throw new OnchainSwapMismatchError('la ruta no garantiza un mínimo')
	return {
		family: 'solana',
		chainKey: from.chainKey,
		minOut,
		intent: { owner: addresses.sol, inputMint: from.contract, outputMint: to.contract, amountIn, minOut },
	}
}
