import { useState, useEffect } from 'react'
import { Platform, Keyboard } from 'react-native'

/**
 * Tracks the software keyboard height via Keyboard listeners — iOS uses the
 * `will` events for a fluid follow, Android only fires `did*`. Preferred over
 * KeyboardAvoidingView, which is unreliable inside RN `Modal`s with
 * `statusBarTranslucent` on Android. Shared by QPKeyboardView, P2POffer and
 * the Savings deposit/withdraw modal.
 *
 * @returns {{ keyboardHeight: number, keyboardVisible: boolean }}
 */
export function useKeyboardHeight() {
	const [keyboardHeight, setKeyboardHeight] = useState(0)

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
		const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height))
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
		return () => { showSub.remove(); hideSub.remove() }
	}, [])

	return { keyboardHeight, keyboardVisible: keyboardHeight > 0 }
}

export default useKeyboardHeight
