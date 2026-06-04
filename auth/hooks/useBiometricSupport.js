import { useState, useEffect } from 'react'

import { getSupportedBiometryType, hasBiometricCredentials } from '../../api/client'

// Detects the device's biometry type (FaceID / TouchID / fingerprint) and whether
// the user already has stored login credentials in the keychain.
export default function useBiometricSupport() {

	const [biometryType, setBiometryType] = useState(null)
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
