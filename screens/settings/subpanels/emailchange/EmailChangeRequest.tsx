import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPKeyboardView from '../../../../ui/QPKeyboardView'
import QPButton from '../../../../ui/particles/QPButton'
import QPCodeInput from '../../../../ui/particles/QPCodeInput'
import QPInput from '../../../../ui/particles/QPInput'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// API
import { userApi } from '../../../../api/userApi'
import { EMAIL_CHANGE_KEY, EMAIL_CHANGE_QUERY } from '../../../../hooks/useEmailChangeQuery'

// Paso compartido + reglas
import EmailChangeProofField from './EmailChangeProofField'
import useEmailChangeFailure from './useEmailChangeFailure'
import { looksLikeEmail, pickMethod, proofIsComplete } from './emailChangeRules'
import type { EmailChangeAction, EmailChangeField } from './emailChangeRules'

// Tipos
import type { EmailChangeStarted } from '../../../../api/userApi'
import type { EmailChangeProofType, EmailChangeState } from '../../../../types/domain'
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'

type EnabledState = Extract<EmailChangeState, { enabled: true }>

/** Tirar para releer el estado del servidor (lo arma EmailChange). */
type Refreshable = { refreshControl: ReactElement<RefreshControlProps> }

type FormProps = Refreshable & {
	email: string
	onEmail: (email: string) => void
	holdHours: number
	onStarted: (started: EmailChangeStarted) => void
}

/**
 * Paso 1: correo nuevo y contraseña, con el aviso de lo que implica ANTES de seguir.
 * La contraseña vive solo aquí: al pasar de paso el componente se desmonta y desaparece.
 */
const EmailChangeForm = ({ email, onEmail, holdHours, onStarted, refreshControl }: FormProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const handleFailure = useEmailChangeFailure()

	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [marked, setMarked] = useState<EmailChangeField | null>(null)

	const markedStyle = (field: EmailChangeField) => (marked === field ? { borderColor: theme.colors.danger, borderWidth: 1 } : undefined)

	const handleStart = async () => {
		setBusy(true)
		const result = await userApi.startEmailChange({ new_email: email.trim(), password })
		setBusy(false)
		if (result.success) {
			if (result.data) { onStarted(result.data) }
			return
		}
		const failure = handleFailure(result)
		if (failure.field) { setMarked(failure.field) }
		if (failure.field === 'password') { setPassword('') }
	}

	return (
		<QPKeyboardView
			scrollViewProps={{ refreshControl }}
			actions={
				<QPButton
					title={t('common.actions.continue')}
					onPress={handleStart}
					loading={busy}
					disabled={busy || !looksLikeEmail(email) || !password}
					textStyle={{ color: theme.colors.almostWhite }}
					testID="email-change-continue"
				/>
			}
		>
			<Text style={textStyles.h1}>{t('settings.emailChange.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.emailChange.subtitle')}</Text>

			<View style={[containerStyles.card, { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20 }]}>
				<FontAwesome6 name="shield-halved" size={16} color={theme.colors.warning} iconStyle="solid" />
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
					{t('settings.emailChange.notice', { hours: holdHours })}
				</Text>
			</View>

			<View style={{ marginTop: 12 }}>
				<QPInput
					prelabel={t('settings.emailChange.newEmailLabel')}
					value={email}
					onChangeText={(value) => { onEmail(value); if (marked === 'email') { setMarked(null) } }}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="email"
					textContentType="emailAddress"
					prefixIconName="envelope"
					style={markedStyle('email')}
					testID="email-change-new-email"
				/>
				<QPInput
					prelabel={t('settings.emailChange.passwordLabel')}
					value={password}
					onChangeText={(value) => { setPassword(value); if (marked === 'password') { setMarked(null) } }}
					secureTextEntry
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="current-password"
					textContentType="password"
					prefixIconName="lock"
					suffixIconName="eye"
					style={markedStyle('password')}
					testID="email-change-password"
				/>
			</View>
		</QPKeyboardView>
	)
}

type VerifyProps = Refreshable & {
	maskedEmail: string
	methods: EmailChangeProofType[]
	onMethods: (methods: EmailChangeProofType[]) => void
	onRestart: () => void
}

/** Paso 2: el código del correo nuevo y la prueba. Confirmar abre el pedido y pausa el dinero. */
const EmailChangeVerify = ({ maskedEmail, methods, onMethods, onRestart, refreshControl }: VerifyProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const queryClient = useQueryClient()
	const handleFailure = useEmailChangeFailure()

	const [newEmailCode, setNewEmailCode] = useState('')
	const [chosen, setChosen] = useState<EmailChangeProofType | null>(null)
	const [proofCode, setProofCode] = useState('')
	const [sent, setSent] = useState(false)
	const [busy, setBusy] = useState<'send' | 'confirm' | null>(null)
	const [marked, setMarked] = useState<EmailChangeField | null>(null)

	const method = pickMethod(methods, chosen)
	const ready = !!method && /^\d{6}$/.test(newEmailCode) && proofIsComplete(method, proofCode)

	// Lo que depende de este paso: volver al principio o releer qué pruebas valen
	const afterFailure = async (action: EmailChangeAction) => {
		if (action === 'restart') { onRestart(); return }
		if (action !== 'reloadMethods') { return }
		const fresh = await queryClient.fetchQuery(EMAIL_CHANGE_QUERY).catch(() => null)
		if (fresh?.enabled) { onMethods(fresh.methods) }
	}

	const handleSend = async () => {
		if (!method || method === 'totp') { return }
		setBusy('send')
		const result = await userApi.sendEmailChangeCode({ channel: method })
		setBusy(null)
		if (result.success) { setSent(true); toast.success(t('settings.emailChange.toasts.codeSent')); return }
		await afterFailure(handleFailure(result).action)
	}

	const handleConfirm = async () => {
		if (!method) { return }
		setBusy('confirm')
		const result = await userApi.confirmEmailChange({ new_email_code: newEmailCode, proof: { type: method, code: proofCode.trim() } })
		setBusy(null)
		if (result.success) {
			const pending = result.data?.pending
			// El pedido ya existe: la vista cambia sin esperar a la recarga, que trae `cancel_methods`
			if (pending) {
				queryClient.setQueryData<EmailChangeState>(EMAIL_CHANGE_KEY, previous => (previous?.enabled ? { ...previous, can_start: false, pending: { ...pending, cancel_methods: methods } } : previous))
			}
			queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_KEY })
			toast.success(t('settings.emailChange.toasts.scheduled'))
			return
		}
		const failure = handleFailure(result)
		// El correo se ocupó mientras tanto: el servidor ya tiró la solicitud y aquí no hay ese campo
		if (failure.field === 'email') { onRestart(); return }
		if (failure.field) { setMarked(failure.field) }
		if (failure.field === 'newEmailCode') { setNewEmailCode('') }
		if (failure.field === 'proof') { setProofCode('') }
		await afterFailure(failure.action)
	}

	return (
		<QPKeyboardView
			scrollViewProps={{ refreshControl }}
			actions={
				<>
					<QPButton
						title={t('settings.emailChange.verify.confirmButton')}
						onPress={handleConfirm}
						loading={busy === 'confirm'}
						disabled={!!busy || !ready}
						textStyle={{ color: theme.colors.almostWhite }}
						testID="email-change-confirm"
					/>
					<QPButton
						title={t('settings.emailChange.verify.backButton')}
						onPress={onRestart}
						disabled={!!busy}
						style={{ backgroundColor: theme.colors.surface }}
						textStyle={{ color: theme.colors.primaryText }}
						testID="email-change-restart"
					/>
				</>
			}
			actionsContainerStyle={{ gap: 10 }}
		>
			<Text style={textStyles.h1}>{t('settings.emailChange.verify.title')}</Text>

			<Text style={[textStyles.h5, { color: marked === 'newEmailCode' ? theme.colors.danger : theme.colors.secondaryText, marginTop: 20, marginBottom: 8 }]}>
				{t('settings.emailChange.verify.newEmailCodeLabel', { email: maskedEmail })}
			</Text>
			<QPCodeInput
				length={6}
				code={newEmailCode}
				onChangeCode={(code) => { setNewEmailCode(code); if (marked === 'newEmailCode') { setMarked(null) } }}
				autoFocus
				disabled={!!busy}
				testID="email-change-new-email-code"
			/>

			{method && (
				<EmailChangeProofField
					methods={methods}
					method={method}
					onMethod={(next) => { setChosen(next); setProofCode(''); setSent(false); setMarked(null) }}
					code={proofCode}
					onCode={(code) => { setProofCode(code); if (marked === 'proof') { setMarked(null) } }}
					purpose="request"
					sent={sent}
					onSend={handleSend}
					sending={busy === 'send'}
					marked={marked === 'proof'}
					disabled={busy === 'confirm'}
				/>
			)}
		</QPKeyboardView>
	)
}

/**
 * Pedir el cambio. Los dos pasos comparten solo lo que hace falta para volver atrás: el
 * correo tecleado. `methods` sale de la respuesta de `start`, que manda sobre el GET.
 */
const EmailChangeRequest = ({ state, refreshControl }: Refreshable & { state: EnabledState }) => {

	const [email, setEmail] = useState('')
	const [started, setStarted] = useState<EmailChangeStarted | null>(null)

	if (!started) {
		return <EmailChangeForm email={email} onEmail={setEmail} holdHours={state.hold_hours} onStarted={setStarted} refreshControl={refreshControl} />
	}

	return (
		<EmailChangeVerify
			maskedEmail={started.new_email}
			methods={started.methods}
			onMethods={(methods) => setStarted({ ...started, methods })}
			onRestart={() => setStarted(null)}
			refreshControl={refreshControl}
		/>
	)
}

export default EmailChangeRequest
