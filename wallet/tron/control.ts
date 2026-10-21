/**
 * ¿La frase de la wallet controla de verdad su cuenta TRON? PURO.
 *
 * En TRON el dueño de una cuenta es su `owner_permission`, no la clave de la
 * dirección: se puede cambiar por otra dirección (o un multifirma) con una
 * AccountPermissionUpdate. La estafa habitual va por ahí: publican la frase de
 * una cuenta con USDT cuyo permiso de dueño ya es de otro, la víctima la
 * importa, ve el saldo y manda TRX "para la comisión" — que se queda dentro sin
 * que su clave pueda firmar nada. La frase "abandon … about" de los E2E es una.
 *
 * Solo cuenta el permiso de DUEÑO: la app firma con el permiso por defecto (id
 * 0), y quien tiene el de dueño puede rehacer los activos cuando quiera.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import bs58 from 'bs58'

import { postJson } from '../chains/http'
import type { RegistryRpc } from '../registry/types'

type RawKey = { address?: string, weight?: number | string }
type RawPermission = { threshold?: number | string, keys?: RawKey[] }

/** Lo que interesa de `/wallet/getaccount` (con `visible: true`). */
export type RawTronAccountPermissions = { owner_permission?: RawPermission }

export type TronControl =
	| { controlled: true }
	/** `controllers`: quién firma en su lugar (las demás claves del permiso de dueño). */
	| { controlled: false, controllers: string[] }

const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

/**
 * Dirección en una forma comparable. Hay nodos que devuelven hex (`41…`) aunque se
 * pida `visible: true` (ver la nota de `listwitnesses` en CLAUDE.md): las dos formas
 * acaban en los 20 bytes hex. Lo que no se pueda decodificar se compara tal cual.
 */
export const comparableTronAddress = (address: string): string => {
	const trimmed = address.trim()
	if (/^41[0-9a-fA-F]{40}$/.test(trimmed)) return trimmed.slice(2).toLowerCase()
	try {
		const bytes = bs58.decode(trimmed)
		if (bytes.length !== 25 || bytes[0] !== 0x41) return trimmed
		const checksum = sha256(sha256(bytes.slice(0, 21))).slice(0, 4)
		if (!checksum.every((b, i) => b === bytes[21 + i])) return trimmed
		return toHex(bytes.slice(1, 21))
	} catch {
		return trimmed
	}
}

/**
 * Decide si la dirección propia puede firmar SOLA como dueña de la cuenta.
 *
 * @param raw - Respuesta de `/wallet/getaccount` (`{}` si la cuenta nunca se activó).
 * @param own - Dirección TRON de la wallet.
 */
export const tronAccountControl = (raw: RawTronAccountPermissions | null | undefined, own: string): TronControl => {
	const owner = raw?.owner_permission
	// Sin activar, o sin permisos explícitos: la dueña es la propia dirección
	if (!owner?.keys?.length) return { controlled: true }

	const mine = comparableTronAddress(own)
	const threshold = Number(owner.threshold ?? 1) || 1
	const ownWeight = owner.keys
		.filter(key => !!key.address && comparableTronAddress(key.address) === mine)
		.reduce((sum, key) => sum + (Number(key.weight ?? 0) || 0), 0)
	if (ownWeight >= threshold) return { controlled: true }

	const controllers = owner.keys
		.map(key => key.address ?? '')
		.filter(address => !!address && comparableTronAddress(address) !== mine)
	return { controlled: false, controllers: [...new Set(controllers)] }
}

/** Lee los permisos de la cuenta del nodo (HTTP de java-tron; jsonrpc no los ve). */
export const getTronAccountControl = async (rpc: RegistryRpc, address: string, { signal }: { signal?: AbortSignal } = {}): Promise<TronControl> =>
	tronAccountControl(
		await postJson<RawTronAccountPermissions>(`${rpc.url.replace(/\/+$/, '')}/wallet/getaccount`, { address, visible: true }, { signal, headers: rpc.headers }),
		address,
	)
