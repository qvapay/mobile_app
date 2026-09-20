/**
 * Lecturas TRON. PURO. El registry declara dos dialectos:
 * - HTTP de java-tron/TronGrid (por defecto): `/wallet/getaccount` y
 *   `/wallet/triggerconstantcontract` con `visible: true` (direcciones base58).
 * - `api: 'jsonrpc'`: la capa eth_* de TRON, que habla direcciones hex de 20
 *   bytes (sin el prefijo 0x41).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import bs58 from 'bs58'

import { encodeBalanceOf, getEvmNativeBalance, getEvmTokenBalance } from './evm'
import { hexToBigInt, postJson } from './http'
import type { RegistryRpc } from '../registry/types'

const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

/** T… (base58check) → 20 bytes hex sin prefijo. Verifica checksum y prefijo 0x41. */
export const tronToHex20 = (address: string): string => {
	const bytes = bs58.decode(address)
	if (bytes.length !== 25 || bytes[0] !== 0x41) throw new Error(`tron: dirección inválida ${address}`)
	const payload = bytes.slice(0, 21)
	const checksum = sha256(sha256(payload)).slice(0, 4)
	if (!checksum.every((b, i) => b === bytes[21 + i])) throw new Error(`tron: checksum inválido ${address}`)
	return toHex(payload.slice(1))
}

/** Los nodos jsonrpc se registran con o sin el sufijo `/jsonrpc`: normalizar. */
export const tronJsonRpcUrl = (url: string): string => (url.replace(/\/+$/, '').endsWith('/jsonrpc') ? url.replace(/\/+$/, '') : `${url.replace(/\/+$/, '')}/jsonrpc`)

type Options = { signal?: AbortSignal }

export const getTronNativeBalance = async (rpc: RegistryRpc, address: string, { signal }: Options = {}): Promise<bigint> => {
	if (rpc.api === 'jsonrpc') {
		return getEvmNativeBalance(tronJsonRpcUrl(rpc.url), `0x${tronToHex20(address)}`, { signal, headers: rpc.headers })
	}
	// Cuenta nunca activada = `{}` sin `balance`: saldo 0, no error
	const account = await postJson<{ balance?: number | string }>(`${rpc.url.replace(/\/+$/, '')}/wallet/getaccount`, { address, visible: true }, { signal, headers: rpc.headers })
	return BigInt(account?.balance ?? 0)
}

export const getTronTokenBalance = async (rpc: RegistryRpc, token: string, owner: string, { signal }: Options = {}): Promise<bigint> => {
	if (rpc.api === 'jsonrpc') {
		return getEvmTokenBalance(tronJsonRpcUrl(rpc.url), `0x${tronToHex20(token)}`, `0x${tronToHex20(owner)}`, { signal, headers: rpc.headers })
	}
	const response = await postJson<{ constant_result?: string[], result?: { result?: boolean, message?: string } }>(
		`${rpc.url.replace(/\/+$/, '')}/wallet/triggerconstantcontract`,
		{
			owner_address: owner,
			contract_address: token,
			function_selector: 'balanceOf(address)',
			// El nodo añade el selector: aquí va solo el argumento codificado
			parameter: encodeBalanceOf(tronToHex20(owner)).slice(10),
			visible: true,
		},
		{ signal, headers: rpc.headers },
	)
	if (response?.result?.result === false) throw new Error(`tron: balanceOf falló (${response.result.message ?? 'sin mensaje'})`)
	return hexToBigInt(response?.constant_result?.[0])
}
