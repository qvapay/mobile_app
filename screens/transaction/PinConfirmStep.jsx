import { View, Text } from 'react-native'

import QPSwitch from '../../ui/particles/QPSwitch'
import QPCodeInput from '../../ui/particles/QPCodeInput'

/**
 * PIN / OTP entry card for confirming a money operation (transfer, withdraw).
 * The parent owns the pin string + method toggle (see hooks/usePinEntry); the
 * digit-box mechanics live in QPCodeInput (secure mode). Re-keys the code input
 * by method so PIN ↔ OTP swaps rebuild the grid at the right length.
 *
 * @param {object} props
 * @param {string} props.pin - Entered code (controlled by the parent).
 * @param {function} props.onChangePin - Receives the full updated code string.
 * @param {number} props.codeLength - 4 (email PIN) or 6 (TOTP).
 * @param {'pin'|'otp'} props.twoFactorMethod - Active method.
 * @param {boolean} props.hasOTP - Show the PIN ↔ OTP switch.
 * @param {boolean} props.sendingPin - Disables the "Solicitar PIN" link while requesting.
 * @param {function} props.onMethodToggle - QPSwitch side handler ('left' | 'right').
 * @param {function} props.onRequestPin - Emails a fresh PIN (withdrawApi.requestPin).
 * @param {function} [props.onBoxFocus] - Box focus callback (e.g. scroll-into-view).
 * @param {object} [props.codeInputRef] - Ref to QPCodeInput ({ focus(index) }).
 */
const PinConfirmStep = ({ pin, onChangePin, codeLength, twoFactorMethod, hasOTP, sendingPin, onMethodToggle, onRequestPin, onBoxFocus, codeInputRef, theme, textStyles, containerStyles }) => (
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

		<View style={{ marginVertical: 20 }}>
			<QPCodeInput
				key={twoFactorMethod}
				ref={codeInputRef}
				length={codeLength}
				code={pin}
				onChangeCode={onChangePin}
				secure
				onBoxFocus={onBoxFocus}
			/>
		</View>
	</View>
)

export default PinConfirmStep
