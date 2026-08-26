import { useState, useRef, useEffect, useImperativeHandle } from 'react'
import type { Ref } from 'react'
import { View, TextInput, StyleSheet } from 'react-native'
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

/** Handle imperativo expuesto vía `ref` (React 19: ref como prop normal). */
export type QPCodeInputHandle = {
	focus: (index?: number) => void
}

type QPCodeInputProps = {
	ref?: Ref<QPCodeInputHandle>
	length?: number
	code: string
	onChangeCode: (code: string) => void
	autoFocus?: boolean
	disabled?: boolean
	secure?: boolean
	onBoxFocus?: (index: number) => void
	onFilled?: (code: string) => void
}

/**
 * Multi-box one-time-code input — THE single implementation of the digit-grid
 * mechanics (paste spreads across boxes, backspace clears then steps back, focus
 * auto-advances). Consumed by verification codes (Register), PIN/OTP money
 * confirmations (PinConfirmStep), login 2FA (TwoFactorEntry) and the app lock
 * (LockScreen, AppLock) — don't hand-roll new grids, extend this one.
 * `secure` hides the digits (account/app-lock PINs); visible is the default for
 * single-use codes, where seeing them helps transcription.
 * `autoFocus` delays focus ~380ms so the keyboard doesn't fight the step's
 * entrance animation (it would slide up mid-transition). OS autofill is wired
 * via `textContentType="oneTimeCode"` / `autoComplete="sms-otp"`.
 * React 19: `ref` arrives as a regular prop and exposes `{ focus(index = 0) }`
 * so parents can refocus without owning per-box refs.
 *
 * @param props
 * @param [props.length=4] - Box count; more than 4 uses the compact box size.
 * @param props.code - Controlled code value.
 * @param props.onChangeCode - Receives the full updated code string.
 * @param [props.autoFocus=false] - Focus the first box after the ~380ms delay.
 * @param [props.secure=false] - Hide the digits (secureTextEntry).
 * @param [props.onBoxFocus] - Called with the box index on focus (e.g. scroll-into-view).
 * @param [props.onFilled] - Called with the full code the moment every box has a digit.
 */
const QPCodeInput = ({ ref, length = 4, code, onChangeCode, autoFocus = false, disabled = false, secure = false, onBoxFocus, onFilled }: QPCodeInputProps) => {

	const { theme } = useTheme()
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
	const inputsRef = useRef<Array<TextInput | null>>([])

	useImperativeHandle(ref, () => ({
		focus: (index = 0) => { inputsRef.current[index]?.focus() },
	}), [])

	useEffect(() => {
		if (!autoFocus) return
		const timer = setTimeout(() => { inputsRef.current[0]?.focus() }, 380)
		return () => clearTimeout(timer)
	}, [autoFocus])

	// Report the updated code; fire onFilled exactly when the last empty box gets its digit
	const report = (next: string[]) => {
		const joined = next.join('')
		onChangeCode(joined)
		if (onFilled && joined.length === length) { onFilled(joined) }
	}

	// Digit input (supports paste of the full code)
	const handleChange = (text: string, index: number) => {

		const numeric = text.replace(/[^0-9]/g, '')

		if (numeric.length > 1) {
			const digits = numeric.slice(0, length).split('')
			const next = code.split('')
			digits.forEach((d, i) => { if (index + i < length) next[index + i] = d })
			report(next)
			const focusIdx = Math.min(index + digits.length, length - 1)
			inputsRef.current[focusIdx]?.focus()
			return
		}

		const next = code.split('')
		next[index] = numeric
		report(next)
		if (numeric && index < length - 1) { inputsRef.current[index + 1]?.focus() }
	}

	// Backspace clears the current digit, then steps back
	const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
		if (e.nativeEvent.key === 'Backspace') {
			if (code[index]) {
				const next = code.split('')
				next[index] = ''
				onChangeCode(next.join(''))
			} else if (index > 0) {
				const next = code.split('')
				next[index - 1] = ''
				onChangeCode(next.join(''))
				inputsRef.current[index - 1]?.focus()
			}
		}
	}

	return (
		<View style={styles.container}>
			{Array.from({ length }).map((_, index) => (
				<TextInput
					key={index}
					ref={(ref: TextInput | null) => { inputsRef.current[index] = ref }}
					style={[
						length > 4 ? styles.boxSmall : styles.box,
						{
							backgroundColor: theme.colors.surface,
							color: theme.colors.primaryText,
							fontSize: length > 4 ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl,
							fontFamily: theme.typography.fontFamily.semiBold,
							borderWidth: 1.5,
							borderColor: focusedIndex === index ? theme.colors.primary : 'transparent',
						},
					]}
					value={code[index] || ''}
					onChangeText={(text) => handleChange(text, index)}
					onFocus={() => { setFocusedIndex(index); onBoxFocus && onBoxFocus(index) }}
					onBlur={() => setFocusedIndex(null)}
					onKeyPress={(e) => handleKeyPress(e, index)}
					keyboardType="numeric"
					secureTextEntry={secure}
					textAlign="center"
					selectTextOnFocus
					editable={!disabled}
					textContentType="oneTimeCode"
					autoComplete="sms-otp"
					placeholder={focusedIndex === index ? '' : '·'}
					placeholderTextColor={theme.colors.tertiaryText}
				/>
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		gap: 8,
	},
	// `flex: 1` reparte el ancho disponible, pero su base es el contenido: dentro de un
	// padre encogido (uno que centre en el eje horizontal) una caja vacía mediría lo que
	// ocupa el placeholder. `minWidth` es el suelo que evita ese colapso a rayas
	box: {
		flex: 1,
		minWidth: 44,
		height: 60,
		borderRadius: 12,
		textAlign: 'center',
	},
	boxSmall: {
		flex: 1,
		minWidth: 32,
		height: 52,
		borderRadius: 10,
		textAlign: 'center',
	},
})

export default QPCodeInput
