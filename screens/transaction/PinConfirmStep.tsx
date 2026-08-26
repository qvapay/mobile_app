import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RefObject } from 'react'

import QPSwitch from '../../ui/particles/QPSwitch'
import QPCodeInput, { type QPCodeInputHandle } from '../../ui/particles/QPCodeInput'

import type { TwoFactorMethod } from '../../hooks/usePinEntry'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../theme/themeUtils'

type PinConfirmStepProps = {
	pin: string
	onChangePin: (code: string) => void
	codeLength: number
	twoFactorMethod: TwoFactorMethod
	hasOTP: boolean
	sendingPin: boolean
	onMethodToggle: (side: 'left' | 'right' | null) => void
	onRequestPin: () => void
	onBoxFocus?: (index: number) => void
	codeInputRef?: RefObject<QPCodeInputHandle | null>
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

/**
 * PIN / OTP entry card for confirming a money operation (transfer, withdraw).
 * The parent owns the pin string + method toggle (see hooks/usePinEntry); the
 * digit-box mechanics live in QPCodeInput (secure mode). Re-keys the code input
 * by method so PIN ↔ OTP swaps rebuild the grid at the right length.
 *
 * @param props
 * @param props.pin - Entered code (controlled by the parent).
 * @param props.onChangePin - Receives the full updated code string.
 * @param props.codeLength - 4 (email PIN) or 6 (TOTP).
 * @param props.twoFactorMethod - Active method ('pin' | 'otp').
 * @param props.hasOTP - Show the PIN ↔ OTP switch.
 * @param props.sendingPin - Disables the "Solicitar PIN" link while requesting.
 * @param props.onMethodToggle - QPSwitch side handler ('left' | 'right').
 * @param props.onRequestPin - Emails a fresh PIN (withdrawApi.requestPin).
 * @param [props.onBoxFocus] - Box focus callback (e.g. scroll-into-view).
 * @param [props.codeInputRef] - Ref to QPCodeInput ({ focus(index) }).
 */
const PinConfirmStep = ({ pin, onChangePin, codeLength, twoFactorMethod, hasOTP, sendingPin, onMethodToggle, onRequestPin, onBoxFocus, codeInputRef, theme, textStyles, containerStyles }: PinConfirmStepProps) => {

	const { t } = useTranslation()

	return (
	<View style={[containerStyles.card, { marginTop: 0 }]}>

		<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
				{twoFactorMethod === 'pin' ? t('transactions.pinConfirm.enterPin') : t('transactions.pinConfirm.enterOtp')}
			</Text>
			{twoFactorMethod === 'pin' && (
				<Text onPress={onRequestPin} style={[textStyles.h6, { color: theme.colors.primary, opacity: sendingPin ? 0.5 : 1 }]} disabled={sendingPin}>
					{sendingPin ? t('transactions.pinConfirm.sending') : t('transactions.pinConfirm.requestPin')}
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
}

export default PinConfirmStep
