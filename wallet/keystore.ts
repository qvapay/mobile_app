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
 * Marcador aleatorio guardado con access control biométrico. Autenticar =
 * conseguir leerlo (el prompt del sistema ES la verificación). La seed sigue
 * SIN access control (regla 2): si el usuario re-enrola su cara/huella, lo
 * único que se invalida es este marcador, se vuelve al PIN y se recrea tras
 * el siguiente PIN correcto. Nunca se toca la seed desde aquí.
 */
const WALLET_BIO_SERVICE = 'com.qvapay.walletbio'
const WALLET_BIO_ACCOUNT = 'marker'

export const hasWalletBiometrics = async (): Promise<boolean> => {
	try { return (await Keychain.hasGenericPassword({ service: WALLET_BIO_SERVICE })) === true } catch { return false }
}

/** Crea/renueva el marcador. En iOS no pide biometría al escribir; en Android puede. */
export const enableWalletBiometrics = async (): Promise<boolean> => {
	try {
		const bytes = new Uint8Array(32)
		;(globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto?.getRandomValues?.(bytes)
		const marker = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
		await Keychain.setGenericPassword(WALLET_BIO_ACCOUNT, marker, {
			service: WALLET_BIO_SERVICE,
			// Solo biometría, sin código del dispositivo: el PIN de la wallet ya es el respaldo
			accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
			accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
		})
		return true
	} catch {
		return false
	}
}

export const disableWalletBiometrics = async (): Promise<void> => {
	try { await Keychain.resetGenericPassword({ service: WALLET_BIO_SERVICE }) } catch { /* nada que borrar */ }
}

/**
 * Lanza el prompt biométrico. true = verificado. false = cancelado, fallido
 * o marcador invalidado (re-enrolamiento): el caller cae al PIN. Si el
 * marcador quedó invalidado se borra para que el próximo PIN lo recree.
 */
export const authenticateWalletBiometrics = async (promptTitle: string): Promise<boolean> => {
	try {
		const result = await Keychain.getGenericPassword({ service: WALLET_BIO_SERVICE, authenticationPrompt: { title: promptTitle } })
		return result !== false && result.password.length > 0
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		// iOS: -25293 (errSecAuthFailed / invalidado). Android: KeyPermanentlyInvalidatedException
		if (/invalidat|-25293|permanently/i.test(message)) await disableWalletBiometrics()
		return false
	}
}
