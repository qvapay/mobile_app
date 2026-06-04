import { View, Text, TextInput, StyleSheet } from 'react-native'

import QPSwitch from '../../ui/particles/QPSwitch'

// PIN / OTP entry card for confirming a transfer. Controlled by the parent (which owns
// the pin value, refs and handlers) so the footer button + auto-submit stay in sync.
const PinConfirmStep = ({ pin, codeLength, twoFactorMethod, hasOTP, sendingPin, focusedInputIndex, pinInputsRef, onPinChange, onKeyPress, onFocus, onBlur, onMethodToggle, onRequestPin, theme, textStyles, containerStyles }) => (
	<View style={[containerStyles.card, { marginTop: 0 }]}>

		<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
				{twoFactorMethod === 'pin' ? 'Ingresa tu PIN' : 'Ingresa el código OTP'}
			</Text>
			{twoFactorMethod === 'pin' && (
				<Text onPress={onRequestPin} style={[textStyles.h6, { color: theme.colors.primary, opacity: sendingPin ? 0.5 : 1 }]} disabled={sendingPin}>
					{sendingPin ? 'Enviando...' : 'Solicitar PIN'}
				</Text>
			)}
		</View>

		{/* PIN/OTP Toggle - only show if user has OTP */}
		{hasOTP && (
			<QPSwitch
				value={twoFactorMethod === 'pin' ? 'left' : 'right'}
				leftText="PIN"
				rightText="OTP"
				leftColor={theme.colors.primary}
				rightColor={theme.colors.primary}
				onChange={onMethodToggle}
			/>
		)}

		<View style={styles.pinContainer}>
			{Array.from({ length: codeLength }, (_, index) => (
				<TextInput
					key={`${twoFactorMethod}-${index}`}
					ref={(ref) => { pinInputsRef.current[index] = ref }}
					style={[styles.pinInput, codeLength === 6 && styles.pinInputSmall, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText, borderColor: focusedInputIndex === index ? theme.colors.primary : theme.colors.border, borderWidth: 0.5, fontSize: codeLength === 6 ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.bold }]}
					value={pin[index] || ''}
					onChangeText={(text) => onPinChange(text, index)}
					onFocus={() => onFocus(index)}
					onBlur={onBlur}
					onKeyPress={(e) => onKeyPress(e, index)}
					keyboardType="numeric"
					secureTextEntry
					textAlign="center"
					selectTextOnFocus
					textContentType="oneTimeCode"
					autoComplete="sms-otp"
					placeholder={focusedInputIndex === index ? "" : "0"}
					placeholderTextColor={theme.colors.tertiaryText}
				/>
			))}
		</View>
	</View>
)

const styles = StyleSheet.create({
	pinContainer: {
		flexDirection: 'row',
		marginVertical: 20,
		gap: 8,
	},
	pinInput: {
		flex: 1,
		height: 60,
		borderRadius: 12,
		borderWidth: 1,
		textAlign: 'center',
	},
	pinInputSmall: {
		height: 54,
		borderRadius: 10,
	},
})

export default PinConfirmStep
