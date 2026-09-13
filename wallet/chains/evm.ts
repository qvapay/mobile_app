/**
 * Lecturas EVM (Ethereum, BSC, Base, Polygon) por JSON-RPC estándar. PURO.
 * Sin viem a propósito para lecturas: son dos métodos y una llamada de
 * `balanceOf`; viem entra en la Fase 4 para construir y firmar transacciones.
 */
import { hexToBigInt, jsonRpc } from './http'

/** Selector de `balanceOf(address)` = keccak256('balanceOf(address)')[0..4]. */
export const BALANCE_OF_SELECTOR = '0x70a08231'

/** Calldata de `balanceOf(owner)`: selector + address sin 0x, left-pad a 32 bytes. */
export const encodeBalanceOf = (owner20Hex: string): string => {
	const clean = owner20Hex.toLowerCase().replace(/^0x/, '')
	if (!/^[0-9a-f]{40}$/.test(clean)) throw new Error(`evm: dirección inválida ${owner20Hex}`)
	return `${BALANCE_OF_SELECTOR}${clean.padStart(64, '0')}`
}

type Options = { signal?: AbortSignal, headers?: Record<string, string> }

export const getEvmNativeBalance = async (rpcUrl: string, address: string, options?: Options): Promise<bigint> =>
	hexToBigInt(await jsonRpc<string>(rpcUrl, 'eth_getBalance', [address, 'latest'], options))

export const getEvmTokenBalance = async (rpcUrl: string, token: string, owner: string, options?: Options): Promise<bigint> =>
	hexToBigInt(await jsonRpc<string>(rpcUrl, 'eth_call', [{ to: token, data: encodeBalanceOf(owner) }, 'latest'], options))
