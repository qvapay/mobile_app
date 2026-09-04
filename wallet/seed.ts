/**
 * Mnemonic BIP-39 de la wallet self-custody. Módulo PURO (cero react-native):
 * la entropía sale de `crypto.getRandomValues`, que en la app es el nativo de
 * quick-crypto (polyfills.ts) y en jest node el webcrypto de Node.
 *
 * La seed derivada de aquí NUNCA sale del dispositivo: se guarda solo en el
 * Keychain (`wallet/keystore.ts`) y se lee bajo demanda para firmar.
 */
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/** 12 palabras = 128 bits de entropía (interop total con Trust/MetaMask/Sparrow). */
export const MNEMONIC_STRENGTH_BITS = 128

/** Genera un mnemonic nuevo de 12 palabras (inglés: el único interoperable de facto). */
export const createMnemonic = (): string => generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS)

/** Normaliza input de usuario: minúsculas, espacios colapsados. */
export const normalizeMnemonic = (input: string): string =>
	input.trim().toLowerCase().split(/\s+/).join(' ')

/** ¿Es un mnemonic BIP-39 válido (checksum incluido)? Acepta 12 o 24 palabras. */
export const isValidMnemonic = (input: string): boolean =>
	validateMnemonic(normalizeMnemonic(input), wordlist)

/** Mnemonic → seed BIP-39 de 64 bytes (PBKDF2-SHA512, 2048 iteraciones, sin passphrase). */
export const mnemonicToSeed = (mnemonic: string): Uint8Array =>
	mnemonicToSeedSync(normalizeMnemonic(mnemonic))

/**
 * Palabras a verificar en el quiz de backup: `count` posiciones distintas
 * elegidas con la misma fuente de entropía segura.
 */
export const pickQuizPositions = (wordCount: number, count = 3): number[] => {
	const positions = new Set<number>()
	const cryptoGlobal = (globalThis as { crypto?: { getRandomValues?: (b: Uint32Array) => Uint32Array } }).crypto
	while (positions.size < Math.min(count, wordCount)) {
		const bytes = cryptoGlobal?.getRandomValues
			? cryptoGlobal.getRandomValues(new Uint32Array(1))[0]
			: Math.floor(Math.random() * wordCount)
		positions.add(bytes % wordCount)
	}
	return [...positions].sort((a, b) => a - b)
}
