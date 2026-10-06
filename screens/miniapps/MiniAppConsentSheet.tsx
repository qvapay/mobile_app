import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'
import { useQueryClient } from '@tanstack/react-query'

import QPSheet from '../../ui/QPSheet'
import QPButton from '../../ui/particles/QPButton'
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

import { miniappsApi } from '../../api/miniappsApi'
import { BRIDGE_ERRORS, type BridgeError } from '../../miniapps/protocol'
import MiniAppIcon from './MiniAppIcon'
import { MINIAPPS_ROOT } from './miniappsQueries'
import type { MiniApp, MiniAppAuthorization, MiniAppScope } from '../../types/domain'

/** Qué comparte cada scope: el icono y la clave del texto que lo explica. */
const SCOPE_ROWS: Record<MiniAppScope, { icon: FontAwesome6SolidIconName, key: string }> = {
	profile: { icon: 'user', key: 'miniapps.consent.scopes.profile' },
	kyc: { icon: 'shield-halved', key: 'miniapps.consent.scopes.kyc' },
}

type Props = {
	app: MiniApp
	scopes: MiniAppScope[]
	onAllow: (result: MiniAppAuthorization) => void
	onDeny: (error?: BridgeError) => void
}

/**
 * Hoja nativa de consentimiento de identidad ("Iniciar sesión con QvaPay").
 * Lista exactamente lo que la mini-app recibirá y recuerda lo que NUNCA
 * recibe (contraseña, sesión, saldo). Al permitir, qpweb guarda el permiso y
 * devuelve el payload firmado que se entrega a la mini-app.
 */
const MiniAppConsentSheet = ({ app, scopes, onAllow, onDeny }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const queryClient = useQueryClient()
	const [loading, setLoading] = useState(false)

	const allow = async () => {
		if (loading) return
		setLoading(true)
		const result = await miniappsApi.authorize(app.slug, scopes)
		setLoading(false)
		if (result.success) {
			if (result.data) {
				queryClient.invalidateQueries({ queryKey: MINIAPPS_ROOT })
				onAllow(result.data)
			} else {
				onDeny({ code: BRIDGE_ERRORS.FAILED, message: 'Authorization failed' })
			}
		} else {
			toast.error(t('miniapps.consent.failed'), { description: result.error })
			onDeny({ code: result.status == null ? BRIDGE_ERRORS.NETWORK : BRIDGE_ERRORS.FAILED, message: 'Authorization failed' })
		}
	}

	return (
		<QPSheet visible onClose={() => onDeny()} dismissable={!loading}>
			<View style={styles.header}>
				<MiniAppIcon app={app} size={64} />
				<Text style={[textStyles.h3, styles.center, { marginTop: 12 }]}>{t('miniapps.consent.title', { name: app.name })}</Text>
				<Text style={[textStyles.h6, styles.center, { color: theme.colors.secondaryText, marginTop: 4 }]}>{t('miniapps.consent.subtitle')}</Text>
			</View>

			<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
				{scopes.map(scope => (
					<View key={scope} style={styles.row}>
						<FontAwesome6 name={SCOPE_ROWS[scope].icon} size={16} color={theme.colors.primary} iconStyle="solid" style={styles.rowIcon} />
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, flex: 1 }]}>{t(SCOPE_ROWS[scope].key)}</Text>
					</View>
				))}
			</View>

			<View style={styles.notice}>
				<FontAwesome6 name="lock" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText, flex: 1, marginLeft: 8 }]}>{t('miniapps.consent.never')}</Text>
			</View>

			<View style={styles.actions}>
				<QPButton title={t('miniapps.consent.allow')} onPress={allow} loading={loading} disabled={loading} textStyle={{ color: theme.colors.buttonText }} />
				<QPButton title={t('miniapps.consent.deny')} onPress={() => onDeny()} disabled={loading} style={{ backgroundColor: 'transparent' }} textStyle={{ color: theme.colors.secondaryText }} />
			</View>
		</QPSheet>
	)
}

const styles = StyleSheet.create({
	header: { alignItems: 'center', paddingTop: 8 },
	center: { textAlign: 'center' },
	card: { borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 6, marginTop: 20 },
	row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
	rowIcon: { width: 28 },
	notice: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingHorizontal: 4 },
	actions: { marginTop: 18, gap: 4 },
})

export default MiniAppConsentSheet
