import { useState, useRef, useEffect } from 'react'
import { View, TextInput, StyleSheet } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// Input de código de verificación multi-caja (PIN de email, código SMS/Telegram).
// Mecánica calcada de TwoFactorEntry: paste del código completo, backspace que
// retrocede y auto-avance de foco. El dígito es visible (no secure) — es un
// código de un solo uso, verlo ayuda a transcribirlo.
//
// `autoFocus` retrasa el foco ~380ms para no pelear con la animación de entrada
// del step (el teclado subiría a mitad del slide).
const QPCodeInput = ({ length = 4, code, onChangeCode, autoFocus = false, disabled = false }) => {

	const { theme } = useTheme()
	const [focusedIndex, setFocusedIndex] = useState(null)
	const inputsRef = useRef([])

	useEffect(() => {
		if (!autoFocus) return
		const timer = setTimeout(() => { inputsRef.current[0]?.focus() }, 380)
		return () => clearTimeout(timer)
	}, [autoFocus])

	// Digit input (supports paste of the full code)
	const handleChange = (text, index) => {
		
		const numeric = text.replace(/[^0-9]/g, '')

		if (numeric.length > 1) {
			const digits = numeric.slice(0, length).split('')
			const next = code.split('')
			digits.forEach((d, i) => { if (index + i < length) next[index + i] = d })
			onChangeCode(next.join(''))
			const focusIdx = Math.min(index + digits.length, length - 1)
			inputsRef.current[focusIdx]?.focus()
			return
		}

		const next = code.split('')
		next[index] = numeric
		onChangeCode(next.join(''))
		if (numeric && index < length - 1) { inputsRef.current[index + 1]?.focus() }
	}

	// Backspace clears the current digit, then steps back
	const handleKeyPress = (e, index) => {
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
					ref={(ref) => { inputsRef.current[index] = ref }}
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
					onFocus={() => setFocusedIndex(index)}
					onBlur={() => setFocusedIndex(null)}
					onKeyPress={(e) => handleKeyPress(e, index)}
					keyboardType="numeric"
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
	box: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		textAlign: 'center',
	},
	boxSmall: {
		flex: 1,
		height: 52,
		borderRadius: 10,
		textAlign: 'center',
	},
})

export default QPCodeInput
