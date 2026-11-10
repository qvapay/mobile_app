import { View, Text, Switch } from 'react-native'
import { useTranslation } from 'react-i18next'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import type { TextStyle } from 'react-native'
import type { Theme } from '../../theme/ThemeContext'

// Bitcoin orange — mismo tono de los pills de sats (MainStack / PhoneTopupBrand)
const SATS_COLOR = '#F7931A'

type Props = {
	enabled: boolean
	onToggle: (value: boolean) => void
	/** Forma de pago sin descuento en sats (PIX): el interruptor se apaga y lo dice. */
	disabled?: boolean
	sats: number
	satsUsd: number
	theme: Theme
	textStyles: Record<string, TextStyle>
}

/**
 * "Usar mis satoshis" toggle row for store purchase summaries: shows the user's
 * sats balance with its approximate USD value and an on/off switch that applies
 * them as a discount (min(sats value, total), up to 100% of the purchase).
 */
const SatsDiscountRow = ({ enabled, onToggle, disabled = false, sats, satsUsd, theme, textStyles }: Props) => {
	const { t } = useTranslation()
	return (
		<View style={{ paddingVertical: 6 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
					<FontAwesome6 name="bolt" size={12} color={SATS_COLOR} iconStyle="solid" />
					<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>
						{t('ui.satsDiscountRow.label', { sats: sats.toLocaleString(), satsUsd: satsUsd.toFixed(2) })}
					</Text>
				</View>
				<Switch
					value={enabled && !disabled}
					onValueChange={onToggle}
					disabled={disabled}
					trackColor={{ false: theme.colors.elevation, true: SATS_COLOR }}
					thumbColor={theme.colors.almostWhite}
				/>
			</View>
			{disabled && <Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>{t('store.pix.satsUnavailable')}</Text>}
		</View>
	)
}

export default SatsDiscountRow
