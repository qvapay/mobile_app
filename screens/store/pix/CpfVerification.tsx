import { useCallback, useRef, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPInput from '../../../ui/particles/QPInput'
import QPKeyboardView from '../../../ui/QPKeyboardView'

// API / queries
import { userApi } from '../../../api/userApi'
import { USER_CIP_QUERY } from '../../../hooks/useOfacQueries'
import { PIX_ELIGIBILITY_KEY } from './pixQueries'

// Routes
import { ROUTES } from '../../../routes'

// Logic
import { CPF_MASK_LENGTH, applyCpfVerified, classifyCpfVerifyError, cpfBlockAction, deriveCpfView, formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpfRules'
import type { CpfVerifyFailure } from './cpfRules'
import type { RootStackParamList } from '../../../types/navigation'
import type { UserCip } from '../../../types/domain'

const SUPPORT_MAILTO = 'mailto:soporte@qvapay.com'

/**
 * Verificación del CPF, la llave del pago con PIX. Solo se teclea el número: el nombre y la fecha
 * salen del documento verificado. Los dígitos verificadores se comprueban aquí para no gastar un
 * intento en una errata. El CPF no sale de esta pantalla: ni a caché ni a disco. Nunca nombra al
 * proveedor.
 */
const CpfVerification = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'CpfVerification'>) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const queryClient = useQueryClient()

	// Siempre fresca: de ella sale si puede empezar, y depende de dónde esté ahora mismo
	const { data: cip, isPending } = useQuery({ ...USER_CIP_QUERY, staleTime: 0 })
	const view = deriveCpfView(cip?.cpf_verification)
	// Comprar GOLD o rehacer el KYC desde aquí cambia si puede empezar: se pregunta otra vez al volver
	useFocusEffect(useCallback(() => {
		queryClient.invalidateQueries({ queryKey: USER_CIP_QUERY.queryKey }, { cancelRefetch: false })
	}, [queryClient]))

	const [cpf, setCpf] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [sending, setSending] = useState(false)
	// En vuelo: cada consulta con respuesta gasta un intento
	const inFlight = useRef(false)

	const complete = normalizeCpf(cpf).length === 11
	const valid = isValidCpf(cpf)
	const showInvalid = complete && !valid

	const onChange = useCallback((text: string) => {
		setCpf(formatCpf(text))
		setError(null)
	}, [])

	const describe = useCallback((failure: CpfVerifyFailure, fallback: string | undefined) => {
		if (failure.kind === 'blocked') {
			const key = `store.pix.cpf.block.${failure.blockReason}`
			return t(key) !== key ? t(key) : (fallback || t('store.pix.cpf.errors.generic'))
		}
		const key = `store.pix.cpf.errors.${failure.kind}`
		return failure.kind !== 'unknown' ? t(key) : (fallback || t('store.pix.cpf.errors.generic'))
	}, [t])

	const verify = useCallback(async () => {
		if (inFlight.current || !isValidCpf(cpf)) { return }
		inFlight.current = true
		setSending(true)
		setError(null)
		try {
			const result = await userApi.verifyCpf(cpf)
			if (result.success) {
				queryClient.setQueryData(USER_CIP_QUERY.queryKey, (current: UserCip | null | undefined) => (current ? applyCpfVerified(current, result.data) : current))
				queryClient.invalidateQueries({ queryKey: PIX_ELIGIBILITY_KEY })
				setCpf('')
				return
			}
			setError(describe(classifyCpfVerifyError(result.status, result.details), result.error))
			// Intentos y estado los recuenta el servidor
			queryClient.invalidateQueries({ queryKey: USER_CIP_QUERY.queryKey })
		} finally {
			inFlight.current = false
			setSending(false)
		}
	}, [cpf, describe, queryClient])

	if (isPending) { return <View style={containerStyles.subContainer} /> }

	if (view.phase === 'verified') {
		return (
			<QPKeyboardView actions={<QPButton title={t('common.actions.continue')} onPress={() => navigation.goBack()} testID="cpf-continue" />}>
				<View style={styles.centered}>
					<LottieView source={require('../../../assets/lotties/verified.json')} autoPlay loop={false} style={styles.lottie} />
					<Text style={[textStyles.h3, styles.text, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 12 }]}>{t('store.pix.cpf.verified.title')}</Text>
					<Text style={[textStyles.h5, styles.text, { color: theme.colors.secondaryText, marginTop: 6 }]} testID="cpf-masked">{maskCpf(view.last2)}</Text>
					<Text style={[textStyles.h6, styles.text, { color: theme.colors.tertiaryText, marginTop: 12 }]}>{t('store.pix.cpf.verified.body')}</Text>
				</View>
			</QPKeyboardView>
		)
	}

	if (view.phase === 'blocked') {
		const action = cpfBlockAction(view.blockReason)
		const key = `store.pix.cpf.block.${view.blockReason}`
		const message = t(key) !== key ? t(key) : (view.message || t('store.pix.cpf.block.UNAVAILABLE'))
		const runAction = () => {
			if (action === 'gold') { navigation.navigate(ROUTES.GOLD_CHECK) }
			else if (action === 'kyc') { navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.KYC, initial: false }) }
			else { Linking.openURL(SUPPORT_MAILTO) }
		}
		return (
			<QPKeyboardView actions={action !== 'none' ? <QPButton title={t(`store.pix.cpf.actions.${action}`)} onPress={runAction} testID="cpf-block-action" /> : undefined}>
				<View style={styles.centered}>
					<FontAwesome6 name="circle-info" size={28} color={theme.colors.warning} iconStyle="solid" />
					<Text style={[textStyles.h5, styles.text, { color: theme.colors.primaryText, marginTop: 14 }]} testID="cpf-blocked">{message}</Text>
				</View>
			</QPKeyboardView>
		)
	}

	return (
		<QPKeyboardView actions={<QPButton title={sending ? t('store.pix.cpf.verifying') : t('store.pix.cpf.button')} onPress={verify} disabled={!valid || sending} loading={sending} testID="cpf-submit" />}>
			<Text style={[textStyles.h3, { color: theme.colors.primaryText, fontWeight: '600', marginTop: 16 }]}>{t('store.pix.cpf.title')}</Text>
			<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 8, marginBottom: 20 }]}>{t('store.pix.cpf.hint')}</Text>
			<QPInput
				prelabel={t('store.pix.cpf.label')}
				value={cpf}
				onChangeText={onChange}
				placeholder="000.000.000-00"
				keyboardType="number-pad"
				maxLength={CPF_MASK_LENGTH}
				autoComplete="off"
				autoCorrect={false}
				textContentType="none"
				testID="cpf-input"
			/>
			{showInvalid && <Text style={[textStyles.caption, { color: theme.colors.dangerText, marginTop: 8 }]} testID="cpf-invalid">{t('store.pix.cpf.errors.invalid')}</Text>}
			{!!error && <Text accessibilityRole="alert" style={[textStyles.caption, { color: theme.colors.dangerText, marginTop: 8 }]} testID="cpf-error">{error}</Text>}
			{view.phase === 'retry' && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 8 }]}>{t('store.pix.cpf.attempts', { count: view.attemptsLeft })}</Text>}
		</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
	text: { textAlign: 'center' },
	lottie: { width: 140, height: 140 },
})

export default CpfVerification
