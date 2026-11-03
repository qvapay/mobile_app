import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'

// UI
import QPPressable from '../../../../ui/particles/QPPressable'

// i18n
import { getDateLocale } from '../../../../i18n'

// Tipos
import type { LightningPayment } from '../../../../types/domain'

import { SATS_COLOR } from './LnQrCard'

type Props = {
	payment: LightningPayment
	onPress?: (payment: LightningPayment) => void
	last?: boolean
}

export const formatSats = (n: number | string): string => Number(n || 0).toLocaleString(getDateLocale())
const usd = (n: number | string): string => `$${Number(n || 0).toFixed(2)}`

/**
 * Un cobro en la Lightning Address: sats recibidos, el comentario de quien pagó
 * (sin verificar: lo escribió un tercero anónimo) y lo que entró al saldo, en USD
 * (neto de comisión) o en sats (sin comisión, con el equivalente en USD debajo).
 */
const LnPaymentRow = ({ payment, onPress, last }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const inSats = payment.credit_unit === 'sats'
	const date = payment.paid_at ? new Date(payment.paid_at).toLocaleString(getDateLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : ''

	return (
		<QPPressable
			onPress={payment.transaction_uuid && onPress ? () => onPress(payment) : undefined}
			style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border + '80' }]}
		>
			<View style={[styles.icon, { backgroundColor: SATS_COLOR + '1A' }]}>
				<FontAwesome6 name="bolt" size={14} color={SATS_COLOR} iconStyle="solid" />
			</View>
			<View style={styles.texts}>
				<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }}>
					{t('settings.lightningAddress.payments.sats', { sats: formatSats(payment.sats) })}
				</Text>
				{!!payment.comment && (
					<Text numberOfLines={2} style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }}>
						«{payment.comment}» <Text style={{ color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs }}>{t('settings.lightningAddress.payments.unverified')}</Text>
					</Text>
				)}
				<Text style={{ color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>{date}</Text>
			</View>
			<View style={styles.amount}>
				<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.md }}>
					{inSats ? `+${formatSats(payment.sats)} sats` : `+${usd(payment.credit_usd)}`}
				</Text>
				{inSats && (
					<Text style={{ color: theme.colors.tertiaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }}>
						≈ {usd(payment.credit_usd)} · {t('settings.lightningAddress.payments.satsCredit')}
					</Text>
				)}
			</View>
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
	icon: { width: 36, height: 36, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
	texts: { flex: 1, gap: 2 },
	amount: { alignItems: 'flex-end', gap: 2, maxWidth: '45%' },
})

export default LnPaymentRow
