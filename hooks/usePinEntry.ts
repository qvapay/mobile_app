import { useRef, useState, type RefObject } from 'react'
import type { QPCodeInputHandle } from '../ui/particles/QPCodeInput'

/** Método de confirmación activo: PIN de email (4 cajas) u OTP TOTP (6 cajas). */
export type TwoFactorMethod = 'pin' | 'otp'

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
 * @returns `{ pin, setPin, twoFactorMethod, codeLength, codeInputRef,
 *   handleMethodToggle }`
 */
export default function usePinEntry(): {
	pin: string
	setPin: (pin: string) => void
	twoFactorMethod: TwoFactorMethod
	codeLength: number
	codeInputRef: RefObject<QPCodeInputHandle | null>
	handleMethodToggle: (side: 'left' | 'right' | null) => void
} {

	const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>('pin')
	const [pin, setPin] = useState('')
	const codeInputRef = useRef<QPCodeInputHandle | null>(null)
	const codeLength = twoFactorMethod === 'pin' ? 4 : 6

	// Switch between PIN and OTP — resets the entered code + refocuses.
	// `side` matches QPSwitch: 'left' = pin, anything else = otp.
	const handleMethodToggle = (side: 'left' | 'right' | null) => {
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
