import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

// i18n
import { getDateLocale } from '../../../../i18n'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPKeyboardView from '../../../../ui/QPKeyboardView'
import QPButton from '../../../../ui/particles/QPButton'

// Auth
import { useAuth } from '../../../../auth/AuthContext'
import { forgetEmailBeforeChange, rememberEmailBeforeChange } from '../../../../helpers/biometricEmailChange'

// API
import { userApi } from '../../../../api/userApi'
import { EMAIL_CHANGE_KEY } from '../../../../hooks/useEmailChangeQuery'

// Paso compartido + reglas
import EmailChangeProofField from './EmailChangeProofField'
import EmailChangeInfoRow from './EmailChangeInfoRow'
import useEmailChangeFailure from './useEmailChangeFailure'
import { formatEmailChangeDate, pickMethod, proofIsComplete } from './emailChangeRules'

// Tipos
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import type { EmailChangePending as Pending, EmailChangeProofType } from '../../../../types/domain'
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'

/**
 * El cambio en curso: cuándo se hace, qué implica y cómo cancelarlo. Cancelar con sesión
 * exige la misma prueba que pedirlo, y no congela la cuenta.
 */
const EmailChangePending = ({ pending, refreshControl }: { pending: Pending, refreshControl: ReactElement<RefreshControlProps> }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const navigation = useNavigation()
	const queryClient = useQueryClient()
	const { user } = useAuth()
	const handleFailure = useEmailChangeFailure()

	const [cancelling, setCancelling] = useState(false)
	const [chosen, setChosen] = useState<EmailChangeProofType | null>(null)
	const [code, setCode] = useState('')
	const [sent, setSent] = useState(false)
	const [busy, setBusy] = useState<'send' | 'cancel' | null>(null)
	const [marked, setMarked] = useState(false)

	const methods = pending.cancel_methods
	const method = pickMethod(methods, chosen)
	const date = formatEmailChangeDate(pending.execute_after, getDateLocale())

	// Para reconocer la credencial biométrica vieja cuando el cambio se haga
	const currentEmail = user?.email
	useEffect(() => { if (currentEmail) { rememberEmailBeforeChange(currentEmail) } }, [currentEmail])

	const handleSend = async () => {
		if (!method || method === 'totp') { return }
		setBusy('send')
		const result = await userApi.sendEmailChangeCode({ channel: method, purpose: 'cancel' })
		setBusy(null)
		if (result.success) { setSent(true); toast.success(t('settings.emailChange.toasts.codeSent')); return }
		handleFailure(result)
	}

	const handleCancel = async () => {
		if (!method) { return }
		setBusy('cancel')
		const result = await userApi.cancelEmailChange({ proof: { type: method, code: code.trim() } })
		setBusy(null)
		if (result.success) {
			forgetEmailBeforeChange()
			queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_KEY })
			toast.success(t('settings.emailChange.toasts.cancelled'))
			navigation.goBack()
			return
		}
		const failure = handleFailure(result)
		if (failure.field === 'proof') { setMarked(true); setCode('') }
		// Aquí no hay paso 1 al que volver: agotados los intentos se pide otro código
		if (failure.action === 'restart') { setCode(''); setSent(false) }
		if (failure.action === 'reloadMethods') { queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_KEY }) }
	}

	const items: { icon: FontAwesome6SolidIconName, text: string }[] = [
		{ icon: 'pause', text: t('settings.emailChange.pending.paused') },
		{ icon: 'right-from-bracket', text: t('settings.emailChange.pending.sessions') },
		{ icon: 'fingerprint', text: t('settings.emailChange.pending.biometrics') },
	]

	return (
		<QPKeyboardView
			scrollViewProps={{ refreshControl }}
			actions={
				cancelling && method ? (
					<QPButton
						title={t('settings.emailChange.pending.confirmCancelButton')}
						onPress={handleCancel}
						loading={busy === 'cancel'}
						disabled={!!busy || !proofIsComplete(method, code)}
						danger
						testID="email-change-confirm-cancel"
					/>
				) : (
					<QPButton
						title={t('settings.emailChange.pending.cancelButton')}
						onPress={() => setCancelling(true)}
						style={{ backgroundColor: theme.colors.surface }}
						textStyle={{ color: theme.colors.primaryText }}
						testID="email-change-cancel"
					/>
				)
			}
		>
			<Text style={textStyles.h1}>{t('settings.emailChange.pending.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.emailChange.pending.subtitle')}</Text>

			{/* Correo y fecha en su propia tarjeta: dentro de una frase, el correo enmascarado se partía en «.com» */}
			<View style={[containerStyles.card, styles.firstCard]}>
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('settings.emailChange.pending.newEmailLabel')}</Text>
				<Text style={[textStyles.h5, styles.value]} numberOfLines={1} testID="email-change-pending-email">{pending.new_email}</Text>
				<View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{t('settings.emailChange.pending.dateLabel')}</Text>
				<Text style={[textStyles.h5, styles.value]} testID="email-change-pending-date">{date}</Text>
			</View>

			<View style={[containerStyles.card, styles.list]}>
				{items.map(({ icon, text }) => <EmailChangeInfoRow key={icon} icon={icon} text={text} />)}
			</View>

			{cancelling && method && (
				<EmailChangeProofField
					methods={methods}
					method={method}
					onMethod={(next) => { setChosen(next); setCode(''); setSent(false); setMarked(false) }}
					code={code}
					onCode={(next) => { setCode(next); setMarked(false) }}
					purpose="cancel"
					sent={sent}
					onSend={handleSend}
					sending={busy === 'send'}
					marked={marked}
					disabled={busy === 'cancel'}
				/>
			)}
		</QPKeyboardView>
	)
}

export default EmailChangePending

const styles = StyleSheet.create({
	firstCard: {
		marginTop: 20,
	},
	value: {
		marginTop: 4,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		opacity: 0.5,
		marginVertical: 14,
	},
	list: {
		gap: 16,
	},
})
