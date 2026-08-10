import { useRef, useState } from 'react'

/**
 * Owns the STATE of a PIN/OTP confirmation: the entered code, the PIN ↔ OTP
 * method toggle and the derived code length (4 boxes for the email PIN, 6 for
 * the TOTP code). The digit-box mechanics (advance, backspace, paste) live in
 * `QPCodeInput` — wire `pin`/`setPin` into it and pass `codeInputRef` as its
 * ref to refocus imperatively (`codeInputRef.current?.focus(0)`).
 *
 * The consuming screen keeps the auto-submit effect (so it can guard against
 * re-entry) and reads `pin` / `codeLength` for its footer button.
 *
 * @returns {object} `{ pin, setPin, twoFactorMethod, codeLength, codeInputRef,
 *   handleMethodToggle }`
 */
export default function usePinEntry() {

	const [twoFactorMethod, setTwoFactorMethod] = useState('pin')
	const [pin, setPin] = useState('')
	const codeInputRef = useRef(null)
	const codeLength = twoFactorMethod === 'pin' ? 4 : 6

	// Switch between PIN and OTP — resets the entered code + refocuses.
	// `side` matches QPSwitch: 'left' = pin, anything else = otp.
	const handleMethodToggle = (side) => {
		const method = side === 'left' ? 'pin' : 'otp'
		if (method !== twoFactorMethod) {
			setTwoFactorMethod(method)
			setPin('')
			setTimeout(() => { codeInputRef.current?.focus(0) }, 0)
		}
	}

	return {
		pin,
		setPin,
		twoFactorMethod,
		codeLength,
		codeInputRef,
		handleMethodToggle,
	}
}
