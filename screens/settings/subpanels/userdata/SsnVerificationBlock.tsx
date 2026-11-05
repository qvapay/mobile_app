import { useCallback, useRef, useState } from 'react'
import { Linking, Modal, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import LottieView from 'lottie-react-native'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../../theme/themeUtils'

// UI
import QPButton from '../../../../ui/particles/QPButton'
import QPPressable from '../../../../ui/particles/QPPressable'
import QPModalCard from '../../../../ui/QPModalCard'
import { useModalGate } from '../../../../ui/useModalGate'

// API / queries
import { userApi } from '../../../../api/userApi'
import { USER_CIP_QUERY } from '../../../../hooks/useOfacQueries'
import { DEPOSIT_ELIGIBILITY_KEY } from '../../../../hooks/useDepositEligibilityQuery'

// i18n (locale de fechas)
import { getDateLocale } from '../../../../i18n'

// Routes
import { ROUTES } from '../../../../routes'

// Toast
import { toast } from 'sonner-native'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Logic (pure)
import { applyVerified, blockActionFor, classifySsnVerifyError, deriveSsnView } from './ssnVerification'
import type { SsnBlockAction } from './ssnVerification'
import type { UserCip } from '../../../../types/domain'

type Props = {
	cip: UserCip
	/** Un `block_reason` de dato faltante pide resaltar el campo de la ficha. */
	onHighlight: (field: Extract<SsnBlockAction, { kind: 'field' }>['field']) => void
}

const SUPPORT_MAILTO = 'mailto:soporte@qvapay.com'

/**
 * Bloque «Verificación del SSN» (solo con `us_person` GUARDADO): contrasta SSN + nombre
 * + fecha de nacimiento del documento con registros de crédito (`POST /user/cip/verify-ssn`,
 * síncrono) y abre tarjeta y PayPal con cupo de $500/30 días. Cuatro estados derivados
 * por `deriveSsnView`: verificado · listo · reintento · bloqueado (con la acción por
 * `block_reason`). Nunca nombra al proveedor.
 */
const SsnVerificationBlock = ({ cip, onHighlight }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const navigation = useNavigation()
	const queryClient = useQueryClient()

	const view = deriveSsnView(cip.ssn_verification)
	const [confirming, setConfirming] = useState(false)
	const [verifying, setVerifying] = useState(false)
	const [celebrate, setCelebrate] = useState(false)
	// En vuelo: el servidor no tiene restricción única y la llamada cobra intento
	const inFlight = useRef(false)
	// Cerrar la confirmación justo al tocar «Verificar» = ocultar un Modal recién presentado:
	// pasa por el gate para no dejar un zombi en iOS
	const gate = useModalGate(confirming)

	const refresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: USER_CIP_QUERY.queryKey })
		queryClient.invalidateQueries({ queryKey: DEPOSIT_ELIGIBILITY_KEY })
	}, [queryClient])

	const verify = useCallback(async () => {
		if (inFlight.current) { return }
		inFlight.current = true
		setConfirming(false)
		setVerifying(true)
		try {
			const result = await userApi.verifySsn()
			if (result.success) {
				queryClient.setQueryData(USER_CIP_QUERY.queryKey, (current: UserCip | null | undefined) => applyVerified(current ?? cip, result.data))
				setCelebrate(true)
				toast.success(t('settings.userdata.ssn.toasts.success.title'), { description: t('settings.userdata.ssn.toasts.success.body') })
				refresh()
				return
			}
			const failure = classifySsnVerifyError(result.status, result.details)
			switch (failure.kind) {
				case 'no_match': {
					const left = failure.attemptsLeft
					const description = left === null ? undefined : t('settings.userdata.ssn.toasts.attemptsLeft', { count: left })
					toast.error(t('settings.userdata.ssn.toasts.noMatch'), { description })
					break
				}
				case 'rate_limited': toast.info(t('settings.userdata.ssn.toasts.rateLimited')); break
				case 'unavailable': toast.error(t('settings.userdata.ssn.toasts.unavailable')); break
				case 'blocked': {
					// El servidor ya no deja empezar: la ficha refrescada enseña el motivo
					const key = failure.blockReason ? `settings.userdata.ssn.block.${failure.blockReason}` : null
					toast.error(key && t(key) !== key ? t(key) : (result.error || t('settings.userdata.ssn.toasts.failed')))
					break
				}
				default: toast.error(result.error || t('settings.userdata.ssn.toasts.failed'))
			}
			// Intentos y estado (`no_match`) los recuenta el servidor
			refresh()
		} finally {
			inFlight.current = false
			setVerifying(false)
		}
	}, [cip, queryClient, refresh, t])

	const runBlockAction = useCallback((action: SsnBlockAction) => {
		switch (action.kind) {
			case 'gold': navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.GOLD_CHECK, initial: false }); break
			case 'kyc': navigation.navigate(ROUTES.SETTINGS_STACK, { screen: ROUTES.KYC, initial: false }); break
			case 'field': onHighlight(action.field); break
			case 'support': Linking.openURL(SUPPORT_MAILTO); break
			default: break
		}
	}, [navigation, onHighlight])

	const goDeposit = useCallback(() => { navigation.navigate(ROUTES.ADD, { preselectedCoin: 'CARD' }) }, [navigation])

	const formatDate = (iso: string | null) => {
		if (!iso) { return '' }
		const date = new Date(iso)
		return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(getDateLocale(), { year: 'numeric', month: 'long', day: 'numeric' })
	}

	const header = (
		<View style={styles.header}>
			<FontAwesome6 name="shield-halved" size={14} color={theme.colors.primary} iconStyle="solid" />
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginLeft: 8, marginBottom: 0, flex: 1 }]}>{t('settings.userdata.ssn.title')}</Text>
			{view.phase === 'verified' && (
				<View style={[styles.pill, { backgroundColor: theme.colors.successFill }]} testID="ssn-verified-pill">
					<FontAwesome6 name="circle-check" size={11} color={theme.colors.successFillText} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.successFillText, fontFamily: theme.typography.fontFamily.medium }]}>{t('settings.userdata.ssn.verified.pill')}</Text>
				</View>
			)}
		</View>
	)

	// 1. Verificado: fecha, cupo y acceso directo a Depositar
	if (view.phase === 'verified') {
		return (
			<View style={styles.section} testID="ssn-block-verified">
				{header}
				<View style={containerStyles.card}>
					{celebrate && (
						<LottieView source={require('../../../../assets/lotties/verified.json')} autoPlay loop={false} style={styles.lottie} onAnimationFinish={() => setCelebrate(false)} />
					)}
					{!!view.verifiedAt && <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('settings.userdata.ssn.verified.date', { date: formatDate(view.verifiedAt) })}</Text>}
					<Text style={[textStyles.body, { color: theme.colors.primaryText, marginTop: 4 }]}>{t('settings.userdata.ssn.verified.body')}</Text>
					<QPButton title={t('settings.userdata.ssn.verified.deposit')} onPress={goDeposit} icon="plus" iconStyle="solid" iconColor={theme.colors.almostWhite} style={styles.button} textStyle={{ color: theme.colors.almostWhite }} />
				</View>
			</View>
		)
	}

	// 3. Bloqueado: el motivo del servidor y la salida que corresponde
	if (view.phase === 'blocked') {
		const action = blockActionFor(view.blockReason)
		const key = `settings.userdata.ssn.block.${view.blockReason ?? 'UNAVAILABLE'}`
		const message = t(key) !== key ? t(key) : (view.message || t('settings.userdata.ssn.block.UNAVAILABLE'))
		return (
			<View style={styles.section} testID="ssn-block-blocked">
				{header}
				<View style={containerStyles.card}>
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>{t('settings.userdata.ssn.hint')}</Text>
					<View style={styles.blockedRow}>
						<FontAwesome6 name="circle-info" size={14} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[textStyles.body, { color: theme.colors.primaryText, flex: 1 }]}>{message}</Text>
					</View>
					{action.kind !== 'none' && (
						<QPPressable onPress={() => runBlockAction(action)} style={styles.link} accessibilityRole="button" testID="ssn-block-action">
							<Text style={[textStyles.body, { color: theme.colors.primary, fontFamily: theme.typography.fontFamily.medium }]}>{t(`settings.userdata.ssn.actions.${action.kind}`)}</Text>
							<FontAwesome6 name="chevron-right" size={12} color={theme.colors.primary} iconStyle="solid" />
						</QPPressable>
					)}
				</View>
			</View>
		)
	}

	// 2 y 4. Puede verificar (con el aviso de reintento si el último no casó)
	return (
		<View style={styles.section} testID="ssn-block-ready">
			{header}
			<View style={containerStyles.card}>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{t('settings.userdata.ssn.ready.body')}</Text>
				{view.phase === 'retry' && (
					<View style={[styles.blockedRow, { marginTop: 10 }]}>
						<FontAwesome6 name="triangle-exclamation" size={13} color={theme.colors.warning} iconStyle="solid" />
						<Text style={[textStyles.caption, { color: theme.colors.warning, flex: 1 }]}>{t('settings.userdata.ssn.retry.notice')}</Text>
					</View>
				)}
				<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 10 }]}>{t('settings.userdata.ssn.attempts', { count: view.attemptsLeft })}</Text>
				<QPButton
					title={verifying ? t('settings.userdata.ssn.verifying') : t('settings.userdata.ssn.button')}
					onPress={() => setConfirming(true)}
					loading={verifying}
					disabled={verifying}
					icon="shield-halved"
					iconStyle="solid"
					iconColor={theme.colors.almostWhite}
					style={styles.button}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>

			{/* Confirmación: la consulta cobra uno de los intentos */}
			{gate.mounted && (
				<Modal visible={gate.visible} onShow={gate.onShow} onDismiss={gate.onDismiss} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setConfirming(false)}>
					<QPPressable style={containerStyles.modalOverlay} onPress={() => setConfirming(false)}>
						<QPModalCard key={gate.generation}>
							<FontAwesome6 name="shield-halved" size={40} color={theme.colors.primary} iconStyle="solid" style={styles.modalIcon} />
							<Text style={[textStyles.h3, { textAlign: 'center', marginBottom: 8 }]}>{t('settings.userdata.ssn.confirm.title')}</Text>
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, textAlign: 'center', marginBottom: 16 }]}>{t('settings.userdata.ssn.confirm.body', { max: view.attemptsMax })}</Text>
							<QPButton title={t('settings.userdata.ssn.confirm.accept')} onPress={verify} style={{ backgroundColor: theme.colors.primary, marginBottom: 8 }} textStyle={{ color: theme.colors.almostWhite }} testID="ssn-confirm-accept" />
							<QPButton title={t('common.actions.cancel')} onPress={() => setConfirming(false)} style={{ backgroundColor: 'transparent' }} textStyle={{ color: theme.colors.secondaryText }} />
						</QPModalCard>
					</QPPressable>
				</Modal>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	section: { marginTop: 16 },
	header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
	pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
	blockedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
	link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
	button: { marginTop: 14 },
	lottie: { width: 96, height: 96, alignSelf: 'center' },
	modalIcon: { alignSelf: 'center', marginBottom: 16 },
})

export default SsnVerificationBlock
