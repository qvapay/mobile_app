/**
 * Prueba de dueño del dispositivo: huella/cara O el código del teléfono, en un diálogo
 * del SISTEMA. Responde a «¿quien tiene el teléfono en la mano es su dueño?».
 *
 * Existe para un único caso: crear el PRIMER PIN cuando ya hay una wallet en el teléfono.
 * Ahí no hay PIN nuestro que pedir, y el que se cree pasa a proteger la frase: sin esta
 * prueba, cualquiera con el teléfono desbloqueado pondría el suyo y, con él, vería la
 * frase o firmaría. No sustituye al PIN ni a `helpers/biometricMarker` (que pregunta otra
 * cosa: «¿es la huella de siempre?», y por eso NO admite el código del teléfono).
 *
 * - **Android**: `BiometricGate.confirmDeviceOwner` (bridge/BiometricGateModule.kt), un
 *   `BiometricPrompt` con biometría o credencial del dispositivo.
 * - **iOS**: una entrada efímera del Keychain con `USER_PRESENCE` (biometría o código):
 *   leerla hace que el sistema pida Face ID / Touch ID con el código de respaldo. Se crea,
 *   se lee y se borra en la misma llamada; no guarda nada.
 */
import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'

import { getBiometricGate } from './biometricMarker'

/**
 * `unavailable`: el teléfono NO tiene bloqueo de pantalla, así que no hay credencial con la
 * que probar nada. Cualquier otro motivo por el que el diálogo no se pueda mostrar es `error`.
 */
export type DeviceOwnerOutcome = 'success' | 'cancelled' | 'unavailable' | 'error'

const IOS_SERVICE = 'com.qvapay.ownerproof'
const IOS_ACCOUNT = 'owner'

const randomHex = (): string => {
	const bytes = new Uint8Array(16)
	;(globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto?.getRandomValues?.(bytes)
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

const confirmOnIos = async (title: string): Promise<DeviceOwnerOutcome> => {
	// Sin código en el iPhone ni Face ID se puede registrar: no hay con qué probar
	let secured: boolean
	try {
		secured = await Keychain.canImplyAuthentication({ authenticationType: Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS })
	} catch {
		return 'error'
	}
	if (!secured) return 'unavailable'

	const nonce = randomHex()
	try {
		await Keychain.setGenericPassword(IOS_ACCOUNT, nonce, {
			service: IOS_SERVICE,
			accessControl: Keychain.ACCESS_CONTROL.USER_PRESENCE,
			accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
		})
		const read = await Keychain.getGenericPassword({ service: IOS_SERVICE, authenticationPrompt: { title } })
		// Solo cuenta haber leído ESTA entrada: es lo que prueba que el sistema autenticó ahora
		return read !== false && read.password === nonce ? 'success' : 'error'
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		// errSecUserCanceled (-128): el usuario cerró el diálogo
		return /cancel|-128/i.test(message) ? 'cancelled' : 'error'
	} finally {
		try { await Keychain.resetGenericPassword({ service: IOS_SERVICE }) } catch { /* nada que borrar */ }
	}
}

/**
 * Lanza el diálogo del sistema y dice qué pasó. Nunca lanza.
 *
 * @param title - Título del diálogo (qué se está confirmando).
 * @param subtitle - Solo Android: segunda línea del diálogo.
 */
export const confirmDeviceOwner = async (title: string, subtitle = ''): Promise<DeviceOwnerOutcome> => {
	if (Platform.OS === 'android') {
		const gate = getBiometricGate()
		if (!gate || typeof gate.confirmDeviceOwner !== 'function') return 'error'
		try {
			const outcome = await gate.confirmDeviceOwner(title, subtitle)
			// `busy` (otro diálogo abierto) y cualquier valor inesperado no prueban nada
			return outcome === 'success' || outcome === 'cancelled' || outcome === 'unavailable' ? outcome : 'error'
		} catch {
			return 'error'
		}
	}
	return confirmOnIos(title)
}

/**
 * ¿Basta este resultado para dejar crear el PIN?
 *
 * `success`, claro. Y `unavailable`: en un teléfono sin bloqueo de pantalla no existe prueba
 * posible, y negarse dejaría a su dueño sin poder proteger (ni usar) su wallet. No abre un
 * atajo: quitar el bloqueo del teléfono para caer aquí exige conocer su código, que es
 * justo lo que el atacante no tiene. `cancelled` y `error` no pasan nunca.
 */
export const ownerProofPasses = (outcome: DeviceOwnerOutcome): boolean => outcome === 'success' || outcome === 'unavailable'
