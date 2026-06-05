import { useState, useRef } from 'react'
import { View, TextInput, StyleSheet } from 'react-native'

import QPSwitch from '../../../ui/particles/QPSwitch'
import QPButton from '../../../ui/particles/QPButton'
import usePinCountdown from '../../hooks/usePinCountdown'

// PIN / OTP entry: the method switch, the digit grid, and the "request PIN" button.
// `code` is owned by the parent (the footer "Acceder" button and auto-submit need
// it); this component owns only its presentational concerns — focus + request state.
const TwoFactorEntry = ({ method, expectedCodeLength, code, onChangeCode, hasOtp, onMethodToggle, onRequestPin, theme }) => {

	const [focusedIndex, setFocusedIndex] = useState(null)
	const [requesting, setRequesting] = useState(false)
	const inputsRef = useRef([])
	const { label: pinLabel, isDisabled: pinDisabled, start: startCountdown } = usePinCountdown()

	// Handle PIN input change (supports paste of the full code)
	const handleChange = (text, index) => {
		
		const numeric = text.replace(/[^0-9]/g, '')

		// Paste: multiple digits received at once
		if (numeric.length > 1) {
			const digits = numeric.slice(0, expectedCodeLength).split('')
			const next = code.split('')
			digits.forEach((d, i) => { if (index + i < expectedCodeLength) next[index + i] = d })
			onChangeCode(next.join(''))
			const focusIdx = Math.min(index + digits.length, expectedCodeLength - 1)
			inputsRef.current[focusIdx]?.focus()
			return
		}

		// Single digit
		const next = code.split('')
		next[index] = numeric
		onChangeCode(next.join(''))

		if (numeric && index < expectedCodeLength - 1) { inputsRef.current[index + 1]?.focus() }
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

	const handleRequest = async () => {
		try {
			setRequesting(true)
			const result = await onRequestPin()
			if (result?.success) { startCountdown(60) }
		} finally { setRequesting(false) }
	}

	return (
		<>
			{hasOtp && (
				<QPSwitch
					value={method === 'pin' ? 'left' : method === 'otp' ? 'right' : null}
					leftText="PIN"
					rightText="OTP"
					leftColor={theme.colors.primary}
					rightColor={theme.colors.primary}
					onChange={onMethodToggle}
					style={{ marginBottom: 20 }}
				/>
			)}
			<View style={styles.pinContainer}>
				{Array.from({ length: expectedCodeLength }).map((_, index) => (
					<TextInput
						key={`${method}-${index}`}
						ref={(ref) => { inputsRef.current[index] = ref }}
						style={[method === 'otp' ? styles.pinInputSmall : styles.pinInput, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, fontSize: method === 'otp' ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.semiBold }]}
						value={code[index] || ''}
						onChangeText={(text) => handleChange(text, index)}
						onFocus={() => setFocusedIndex(index)}
						onBlur={() => setFocusedIndex(null)}
						onKeyPress={(e) => handleKeyPress(e, index)}
						keyboardType="numeric"
						secureTextEntry
						textAlign="center"
						selectTextOnFocus
						textContentType="oneTimeCode"
						autoComplete="sms-otp"
						placeholder={focusedIndex === index ? "" : "0"}
						placeholderTextColor={theme.colors.tertiaryText}
					/>
				))}
			</View>
			{method === 'pin' && (
				<QPButton
					title={pinLabel}
					onPress={handleRequest}
					loading={requesting}
					disabled={pinDisabled}
					style={{ backgroundColor: null }}
					textStyle={{ color: theme.colors.primary }}
				/>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	pinContainer: {
		flexDirection: 'row',
		gap: 8,
		marginBottom: 20,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		textAlign: 'center'
	},
	pinInputSmall: {
		flex: 1,
		height: 46,
		borderRadius: 10,
		textAlign: 'center'
	},
})

export default TwoFactorEntry
