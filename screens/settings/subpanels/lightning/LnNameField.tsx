import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'

// UI
import QPInput from '../../../../ui/particles/QPInput'

// Reglas (las mismas que aplica el servidor)
import { LN_NAME_MAX, lnNameProblem, normalizeLnName } from '../../../../helpers/lightningAddress'

type Props = {
	value: string
	onChange: (value: string) => void
	/** Dominio de la dirección, pintado como sufijo fijo (`@qvpay.me`). */
	domain: string
	label: string
	/** Error del servidor que la validación local no puede adelantar («ocupado»). */
	serverError?: string | null
	autoFocus?: boolean
}

/**
 * Campo del nombre de la Lightning Address: minúsculas, sin autocorrección, con el
 * dominio al lado y el veredicto de las reglas puras en vivo. El servidor sigue
 * siendo quien manda (un nombre válido aún puede estar ocupado).
 */
const LnNameField = ({ value, onChange, domain, label, serverError, autoFocus }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()

	const normalized = normalizeLnName(value)
	const problem = normalized ? lnNameProblem(normalized) : null
	const error = problem ? t(`settings.lightningAddress.nameProblems.${problem}`) : serverError

	return (
		<View style={styles.wrap}>
			<View style={styles.row}>
				<View style={styles.input}>
					<QPInput
						prelabel={label}
						value={value}
						onChangeText={onChange}
						placeholder={t('settings.lightningAddress.activate.placeholder')}
						autoCapitalize="none"
						autoCorrect={false}
						autoComplete="off"
						spellCheck={false}
						keyboardType="email-address"
						maxLength={LN_NAME_MAX}
						autoFocus={autoFocus}
						prefixIconName="bolt"
						returnKeyType="done"
					/>
				</View>
				<Text style={[styles.domain, { color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }]}>
					@{domain}
				</Text>
			</View>
			{!!error && (
				<Text style={{ color: theme.colors.danger, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>
					{error}
				</Text>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: { gap: 6 },
	row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
	input: { flex: 1 },
	domain: { paddingBottom: 14 },
})

export default LnNameField
