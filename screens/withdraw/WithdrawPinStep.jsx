import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'

import QPSwitch from '../../ui/particles/QPSwitch'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// PIN / OTP entry for confirming a withdrawal. Controlled by the parent (owns pin + refs).
const WithdrawPinStep = ({ pin, codeLength, twoFactorMethod, hasOTP, sendingPin, focusedInputIndex, pinInputsRef, onPinChange, onKeyPress, onFocus, onBlur, onMethodToggle, onRequestPin, theme, textStyles }) => (
	<View style={{ marginTop: 30 }}>

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

		{/* Request PIN button - only in PIN mode */}
		{twoFactorMethod === 'pin' && (
			<Pressable onPress={onRequestPin} disabled={sendingPin} style={[styles.requestPinButton, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary, marginTop: hasOTP ? 16 : 0 }]} >
				<FontAwesome6 name="envelope" size={16} color={theme.colors.primary} iconStyle="solid" />
				<Text style={[textStyles.h6, { color: theme.colors.primary, marginLeft: 8 }]}>
					{sendingPin ? 'Enviando...' : 'Recibir PIN por correo'}
				</Text>
			</Pressable>
		)}

		<Text style={[textStyles.h6, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 20 }]}>
			{twoFactorMethod === 'pin' ? 'Ingresa el PIN de 4 dígitos:' : 'Ingresa tu código OTP:'}
		</Text>
		<View style={styles.pinContainer}>
			{Array.from({ length: codeLength }, (_, index) => (
				<TextInput
					key={`${twoFactorMethod}-${index}`}
					ref={(ref) => { pinInputsRef.current[index] = ref }}
					style={[styles.pinInput, codeLength === 6 && styles.pinInputSmall, { fontSize: codeLength === 6 ? theme.typography.fontSize.xl : theme.typography.fontSize.xxl, fontFamily: theme.typography.fontFamily.semiBold, backgroundColor: theme.colors.surface, color: theme.colors.primaryText, borderColor: focusedInputIndex === index ? theme.colors.primary : theme.colors.border, borderWidth: 0.5 }]}
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
	requestPinButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 14,
		borderRadius: 12,
		borderWidth: 1,
	},
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

export default WithdrawPinStep
