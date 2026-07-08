import { useState, useRef } from 'react'

/**
 * Owns the mechanics of a multi-box PIN/OTP input: the entered code, the
 * focused box, the PIN ↔ OTP method toggle, the input refs and the
 * digit/backspace/paste handlers. Code length follows the method: 4 boxes for
 * the email PIN, 6 for the TOTP code.
 *
 * The consuming screen keeps the auto-submit effect (so it can guard against
 * re-entry) and reads `pin` / `codeLength` for its footer button.
 *
 * @returns {object} `{ pin, setPin, twoFactorMethod, codeLength,
 *   focusedInputIndex, pinInputsRef, handlePinChange, handleKeyPress,
 *   handleFocus, handleBlur, handleMethodToggle }` — wire the handlers and
 *   `pinInputsRef.current[index]` into one TextInput per box.
 */
export default function usePinEntry() {
	
	const [twoFactorMethod, setTwoFactorMethod] = useState('pin')
	const [pin, setPin] = useState('')
	const [focusedInputIndex, setFocusedInputIndex] = useState(null)
	const pinInputsRef = useRef([])
	const codeLength = twoFactorMethod === 'pin' ? 4 : 6

	// Digit input (supports paste of the full code)
	const handlePinChange = (text, index) => {
		const numericText = text.replace(/[^0-9]/g, '')
		if (numericText.length > 1) {
			const digits = numericText.slice(0, codeLength).split('')
			const newPin = pin.split('')
			digits.forEach((d, i) => { if (index + i < codeLength) newPin[index + i] = d })
			setPin(newPin.join(''))
			const focusIdx = Math.min(index + digits.length, codeLength - 1)
			pinInputsRef.current[focusIdx]?.focus()
			return
		}
		const newPin = pin.split('')
		newPin[index] = numericText
		setPin(newPin.join(''))
		if (numericText && index < codeLength - 1) { pinInputsRef.current[index + 1]?.focus() }
	}

	// Backspace clears the current digit, then steps back
	const handleKeyPress = (e, index) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (pin[index]) {
				const newPin = pin.split('')
				newPin[index] = ''
				setPin(newPin.join(''))
			} else if (index > 0) {
				const newPin = pin.split('')
				newPin[index - 1] = ''
				setPin(newPin.join(''))
				pinInputsRef.current[index - 1]?.focus()
			}
		}
	}

	const handleFocus = (index) => { setFocusedInputIndex(index) }
	const handleBlur = () => { setFocusedInputIndex(null) }

	// Switch between PIN and OTP — resets the entered code + refocuses.
	// `side` matches QPSwitch: 'left' = pin, anything else = otp.
	const handleMethodToggle = (side) => {
		const method = side === 'left' ? 'pin' : 'otp'
		if (method !== twoFactorMethod) {
			setTwoFactorMethod(method)
			setPin('')
			pinInputsRef.current = new Array(method === 'pin' ? 4 : 6).fill(null)
			setTimeout(() => { pinInputsRef.current[0]?.focus() }, 0)
		}
	}

	return {
		pin,
		setPin,
		twoFactorMethod,
		codeLength,
		focusedInputIndex,
		pinInputsRef,
		handlePinChange,
		handleKeyPress,
		handleFocus,
		handleBlur,
		handleMethodToggle,
	}
}
