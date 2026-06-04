import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native'

import QPCoin from '../../ui/particles/QPCoin'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const formatBalance = (val) => {
	if (!val) return '0.00'
	return parseFloat(val).toFixed(2)
}

// The QUSD ⇄ coin swap card: amount to withdraw, amount to receive, and coin selector.
const WithdrawAmountCard = ({ amountQUSD, amountCoin, onChangeQUSD, onChangeAmountCoin, selectedCoin, balance, currency, onOpenCoinPicker, theme, textStyles }) => (
	<View style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 2, borderColor: theme.colors.primary }}>

		{/* QUSD amount input */}
		<View style={{ paddingVertical: 2 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Extraer</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
					<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>Balance:</Text>
					<Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
						{formatBalance(balance)} {currency}
					</Text>
				</View>
			</View>

			<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<View style={{ flex: 1 }}>
					<TextInput
						value={amountQUSD}
						onChangeText={onChangeQUSD}
						placeholder="0.00"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="numeric"
						style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
					/>
				</View>
				<View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
						<QPCoin coin="qusd" size={20} />
						<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
					</View>
				</View>
			</View>
		</View>

		{/* Divider with arrows */}
		<View style={{ alignItems: 'center', justifyContent: 'center' }}>
			<View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
				<FontAwesome6 name="up-down" size={10} color={theme.colors.primary} iconStyle="solid" />
			</View>
		</View>

		{/* Coin amount and selector */}
		<View style={{ paddingTop: 2 }}>
			<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Recibir</Text>
			<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<View style={{ flex: 1 }}>
					<TextInput
						value={amountCoin}
						onChangeText={onChangeAmountCoin}
						placeholder="0.00"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="numeric"
						style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
						editable={!!selectedCoin}
					/>
				</View>
				<Pressable style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]} onPress={onOpenCoinPicker} >
					{selectedCoin ? (
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<QPCoin coin={selectedCoin.logo} size={20} />
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
							<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
						</View>
					) : (
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Moneda</Text>
							<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
						</View>
					)}
				</Pressable>
			</View>
		</View>
	</View>
)

const styles = StyleSheet.create({
	currencyButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 0.5
	},
})

export default WithdrawAmountCard
