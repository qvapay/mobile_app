/**
 * Almacenamiento del mnemonic de la wallet self-custody. ÚNICO archivo de
 * `wallet/` autorizado a tocar react-native (Keychain).
 *
 * Decisiones de seguridad (threat model del plan crypto — NO cambiar a la ligera):
 * - Servicio propio `com.qvapay.wallet`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
 *   (nunca sincroniza a iCloud/backups) y **SIN access control biométrico a
 *   nivel Keychain**: el patrón de `getBiometricCredentials` (api/client.ts)
 *   BORRA la entrada cuando el access control se invalida al re-enrolar
 *   huellas — con credenciales de login es una molestia, con una seed es
 *   pérdida de fondos. El gate biométrico/PIN vive en capa de app
 *   (AppLockContext / usePinEntry) antes de llamar a `getWalletMnemonic`.
 * - NINGÚN catch de este módulo borra la entrada. Borrar la seed exige el
 *   flujo explícito "Eliminar wallet" (re-confirmación de backup mediante).
 * - El logout NO pasa por aquí: la seed sobrevive a `clearAuthData`.
 * - Una seed NUNCA se pisa en silencio: `setWalletMnemonic` se niega si ya hay
 *   una entrada (o si no puede comprobarlo), salvo que quien llama pida
 *   `overwrite` — y solo lo pide «Restaurar», tras comprobar que la frase es
 *   la de la MISMA wallet.
 * - «¿Hay seed?» tiene tres respuestas, no dos (`walletSeedEntry`): sí, no y
 *   «no lo sé». Tratar el «no lo sé» como «no» es lo que dejaba crear una
 *   wallet encima de otra.
 */
import * as Keychain from 'react-native-keychain'

import { authenticateBiometricMarker, disableBiometricMarker, enableBiometricMarker, hasBiometricMarker } from '../helpers/biometricMarker'

const WALLET_SERVICE = 'com.qvapay.wallet'
const WALLET_ACCOUNT = 'mnemonic'

/**
 * ¿Hay una entrada de seed en el Keychain? Sin leer el secreto.
 * - `present`: hay una. OJO: que exista no dice que se deje leer (en Android, tras pasar
 *   de un teléfono a otro, viajan los datos cifrados pero no la clave que los descifra).
 * - `absent`: el Keychain CONFIRMA que no hay. Único estado en el que se puede crear o importar.
 * - `unknown`: el Keychain no respondió. No se sabe; quien decide tiene que ser conservador.
 */
export type SeedEntry = 'present' | 'absent' | 'unknown'

export const walletSeedEntry = async (): Promise<SeedEntry> => {
	try {
		return (await Keychain.hasGenericPassword({ service: WALLET_SERVICE })) === true ? 'present' : 'absent'
	} catch {
		return 'unknown'
	}
}

/**
 * Guarda el mnemonic. Verifica leyendo de vuelta: un write silenciosamente
 * fallido aquí significaría mostrar direcciones de una seed no persistida.
 *
 * Se NIEGA a escribir si ya hay una entrada (o si no puede saberlo): pisar una seed es
 * perder una wallet. `overwrite` es solo para «Restaurar», que antes ha comprobado que la
 * frase da las mismas direcciones que la wallet cuya seed no se dejaba leer.
 *
 * @returns true solo si quedó guardado y verificado.
 */
export const setWalletMnemonic = async (mnemonic: string, { overwrite = false }: { overwrite?: boolean } = {}): Promise<boolean> => {
	if (!overwrite && (await walletSeedEntry()) !== 'absent') return false
	try {
		await Keychain.setGenericPassword(WALLET_ACCOUNT, mnemonic, {
			service: WALLET_SERVICE,
			accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
		})
		const readBack = await Keychain.getGenericPassword({ service: WALLET_SERVICE })
		return readBack !== false && readBack.password === mnemonic
	} catch {
		return false
	}
}

/**
 * Lee el mnemonic. Llamar SOLO tras el gate de AppLock (firmar, mostrar
 * backup, export) y no retener el valor devuelto más allá del uso inmediato.
 *
 * @returns El mnemonic, o null si no hay wallet o el read falló (un fallo de
 * lectura NUNCA borra nada: reintentar es seguro).
 */
export const getWalletMnemonic = async (): Promise<string | null> => {
	try {
		const credentials = await Keychain.getGenericPassword({ service: WALLET_SERVICE })
		return credentials ? credentials.password : null
	} catch {
		return null
	}
}

/**
 * Borra la seed. SOLO para el flujo explícito "Eliminar wallet" — jamás
 * llamarlo desde manejo de errores ni desde el logout.
 *
 * @returns true solo si el Keychain CONFIRMA después que ya no hay seed. Lo que devuelve
 * el borrado no basta: si la seed sigue ahí, la wallet no está eliminada.
 */
export const removeWalletMnemonic = async (): Promise<boolean> => {
	try {
		await Keychain.resetGenericPassword({ service: WALLET_SERVICE })
	} catch { /* decide la comprobación de abajo */ }
	return (await walletSeedEntry()) === 'absent'
}

// ---------------------------------------------------------------------------
// Testigo: «la seed de ESTA dirección se pudo leer en ESTE teléfono»
// ---------------------------------------------------------------------------

/**
 * Entrada aparte, sin nada secreto: la dirección EVM (pública) de la seed que se guardó o
 * se leyó bien en este teléfono. Sirve para no tener que descifrar la seed en cada arranque
 * solo para saber si las llaves siguen aquí: si el testigo se deja leer y coincide con la
 * metadata, las claves del Keystore de la app están intactas. Tras pasar de un teléfono a
 * otro en Android no se puede leer (viajó cifrado, sin su clave) y entonces sí se comprueba
 * la seed de verdad.
 */
const WALLET_CHECK_SERVICE = 'com.qvapay.walletcheck'

/** @returns El testigo, o null si no hay o no se deja leer (da igual: en ambos casos toca comprobar la seed). */
export const getWalletCheck = async (): Promise<string | null> => {
	try {
		const stored = await Keychain.getGenericPassword({ service: WALLET_CHECK_SERVICE })
		return stored ? stored.password : null
	} catch {
		return null
	}
}

export const setWalletCheck = async (address: string): Promise<boolean> => {
	try {
		await Keychain.setGenericPassword('check', address.toLowerCase(), {
			service: WALLET_CHECK_SERVICE,
			accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
		})
		return true
	} catch {
		return false
	}
}

/** Solo desde "Eliminar wallet". */
export const removeWalletCheck = async (): Promise<void> => {
	try { await Keychain.resetGenericPassword({ service: WALLET_CHECK_SERVICE }) } catch { }
}

// ---------------------------------------------------------------------------
// Biometría PROPIA de la wallet (independiente del login)
// ---------------------------------------------------------------------------

/**
 * Marcador biométrico de la wallet (helpers/biometricMarker con servicio
 * propio). La seed sigue SIN access control (regla 2): un re-enrolamiento
 * solo invalida el marcador; se vuelve al PIN y se recrea después.
 */
const WALLET_BIO_SERVICE = 'com.qvapay.walletbio'

export const hasWalletBiometrics = (): Promise<boolean> => hasBiometricMarker(WALLET_BIO_SERVICE)
export const enableWalletBiometrics = (): Promise<boolean> => enableBiometricMarker(WALLET_BIO_SERVICE)
export const disableWalletBiometrics = (): Promise<void> => disableBiometricMarker(WALLET_BIO_SERVICE)
export const authenticateWalletBiometrics = (promptTitle: string): Promise<boolean> => authenticateBiometricMarker(WALLET_BIO_SERVICE, promptTitle)

// ---------------------------------------------------------------------------
// ID de wallet (intercambio sin cuenta QvaPay)
// ---------------------------------------------------------------------------

/**
 * 32 bytes aleatorios que identifican ESTA wallet ante `/wallet/exchange` cuando no hay sesión
 * (cabecera `X-QvaPay-Wallet-Id`; el backend solo guarda su sha256 como dueño de cotizaciones
 * y operaciones). No deriva de la seed ni es PII: es una capacidad — quien no lo tiene no ve
 * ni toca los intercambios de esta wallet. Se crea perezosamente en el primer uso (cubre
 * wallets anteriores a esto) y se borra con "Eliminar wallet": una wallet nueva no hereda el
 * historial de la anterior.
 */
const WALLET_ID_SERVICE = 'com.qvapay.walletid'
const WALLET_ID_RE = /^[0-9a-f]{64}$/

let walletIdPromise: Promise<string | null> | null = null

const randomHex32 = (): string | null => {
	const cryptoGlobal = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto
	if (!cryptoGlobal?.getRandomValues) return null
	return Array.from(cryptoGlobal.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
}

const loadOrCreateWalletId = async (): Promise<string | null> => {
	try {
		const stored = await Keychain.getGenericPassword({ service: WALLET_ID_SERVICE })
		if (stored && WALLET_ID_RE.test(stored.password)) return stored.password
		const fresh = randomHex32()
		if (!fresh) return null
		await Keychain.setGenericPassword('walletid', fresh, {
			service: WALLET_ID_SERVICE,
			accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
		})
		return fresh
	} catch {
		return null
	}
}

/** El ID de wallet (creándolo si no existe), o null si el Keychain falló. Memoizado. */
export const getWalletId = (): Promise<string | null> => {
	if (!walletIdPromise) {
		walletIdPromise = loadOrCreateWalletId().then(id => {
			if (!id) walletIdPromise = null // un fallo no se memoriza: el siguiente reintenta
			return id
		})
	}
	return walletIdPromise
}

/** Solo desde "Eliminar wallet". */
export const removeWalletId = async (): Promise<void> => {
	walletIdPromise = null
	try { await Keychain.resetGenericPassword({ service: WALLET_ID_SERVICE }) } catch { }
}
