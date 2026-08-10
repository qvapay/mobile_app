import { View, Text, Switch } from 'react-native'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Bitcoin orange — mismo tono de los pills de sats (MainStack / PhoneTopupBrand)
const SATS_COLOR = '#F7931A'

/**
 * "Usar mis satoshis" toggle row for store purchase summaries: shows the user's
 * sats balance with its approximate USD value and an on/off switch that applies
 * them as a discount (min(sats value, total), up to 100% of the purchase).
 */
const SatsDiscountRow = ({ enabled, onToggle, sats, satsUsd, theme, textStyles }) => (
	<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 12 }}>
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
			<FontAwesome6 name="bolt" size={12} color={SATS_COLOR} iconStyle="solid" />
			<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>
				Usar mis satoshis · {sats.toLocaleString()} (≈ ${satsUsd.toFixed(2)})
			</Text>
		</View>
		<Switch
			value={enabled}
			onValueChange={onToggle}
			trackColor={{ false: theme.colors.elevation, true: SATS_COLOR }}
			thumbColor={theme.colors.almostWhite}
		/>
	</View>
)

export default SatsDiscountRow
