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
 *   SOL  m/44'/501'/0'/0'    (SLIP-0010 ed25519, todo endurecido → base58 de la pública;
 *                             la cuenta 0 de Phantom/Solflare/Trust)
 */
import { HDKey } from '@scure/bip32'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { ed25519 } from '@noble/curves/ed25519.js'
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
	solana: "m/44'/501'/0'/0'",
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
	/** Base58 de la pública ed25519 (en Solana la dirección ES la clave pública). Metadata anterior a Solana no lo trae: WalletContext re-deriva. */
	sol: string
}

type DerivedKey = { privateKey: Uint8Array, publicKey: Uint8Array }

const deriveKey = (seed: Uint8Array, path: string): DerivedKey => {
	const node = HDKey.fromMasterSeed(seed).derive(path)
	if (!node.privateKey || !node.publicKey) throw new Error(`derive: nodo sin claves en ${path}`)
	return { privateKey: node.privateKey, publicKey: node.publicKey }
}

const ED25519_SEED_KEY = Uint8Array.from('ed25519 seed', ch => ch.charCodeAt(0))
const HARDENED = 0x80000000

/**
 * SLIP-0010 para ed25519: solo índices endurecidos (la curva no admite derivación
 * pública). `I = HMAC-SHA512(clave, datos)`; los 32 primeros bytes son la clave privada
 * y los 32 últimos el chain code. Verificado contra los vectores de la spec y contra la
 * dirección que Phantom da para "abandon … about".
 */
export const deriveEd25519 = (seed: Uint8Array, path: string): DerivedKey => {
	const segments = path.split('/').slice(1)
	let I = hmac(sha512, ED25519_SEED_KEY, seed)
	for (const segment of segments) {
		if (!segment.endsWith("'")) throw new Error(`derive: ed25519 solo admite índices endurecidos (${path})`)
		const index = (Number(segment.slice(0, -1)) + HARDENED) >>> 0
		const data = new Uint8Array(37)
		data.set(I.slice(0, 32), 1)
		data[33] = index >>> 24
		data[34] = (index >>> 16) & 0xff
		data[35] = (index >>> 8) & 0xff
		data[36] = index & 0xff
		I = hmac(sha512, I.slice(32), data)
	}
	const privateKey = I.slice(0, 32)
	return { privateKey, publicKey: ed25519.getPublicKey(privateKey) }
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

/** Seed BIP-39 → las direcciones de la wallet. Las claves no salen de aquí. */
export const deriveAddresses = (seed: Uint8Array): WalletAddresses => ({
	evm: evmAddressFromPrivateKey(deriveKey(seed, DERIVATION_PATHS.evm).privateKey),
	tron: tronAddressFromPrivateKey(deriveKey(seed, DERIVATION_PATHS.tron).privateKey),
	btc: btcAddressFromPublicKey(deriveKey(seed, DERIVATION_PATHS.btc).publicKey),
	...stacksAccount(deriveKey(seed, DERIVATION_PATHS.stacks).publicKey),
	sol: bs58.encode(deriveEd25519(seed, DERIVATION_PATHS.solana).publicKey),
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
	family === 'solana' ? deriveEd25519(seed, DERIVATION_PATHS.solana).privateKey : deriveKey(seed, DERIVATION_PATHS[family]).privateKey
