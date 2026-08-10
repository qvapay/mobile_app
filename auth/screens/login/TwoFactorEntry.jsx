import { useState } from 'react'
import { View } from 'react-native'

import QPSwitch from '../../../ui/particles/QPSwitch'
import QPButton from '../../../ui/particles/QPButton'
import QPCodeInput from '../../../ui/particles/QPCodeInput'
import usePinCountdown from '../../hooks/usePinCountdown'

// PIN / OTP entry: the method switch, the digit grid (QPCodeInput, secure) and the
// "request PIN" button with its resend countdown. `code` is owned by the parent (the
// footer "Acceder" button and auto-submit need it); this component owns only its
// presentational concerns — request state + countdown.
const TwoFactorEntry = ({ method, expectedCodeLength, code, onChangeCode, hasOtp, onMethodToggle, onRequestPin, theme }) => {

	const [requesting, setRequesting] = useState(false)
	const { label: pinLabel, isDisabled: pinDisabled, start: startCountdown } = usePinCountdown()

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
			<View style={{ marginBottom: 20 }}>
				<QPCodeInput
					key={method}
					length={expectedCodeLength}
					code={code}
					onChangeCode={onChangeCode}
					secure
				/>
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

export default TwoFactorEntry
