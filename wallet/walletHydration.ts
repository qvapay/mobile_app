/**
 * Qué wallet hay en este teléfono al arrancar. Módulo PURO: decide con lo que le dan, no
 * toca Keychain ni AsyncStorage (eso lo hace `WalletContext`, que le inyecta las lecturas).
 *
 * Hay DOS fuentes y pueden no coincidir: la metadata pública (direcciones + estado del
 * backup, en AsyncStorage) y la seed (Keychain). Antes se trataban como un sí/no cada una
 * y cualquier fallo caía en «no hay wallet», con dos consecuencias:
 *
 * - **Wallet sin llaves.** En Android, al pasar de un teléfono a otro viajan los datos de la
 *   app pero no las claves del Keystore: la entrada de la seed «existe» y no se puede
 *   descifrar. La app enseñaba la wallet entera (saldos, Recibir) sin poder firmar, y quien
 *   lo creyera migrado borraba el teléfono viejo.
 * - **Seed pisada.** Una lectura fallida al arrancar dejaba «sin wallet», la app ofrecía
 *   crear o importar, y la seed que seguía en el Keychain se sobrescribía.
 *
 * Por eso aquí hay tres desenlaces y no dos: no hay wallet (confirmado), hay wallet usable,
 * o hay una wallet cuyas llaves no se pueden usar ahora (`recovery`): ni se enseña como
 * sana ni se deja crear otra encima.
 */
import type { WalletAddresses } from './derive'
import type { SeedEntry } from './keystore'

/** Metadata pública (direcciones + backup); el secreto vive solo en Keychain. */
export type WalletMeta = { addresses: WalletAddresses, backedUp: boolean }

/**
 * Una wallet que está en el teléfono pero cuyas llaves no se pueden usar.
 * - `unreadable`: la entrada de la seed existe y no se deja leer (o lo leído no es una frase).
 * - `unknown`: el Keychain no respondió y no se sabe ni si hay seed.
 *
 * `addresses`: las de la wallet que había, si se conocen. Son lo que permite restaurar con
 * la frase SIN riesgo: solo se acepta la que da esas mismas direcciones.
 */
export type WalletRecovery = { addresses: WalletAddresses | null, reason: 'unreadable' | 'unknown' }

export type Hydration =
	/** El Keychain confirma que no hay seed: se puede crear o importar. */
	| { kind: 'none' }
	/**
	 * Wallet usable. `verified`: se llegó a leer la seed para comprobarla, así que toca
	 * guardar la metadata (puede haberse corregido) y renovar el testigo.
	 */
	| { kind: 'ready', meta: WalletMeta, verified: boolean }
	| { kind: 'recovery', recovery: WalletRecovery }

export type HydrationDeps = {
	/** La metadata tal cual está en disco. Puede lanzar (AsyncStorage roto). */
	readMeta: () => Promise<string | null>
	seedEntry: () => Promise<SeedEntry>
	/** El testigo (`getWalletCheck`): dirección EVM de la seed que se pudo leer aquí. */
	readCheck: () => Promise<string | null>
	/** La seed, o null si no se deja leer. */
	readMnemonic: () => Promise<string | null>
	isValidMnemonic: (mnemonic: string) => boolean
	derive: (mnemonic: string) => WalletAddresses
}

const ADDRESS_FIELDS: (keyof WalletAddresses)[] = ['evm', 'tron', 'btc', 'stx', 'stxPublicKey', 'sol']

/** Metadata de antes de Stacks o de Solana no trae todas: hay que re-derivar. */
const hasEveryAddress = (addresses: WalletAddresses): boolean =>
	ADDRESS_FIELDS.every(field => typeof addresses[field] === 'string' && addresses[field].length > 0)

/** Dos juegos de direcciones son de la misma seed si comparten la EVM (todas salen de ella). */
export const sameWallet = (a: WalletAddresses, b: WalletAddresses): boolean =>
	a.evm.toLowerCase() === b.evm.toLowerCase()

/** Lo guardado puede estar corrupto o ser de una versión vieja: o tiene forma de metadata, o es null. */
export const parseWalletMeta = (raw: string | null): WalletMeta | null => {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as { addresses?: Partial<WalletAddresses>, backedUp?: unknown } | null
		const addresses = parsed?.addresses
		if (!addresses || typeof addresses !== 'object' || typeof addresses.evm !== 'string' || !addresses.evm) return null
		return { addresses: addresses as WalletAddresses, backedUp: parsed.backedUp !== false }
	} catch {
		return null
	}
}

export const hydrateWallet = async (deps: HydrationDeps): Promise<Hydration> => {
	// La metadata nunca decide si hay wallet: un disco que falla solo la deja en blanco
	let stored: WalletMeta | null = null
	try { stored = parseWalletMeta(await deps.readMeta()) } catch { stored = null }

	const entry = await deps.seedEntry()
	if (entry === 'absent') return { kind: 'none' }
	if (entry === 'unknown') return { kind: 'recovery', recovery: { addresses: stored?.addresses ?? null, reason: 'unknown' } }

	// Hay entrada. Lo normal: el testigo responde por ella y la seed ni se descifra
	if (stored && hasEveryAddress(stored.addresses)) {
		const check = await deps.readCheck()
		if (check && check.toLowerCase() === stored.addresses.evm.toLowerCase()) return { kind: 'ready', meta: stored, verified: false }
	}

	// Sin testigo que valga (primera vez, teléfono nuevo, metadata incompleta): leer la seed
	const mnemonic = await deps.readMnemonic()
	if (!mnemonic || !deps.isValidMnemonic(mnemonic)) {
		return { kind: 'recovery', recovery: { addresses: stored?.addresses ?? null, reason: 'unreadable' } }
	}
	const addresses = deps.derive(mnemonic)
	// Manda la seed: una metadata que falta o que era de otra seed no dice nada del backup,
	// y se da por hecho (la seed ya estaba instalada; bloquear la wallet sería peor)
	const backedUp = stored && sameWallet(stored.addresses, addresses) ? stored.backedUp : true
	return { kind: 'ready', meta: { addresses, backedUp }, verified: true }
}
