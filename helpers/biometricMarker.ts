/**
 * Marcador biométrico genérico: un secreto aleatorio guardado en el Keychain
 * con access control biométrico. Autenticar = conseguir leerlo (el prompt
 * del sistema ES la verificación). Independiente de cómo se inició sesión:
 * sirve igual con passkey, contraseña o sesión heredada.
 *
 * Un re-enrolamiento de cara/huella invalida SOLO el marcador (nunca lo que
 * protege de verdad: el PIN sigue siendo el respaldo y el marcador se recrea
 * tras el siguiente PIN correcto). Cada consumidor usa su propio `service`.
 */
import * as Keychain from 'react-native-keychain'

const ACCOUNT = 'marker'

export const hasBiometricMarker = async (service: string): Promise<boolean> => {
	try { return (await Keychain.hasGenericPassword({ service })) === true } catch { return false }
}

/** Crea/renueva el marcador. En iOS no pide biometría al escribir; en Android puede. */
export const enableBiometricMarker = async (service: string): Promise<boolean> => {
	try {
		const bytes = new Uint8Array(32)
		;(globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto?.getRandomValues?.(bytes)
		const marker = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
		await Keychain.setGenericPassword(ACCOUNT, marker, {
			service,
			// Solo biometría, sin código del dispositivo: el PIN de la app es el respaldo
			accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
			accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
		})
		return true
	} catch {
		return false
	}
}

export const disableBiometricMarker = async (service: string): Promise<void> => {
	try { await Keychain.resetGenericPassword({ service }) } catch { /* nada que borrar */ }
}

/**
 * Lanza el prompt biométrico. true = verificado. false = cancelado, fallido
 * o marcador invalidado (re-enrolamiento): el caller cae al PIN. Si el
 * marcador quedó invalidado se borra para que el próximo PIN lo recree.
 */
export const authenticateBiometricMarker = async (service: string, promptTitle: string): Promise<boolean> => {
	try {
		const result = await Keychain.getGenericPassword({ service, authenticationPrompt: { title: promptTitle } })
		return result !== false && result.password.length > 0
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		// iOS: -25293 (errSecAuthFailed / invalidado). Android: KeyPermanentlyInvalidatedException
		if (/invalidat|-25293|permanently/i.test(message)) await disableBiometricMarker(service)
		return false
	}
}
