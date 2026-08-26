import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { getSupportedBiometryType, hasBiometricCredentials } from '../../api/client'

/**
 * Detects the device's biometry type (FaceID / TouchID / fingerprint) and whether
 * the user already has stored login credentials in the keychain.
 *
 * The check runs once on mount and only asks the Keychain (service
 * `com.qvapay.biometrics`) if an entry EXISTS — it never triggers the OS
 * biometric prompt (that happens later, in `getBiometricCredentials`).
 * `setHasBiometrics` is exposed so screens can flip the flag right after
 * enrolling/removing credentials without re-mounting.
 *
 * @returns `biometryType` ('FaceID' | 'TouchID' | 'Fingerprint' | null when
 *   unsupported), `hasBiometrics` and its setter.
 */
export default function useBiometricSupport(): { biometryType: string | null, hasBiometrics: boolean, setHasBiometrics: Dispatch<SetStateAction<boolean>> } {

	const [biometryType, setBiometryType] = useState<string | null>(null)
	const [hasBiometrics, setHasBiometrics] = useState(false)

	useEffect(() => {
		let active = true
		const checkBiometrics = async () => {
			try {
				const type = await getSupportedBiometryType()
				const has = await hasBiometricCredentials()
				if (!active) return
				setBiometryType(type)
				setHasBiometrics(has)
			} catch (err) {
				// Biometric detection failed silently
			}
		}
		checkBiometrics()
		return () => { active = false }
	}, [])

	return { biometryType, hasBiometrics, setHasBiometrics }
}
