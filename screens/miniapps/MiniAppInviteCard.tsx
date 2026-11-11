import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../ui/particles/QPButton'
import QPPressable from '../../ui/particles/QPPressable'
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, hexToRgba } from '../../theme/themeUtils'
import MiniAppIcon from './MiniAppIcon'
import { inviterLabel } from './miniappTesting'
import type { MiniAppTesterInvite } from '../../types/domain'

type MiniAppInviteCardProps = {
	invite: MiniAppTesterInvite
	/** Respuesta de ESTA tarjeta en vuelo (su botón, cargando). */
	answering: 'accept' | 'decline' | null
	/** Hay otra respuesta en vuelo: no se responden dos a la vez. */
	disabled: boolean
	onAccept: () => void
	onDecline: () => void
}

/**
 * Invitación a probar una mini-app sin publicar, arriba del catálogo. Hasta
 * aceptarla no se ve nada de la mini-app más que esto, y la tarjeta dice antes
 * de entrar que QvaPay aún no la ha revisado y que dentro no se puede pagar.
 */
const MiniAppInviteCard = ({ invite, answering, disabled, onAccept, onDecline }: MiniAppInviteCardProps) => {

	const { t } = useTranslation()
	const { theme, isDark } = useTheme()
	const textStyles = useTextStyles(theme)
	const inviter = inviterLabel(invite)
	const busy = disabled || answering != null

	return (
		<View
			style={[styles.card, { backgroundColor: theme.colors.surface }, !isDark && { borderWidth: 1, borderColor: theme.colors.border }]}
			testID={`miniapp-invite-${invite.slug}`}
		>
			<View style={styles.top}>
				<MiniAppIcon app={invite} size={48} />
				<View style={styles.text}>
					<Text style={[textStyles.h5, { color: theme.colors.primaryText }]} numberOfLines={1}>{invite.name}</Text>
					<Text style={[textStyles.caption, styles.mt2]} numberOfLines={2}>
						{inviter ? t('miniapps.testing.invitedBy', { inviter }) : t('miniapps.testing.invited')}
					</Text>
				</View>
			</View>

			<View style={[styles.notice, { backgroundColor: hexToRgba(theme.colors.warning, 0.12) }]}>
				<FontAwesome6 name="flask" size={11} color={theme.colors.warning} iconStyle="solid" style={styles.noticeIcon} />
				<Text style={[textStyles.h7, styles.flex, { color: theme.colors.secondaryText }]}>{t('miniapps.testing.inviteNotice')}</Text>
			</View>

			<View style={styles.actions}>
				<QPPressable
					onPress={onDecline}
					disabled={busy}
					style={[styles.decline, busy && answering !== 'decline' && styles.dimmed]}
					accessibilityRole="button"
					accessibilityLabel={t('miniapps.testing.decline')}
					testID={`miniapp-invite-decline-${invite.slug}`}
				>
					{answering === 'decline'
						? <ActivityIndicator color={theme.colors.secondaryText} />
						: <Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{t('miniapps.testing.decline')}</Text>}
				</QPPressable>
				<QPButton
					title={t('miniapps.testing.accept')}
					onPress={onAccept}
					loading={answering === 'accept'}
					disabled={busy && answering !== 'accept'}
					style={styles.flex}
					textStyle={{ color: theme.colors.buttonText }}
					fitTitle
					testID={`miniapp-invite-accept-${invite.slug}`}
				/>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	card: { borderRadius: 16, borderCurve: 'continuous', padding: 14, marginBottom: 12 },
	top: { flexDirection: 'row', alignItems: 'center' },
	text: { flex: 1, marginLeft: 12 },
	notice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: 10, paddingVertical: 8, marginTop: 12 },
	noticeIcon: { marginTop: 2, marginRight: 8 },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
	decline: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
	dimmed: { opacity: 0.5 },
	flex: { flex: 1 },
	mt2: { marginTop: 2 },
})

export default MiniAppInviteCard
