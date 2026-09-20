import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { isValidMnemonic } from '../../../wallet/seed'
import useSecureScreen from '../../../hooks/useSecureScreen'

// UI
import QPButton from '../../../ui/particles/QPButton'

// Navigation
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletImport'>

/**
 * Importa un mnemonic BIP-39 existente (12/24 palabras). La frase solo pasa
 * por el estado local; el autocorrector/autocapitalización van apagados para
 * no ensuciar palabras ni filtrarlas a diccionarios del teclado.
 */
const WalletImport = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const { importWallet } = useWallet()
	useSecureScreen(true)

	const [phrase, setPhrase] = useState('')
	const [importing, setImporting] = useState(false)

	const valid = useMemo(() => isValidMnemonic(phrase), [phrase])
	const wordCount = phrase.trim() ? phrase.trim().split(/\s+/).length : 0

	const handleImport = async () => {
		if (!valid || importing) return
		setImporting(true)
		const ok = await importWallet(phrase)
		setImporting(false)
		if (!ok) {
			toast.error(t('crypto.wallet.import.failed'))
			return
		}
		toast.success(t('crypto.wallet.import.done'))
		navigation.popToTop()
	}

	return (
		<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={containerStyles.subContainer}>
			<View style={styles.content}>
				<Text style={textStyles.h1}>{t('crypto.wallet.import.title')}</Text>
				<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.import.subtitle')}</Text>

				<TextInput
					style={[styles.input, textStyles.h4, { backgroundColor: theme.colors.surface, color: theme.colors.primaryText }, inputBorder(theme)]}
					multiline
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="off"
					spellCheck={false}
					secureTextEntry={false}
					importantForAutofill="no"
					placeholder={t('crypto.wallet.import.placeholder')}
					placeholderTextColor={theme.colors.secondaryText}
					value={phrase}
					onChangeText={setPhrase}
				/>

				<View style={styles.hintRow}>
					<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{wordCount > 0 ? `${wordCount}/12` : ''}</Text>
					{wordCount >= 12 && !valid && (
						<Text style={[textStyles.h6, { color: theme.colors.danger }]}>{t('crypto.wallet.import.invalid')}</Text>
					)}
				</View>

				<QPButton title={t('crypto.wallet.import.cta')} onPress={handleImport} disabled={!valid} loading={importing} />
			</View>
		</KeyboardAvoidingView>
	)
}

const inputBorder = (theme: ReturnType<typeof useTheme>['theme']) =>
	!theme.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border } : null

const styles = StyleSheet.create({
	content: { gap: 12, paddingBottom: 30 },
	input: { minHeight: 110, borderRadius: 12, padding: 14, textAlignVertical: 'top' },
	hintRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 16 },
})

export default WalletImport
