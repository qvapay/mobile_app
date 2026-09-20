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
