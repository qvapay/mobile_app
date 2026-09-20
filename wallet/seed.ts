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

type RandomSource = (maxExclusive: number) => number

/**
 * Entero uniforme en [0, maxExclusive) con la entropía segura del sistema
 * (quick-crypto en la app, webcrypto en jest). Rechazo de muestras para no
 * sesgar por el módulo: con 2^32 valores y listas pequeñas el sesgo sería
 * mínimo, pero en un flujo de seguridad no cuesta nada hacerlo bien.
 */
export const secureRandomInt: RandomSource = (maxExclusive) => {
	if (maxExclusive <= 1) return 0
	const cryptoGlobal = (globalThis as { crypto?: { getRandomValues?: (b: Uint32Array) => Uint32Array } }).crypto
	if (!cryptoGlobal?.getRandomValues) throw new Error('seed: crypto.getRandomValues no disponible')
	const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
	for (;;) {
		const value = cryptoGlobal.getRandomValues(new Uint32Array(1))[0]
		if (value < limit) return value % maxExclusive
	}
}

/** Fisher-Yates con fuente aleatoria inyectable (segura por defecto). No muta la entrada. */
export const shuffleSecure = <T>(items: readonly T[], random: RandomSource = secureRandomInt): T[] => {
	const result = items.slice()
	for (let i = result.length - 1; i > 0; i--) {
		const j = random(i + 1)
		;[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

/**
 * Palabras a verificar en el quiz de backup: `count` posiciones distintas
 * elegidas con la misma fuente de entropía segura.
 */
export const pickQuizPositions = (wordCount: number, count = 3, random: RandomSource = secureRandomInt): number[] => {
	const positions = new Set<number>()
	while (positions.size < Math.min(count, wordCount)) positions.add(random(wordCount))
	return [...positions].sort((a, b) => a - b)
}

/** Preguntas del quiz de backup (antes 3: con 4 adivinar al azar baja a 1/81). */
export const QUIZ_QUESTIONS = 4
/** Opciones por pregunta: la correcta + señuelos de la MISMA frase. */
export const QUIZ_OPTIONS = 3

export type QuizQuestion = { position: number, options: string[] }

/**
 * Construye el quiz: posiciones al azar y, en cada una, la palabra correcta
 * barajada con señuelos de otras posiciones. Palabras repetidas en la frase
 * (BIP-39 las permite) no pueden aparecer dos veces entre las opciones: los
 * señuelos se eligen entre palabras DISTINTAS de la correcta.
 */
export const buildQuiz = (
	words: readonly string[],
	questions = QUIZ_QUESTIONS,
	options = QUIZ_OPTIONS,
	random: RandomSource = secureRandomInt,
): QuizQuestion[] =>
	pickQuizPositions(words.length, questions, random).map(position => {
		const correct = words[position]
		const pool = [...new Set(words.filter(word => word !== correct))]
		const decoys = shuffleSecure(pool, random).slice(0, options - 1)
		return { position, options: shuffleSecure([correct, ...decoys], random) }
	})
