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
 */
import * as Keychain from 'react-native-keychain'

import { authenticateBiometricMarker, disableBiometricMarker, enableBiometricMarker, hasBiometricMarker } from '../helpers/biometricMarker'

const WALLET_SERVICE = 'com.qvapay.wallet'
const WALLET_ACCOUNT = 'mnemonic'

/**
 * Guarda el mnemonic. Verifica leyendo de vuelta: un write silenciosamente
 * fallido aquí significaría mostrar direcciones de una seed no persistida.
 *
 * @returns true solo si quedó guardado y verificado.
 */
export const setWalletMnemonic = async (mnemonic: string): Promise<boolean> => {
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

/** ¿Hay wallet creada en este dispositivo? (no lee el secreto). */
export const hasWalletMnemonic = async (): Promise<boolean> => {
	try {
		return (await Keychain.hasGenericPassword({ service: WALLET_SERVICE })) === true
	} catch {
		return false
	}
}

/**
 * Borra la seed. SOLO para el flujo explícito "Eliminar wallet" — jamás
 * llamarlo desde manejo de errores ni desde el logout.
 */
export const removeWalletMnemonic = async (): Promise<boolean> => {
	try {
		return await Keychain.resetGenericPassword({ service: WALLET_SERVICE })
	} catch {
		return false
	}
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
