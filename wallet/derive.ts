/**
 * Derivación HD multi-cadena (BIP-32/44/84) — módulo PURO, testeado con
 * vectores conocidos contra Trust Wallet/Sparrow (misma frase → mismas
 * direcciones, la prueba de que esto es self-custody real e interoperable).
 *
 * Paths v1 (una cuenta por familia; BSC/ETH/Base comparten la dirección EVM):
 *   EVM  m/44'/60'/0'/0/0
 *   TRON m/44'/195'/0'/0/0   (secp256k1 + keccak → base58check con prefijo 0x41)
 *   BTC  m/84'/0'/0'/0/0     (P2WPKH bech32)
 *   STX  m/44'/5757'/0'/0/0  (c32check versión 22 → SP…; la cuenta 0 de Leather/Xverse)
 */
import { HDKey } from '@scure/bip32'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { p2wpkh } from '@scure/btc-signer'
import bs58 from 'bs58'
import { bytesToHex } from 'viem'
import { privateKeyToAddress } from 'viem/accounts'
import { getAddressFromPublicKey } from '@stacks/transactions'

export const DERIVATION_PATHS = {
	evm: "m/44'/60'/0'/0/0",
	tron: "m/44'/195'/0'/0/0",
	btc: "m/84'/0'/0'/0/0",
	stacks: "m/44'/5757'/0'/0/0",
} as const

export type WalletAddresses = {
	/** Dirección 0x con checksum EIP-55; vale para ETH, BSC y Base. */
	evm: string
	/** Base58check con prefijo 0x41 (T…). */
	tron: string
	/** Bech32 P2WPKH (bc1q…). */
	btc: string
	/** c32check mainnet (SP…). Metadata anterior a Stacks no lo trae: WalletContext re-deriva. */
	stx: string
	/** Clave PÚBLICA comprimida (hex) de la cuenta Stacks: la tx sin firmar la necesita y así se construye sin leer la seed. */
	stxPublicKey: string
}

type DerivedKey = { privateKey: Uint8Array, publicKey: Uint8Array }

const deriveKey = (seed: Uint8Array, path: string): DerivedKey => {
	const node = HDKey.fromMasterSeed(seed).derive(path)
	if (!node.privateKey || !node.publicKey) throw new Error(`derive: nodo sin claves en ${path}`)
	return { privateKey: node.privateKey, publicKey: node.publicKey }
}

/** privkey EVM → dirección EIP-55 (keccak del pubkey sin comprimir, últimos 20 bytes). */
const evmAddressFromPrivateKey = (privateKey: Uint8Array): string =>
	privateKeyToAddress(bytesToHex(privateKey))

/** privkey TRON → T… : mismo esquema que EVM pero con prefijo 0x41 y base58check. */
const tronAddressFromPrivateKey = (privateKey: Uint8Array): string => {
	const publicKey = secp256k1.getPublicKey(privateKey, false)
	const hash = keccak_256(publicKey.slice(1))
	const payload = new Uint8Array(21)
	payload[0] = 0x41
	payload.set(hash.slice(-20), 1)
	const checksum = sha256(sha256(payload)).slice(0, 4)
	const full = new Uint8Array(25)
	full.set(payload)
	full.set(checksum, 21)
	return bs58.encode(full)
}

const btcAddressFromPublicKey = (publicKey: Uint8Array): string => {
	const address = p2wpkh(publicKey).address
	if (!address) throw new Error('derive: p2wpkh sin dirección')
	return address
}

/** Seed BIP-39 → las tres direcciones de la wallet. Las claves no salen de aquí. */
export const deriveAddresses = (seed: Uint8Array): WalletAddresses => ({
	evm: evmAddressFromPrivateKey(deriveKey(seed, DERIVATION_PATHS.evm).privateKey),
	tron: tronAddressFromPrivateKey(deriveKey(seed, DERIVATION_PATHS.tron).privateKey),
	btc: btcAddressFromPublicKey(deriveKey(seed, DERIVATION_PATHS.btc).publicKey),
	...stacksAccount(deriveKey(seed, DERIVATION_PATHS.stacks).publicKey),
})

const stacksAccount = (publicKey: Uint8Array): Pick<WalletAddresses, 'stx' | 'stxPublicKey'> => {
	const stxPublicKey = bytesToHex(publicKey).slice(2)
	return { stx: getAddressFromPublicKey(stxPublicKey, 'mainnet'), stxPublicKey }
}

/**
 * Clave privada para FIRMAR en una familia de cadenas. Solo la llaman los
 * módulos de firma (`sign.ts`), con la seed recién leída del Keychain y tras
 * el gate de AppLock; no retener la clave devuelta.
 */
export const derivePrivateKey = (seed: Uint8Array, family: keyof typeof DERIVATION_PATHS): Uint8Array =>
	deriveKey(seed, DERIVATION_PATHS[family]).privateKey
