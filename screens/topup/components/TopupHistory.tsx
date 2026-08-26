import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { timeAgo } from '../../../helpers'

import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles } from '../../../theme/themeUtils'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

/** Recarga tal como la sirve `GET /topup/history`. */
export type TopupHistoryItem = {
	id: string | number
	phoneNumber?: string
	amountCUP?: number
	status?: string
	createdAt?: string
}

type TopupHistoryProps = {
	items?: TopupHistoryItem[]
	loading?: boolean
	theme: Theme
	textStyles: TextStyles
}

/** Metadatos de estado: `colorKey` indexa `theme.colors`. */
type StatusMeta = {
	icon: FontAwesome6SolidIconName
	colorKey: 'success' | 'warning' | 'danger'
	labelKey: string
}

// Estado backend → icono/color/clave de etiqueta (resuelta con t() en render).
// Cualquier estado desconocido cae en 'pending'.
const STATUS_META: Record<string, StatusMeta> = {
	completed: { icon: 'circle-check', colorKey: 'success', labelKey: 'common.status.completed' },
	processing: { icon: 'clock', colorKey: 'warning', labelKey: 'topup.history.status.processing' },
	pending: { icon: 'clock', colorKey: 'warning', labelKey: 'common.status.pending' },
	failed: { icon: 'circle-xmark', colorKey: 'danger', labelKey: 'topup.history.status.failed' },
}

// Oculta el medio del número: +5355123456 → +53 5•••••56
const maskPhone = (phone?: string) => {
	if (!phone) return ''
	const digits = String(phone).replace(/^\+53/, '')
	if (digits.length < 4) return phone
	return `+53 ${digits[0]}•••••${digits.slice(-2)}`
}

/**
 * Recent store-billed top-ups list: masked phone, CUP amount, relative date and
 * status pill. Rendered with .map (short list inside the screen's ScrollView —
 * a nested VirtualizedList would warn and add nothing here).
 */
const TopupHistory = ({ items = [], loading = false, theme, textStyles }: TopupHistoryProps) => {

	const { t } = useTranslation()

	if (!loading && items.length === 0) return null

	return (
		<View style={styles.section}>
			<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600', marginBottom: 10 }]}>
				{t('topup.history.title')}
			</Text>

			{loading && items.length === 0 ? (
				<ActivityIndicator size="small" color={theme.colors.tertiaryText} />
			) : (
				<View style={{ gap: 8 }}>
					{items.map((item) => {
						const meta = STATUS_META[item.status as string] || STATUS_META.pending
						const statusColor = theme.colors[meta.colorKey]
						return (
							<View
								key={item.id}
								style={[
									styles.row,
									{ backgroundColor: theme.colors.surface },
									(theme as Theme & { mode?: 'light' | 'dark' }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border },
								]}
							>
								<FontAwesome6 name={meta.icon} size={16} color={statusColor} iconStyle="solid" />
								<View style={{ flex: 1, marginLeft: 12 }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
										{maskPhone(item.phoneNumber)}
									</Text>
									<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, marginTop: 2 }]}>
										{item.createdAt ? timeAgo(item.createdAt) : ''}
									</Text>
								</View>
								<View style={{ alignItems: 'flex-end' }}>
									<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>
										${item.amountCUP} CUP
									</Text>
									<Text style={[textStyles.caption, { color: statusColor, marginTop: 2 }]}>
										{t(meta.labelKey)}
									</Text>
								</View>
							</View>
						)
					})}
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	section: {
		marginTop: 26,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 14,
		borderRadius: 12,
	},
})

export default TopupHistory
