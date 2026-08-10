import { View, Text, Pressable, TextInput } from 'react-native'

import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Bitcoin orange, mismo tono del pill de sats del header (MainStack / PhoneTopupBrand)
const SATS_COLOR = '#F7931A'

/**
 * Amount card for redeeming cashback satoshis over Lightning (Withdraw with
 * source 'satoshis'): shows the available sats with their approximate USD value
 * at the live BTC price, an integer sats input with a MAX chip, and a locked
 * read-only mode when the scanned invoice already fixes the amount.
 */
const WithdrawSatsCard = ({ amountSats, onChangeAmountSats, availableSats, btcPrice, minSats, locked, theme, textStyles }) => {

	const satsNumber = Number(amountSats) || 0
	const approxUsd = btcPrice > 0 ? (satsNumber / 1e8) * btcPrice : 0
	const availableUsd = btcPrice > 0 ? (availableSats / 1e8) * btcPrice : 0

	return (
		<View style={{ backgroundColor: SATS_COLOR + '18', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 2, borderColor: SATS_COLOR }}>

			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Redimir satoshis</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
					<FontAwesome6 name="bolt" size={12} color={SATS_COLOR} iconStyle="solid" />
					<Text style={[textStyles.h7, { color: SATS_COLOR, fontWeight: '600' }]}>
						{availableSats.toLocaleString()} disponibles
					</Text>
					{availableUsd > 0 && (
						<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>≈ ${availableUsd.toFixed(2)}</Text>
					)}
				</View>
			</View>

			<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<View style={{ flex: 1 }}>
					<TextInput
						value={String(amountSats ?? '')}
						onChangeText={onChangeAmountSats}
						placeholder="0"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="number-pad"
						editable={!locked}
						style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
					/>
				</View>
				{!locked && (
					<Pressable
						onPress={() => onChangeAmountSats(String(availableSats))}
						style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: SATS_COLOR + '30' }}
					>
						<Text style={[textStyles.h7, { color: SATS_COLOR, fontWeight: '600' }]}>MAX</Text>
					</Pressable>
				)}
			</View>

			<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]}>
				{locked
					? `Monto fijado por la factura ⚡ ${satsNumber.toLocaleString()} sats`
					: satsNumber > 0 && approxUsd > 0
						? `≈ $${approxUsd.toFixed(2)} USD · sin comisión`
						: `Mínimo ${minSats.toLocaleString()} sats · sin comisión`}
			</Text>
		</View>
	)
}

export default WithdrawSatsCard
