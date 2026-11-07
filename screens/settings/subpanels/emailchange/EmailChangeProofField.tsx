import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPButton from '../../../../ui/particles/QPButton'
import QPCodeInput from '../../../../ui/particles/QPCodeInput'
import QPInput from '../../../../ui/particles/QPInput'
import QPSwitch from '../../../../ui/particles/QPSwitch'

// Reglas
import { proofCanSendCode, proofCodeAlreadySent, proofIsNumeric, sanitizeProofCode } from './emailChangeRules'
import type { EmailChangePurpose } from './emailChangeRules'

// Tipos
import type { EmailChangeProofType } from '../../../../types/domain'

type Props = {
	methods: EmailChangeProofType[]
	method: EmailChangeProofType
	onMethod: (method: EmailChangeProofType) => void
	code: string
	onCode: (code: string) => void
	purpose: EmailChangePurpose
	/** El código ya se pidió: el botón pasa a ofrecer otro. */
	sent: boolean
	onSend: () => void
	sending: boolean
	/** El servidor rechazó este campo. */
	marked: boolean
	disabled?: boolean
}

/**
 * La prueba extra: elegir método si hay dos, pedir el código si hace falta y escribirlo.
 * El método `totp` usa teclado completo porque acepta un código de recuperación `XXXX-XXXX`.
 */
const EmailChangeProofField = ({ methods, method, onMethod, code, onCode, purpose, sent, onSend, sending, marked, disabled }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const [left, right] = methods
	const sendLabel = sent || proofCodeAlreadySent(method, purpose)
		? t('settings.emailChange.proof.sendAgain')
		: t(method === 'telegram' ? 'settings.emailChange.proof.sendTelegram' : 'settings.emailChange.proof.sendEmail')

	return (
		<View style={{ marginTop: 16 }}>

			{methods.length > 1 && (
				<QPSwitch
					value={method === left ? 'left' : 'right'}
					leftText={t(`settings.emailChange.proof.methods.${left}`)}
					rightText={t(`settings.emailChange.proof.methods.${right}`)}
					// Tocar el lado elegido llega como null: aquí siempre hay uno elegido
					onChange={(side) => { if (side) { onMethod(side === 'left' ? left : right) } }}
					disabled={disabled}
					style={{ marginBottom: 16 }}
				/>
			)}

			<Text style={[textStyles.h5, { color: marked ? theme.colors.danger : theme.colors.secondaryText, marginBottom: 8 }]}>
				{t(`settings.emailChange.proof.labels.${method}`)}
			</Text>

			{proofIsNumeric(method)
				? <QPCodeInput key={method} length={6} code={code} onChangeCode={(text) => onCode(sanitizeProofCode(method, text))} disabled={disabled} testID="email-change-proof" />
				: (
					<QPInput
						value={code}
						onChangeText={(text) => onCode(sanitizeProofCode(method, text))}
						autoCapitalize="characters"
						autoCorrect={false}
						autoComplete="one-time-code"
						textContentType="oneTimeCode"
						prefixIconName="key"
						editable={!disabled}
						style={marked ? { borderColor: theme.colors.danger, borderWidth: 1 } : undefined}
						testID="email-change-proof"
					/>
				)}

			{proofCanSendCode(method) && (
				<QPButton
					title={sendLabel}
					onPress={onSend}
					loading={sending}
					disabled={sending || disabled}
					style={{ marginTop: 12, backgroundColor: theme.colors.surface }}
					textStyle={{ color: theme.colors.primaryText }}
					testID="email-change-send-code"
				/>
			)}

			{method === 'old_email' && purpose === 'request' && (
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 8 }]}>
					{t('settings.emailChange.proof.oldEmailHint')}
				</Text>
			)}

		</View>
	)
}

export default EmailChangeProofField
