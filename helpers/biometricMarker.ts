/**
 * Marcador biométrico genérico: autenticar = el usuario pone la huella o la
 * cara en un diálogo NUESTRO, ahora. Independiente de cómo se inició sesión:
 * sirve igual con passkey, contraseña o sesión heredada. Lo usan el bloqueo
 * (`com.qvapay.applock.bio`) y la firma de la wallet, cada uno con su `service`.
 *
 * - **iOS**: un secreto aleatorio en el Keychain con `BIOMETRY_CURRENT_SET`;
 *   cada lectura pide Face ID / Touch ID.
 * - **Android**: el módulo nativo `BiometricGate` (bridge/BiometricGateModule.kt),
 *   con una clave del Keystore de autenticación por uso que solo un
 *   `BiometricPrompt` desbloquea. NO el Keychain: react-native-keychain crea sus
 *   claves con 5 s de validez tras cualquier autenticación del teléfono (huella
 *   o PIN del teléfono), y abrir QvaPay justo después de desbloquear el móvil
 *   leía el marcador sin diálogo. El marcador de Keychain que dejaron las
 *   versiones anteriores ya no vale: se borra al armar o desarmar y el
 *   siguiente PIN correcto crea el nuevo.
 *
 * Un re-enrolamiento de cara/huella invalida SOLO el marcador (nunca lo que
 * protege de verdad: el PIN sigue siendo el respaldo y el marcador se recrea
 * tras el siguiente PIN correcto).
 */
import { NativeModules, Platform, TurboModuleRegistry, type TurboModule } from 'react-native'
import * as Keychain from 'react-native-keychain'

import i18n from '../i18n'

const ACCOUNT = 'marker'

/** Resultado del diálogo nativo de Android (ver BiometricGateModule.kt). */
export type BiometricGateOutcome = 'success' | 'cancelled' | 'lockout' | 'invalidated' | 'missing' | 'unavailable' | 'busy' | 'error'

interface BiometricGateModule extends TurboModule {
	isAvailable(): Promise<boolean>
	hasKey(alias: string): Promise<boolean>
	createKey(alias: string): Promise<boolean>
	deleteKey(alias: string): Promise<boolean>
	authenticate(alias: string, title: string, cancelLabel: string): Promise<BiometricGateOutcome>
}

// En call time y sin spread: los métodos de un TurboModule viven en el prototipo
const getGate = (): BiometricGateModule | null => {
	if (Platform.OS !== 'android') return null
	return TurboModuleRegistry.get<BiometricGateModule>('BiometricGate') ?? NativeModules.BiometricGate ?? null
}

/** Alias de la clave del Keystore de Android para un `service`. */
export const gateAliasFor = (service: string) => `qvapay.biogate.${service}`

// El marcador de Keychain de versiones anteriores: en Android ya no autentica nada
const removeLegacyMarker = async (service: string) => {
	try { await Keychain.resetGenericPassword({ service }) } catch { /* nada que borrar */ }
}

export const hasBiometricMarker = async (service: string): Promise<boolean> => {
	if (Platform.OS === 'android') {
		const gate = getGate()
		if (!gate) return false
		try { return (await gate.hasKey(gateAliasFor(service))) === true } catch { return false }
	}
	try { return (await Keychain.hasGenericPassword({ service })) === true } catch { return false }
}

/** Crea/renueva el marcador. No pide biometría (en Android exige que haya una fuerte registrada). */
export const enableBiometricMarker = async (service: string): Promise<boolean> => {
	if (Platform.OS === 'android') {
		const gate = getGate()
		await removeLegacyMarker(service)
		if (!gate) return false
		try { return (await gate.isAvailable()) && (await gate.createKey(gateAliasFor(service))) === true } catch { return false }
	}
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
	const gate = getGate()
	if (gate) { try { await gate.deleteKey(gateAliasFor(service)) } catch { /* nada que borrar */ } }
	await removeLegacyMarker(service)
}

/**
 * Lanza el prompt biométrico. true = verificado. false = cancelado, fallido
 * o marcador invalidado (re-enrolamiento): el caller cae al PIN. Si el
 * marcador quedó invalidado se borra para que el próximo PIN lo recree.
 */
export const authenticateBiometricMarker = async (service: string, promptTitle: string): Promise<boolean> => {
	if (Platform.OS === 'android') {
		const gate = getGate()
		if (!gate) return false
		try {
			// `invalidated` ya borró la clave en nativo; el resto no deja nada que limpiar
			return (await gate.authenticate(gateAliasFor(service), promptTitle, i18n.t('common.actions.cancel'))) === 'success'
		} catch {
			return false
		}
	}
	try {
		const result = await Keychain.getGenericPassword({ service, authenticationPrompt: { title: promptTitle } })
		return result !== false && result.password.length > 0
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		// iOS: -25293 (errSecAuthFailed / invalidado)
		if (/invalidat|-25293|permanently/i.test(message)) await disableBiometricMarker(service)
		return false
	}
}
