import { View, Text, TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPAssetPill from '../../ui/particles/QPAssetPill'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { sanitizeAmountInput } from '../../helpers/amountInput'

import type { Coin, Decimal } from '../../types/domain'
import type { Theme } from '../../theme/ThemeContext'
import type { TextStyles } from '../../theme/themeUtils'

const formatBalance = (val?: Decimal | null) => {
	if (!val) return '0.00'
	// Decimal = string | number; parseFloat solo acepta string (el number llega
	// coaccionado en runtime, igual que antes de tipar)
	return parseFloat(val as string).toFixed(2)
}

type WithdrawAmountCardProps = {
	amountQUSD: string
	amountCoin: string
	onChangeQUSD: (value: string) => void
	onChangeAmountCoin: (value: string) => void
	selectedCoin: Coin | null
	balance?: Decimal | null
	currency: string
	onOpenCoinPicker: () => void
	locked?: boolean
	lockedCaption?: string
	theme: Theme
	textStyles: TextStyles
}

// The QUSD ⇄ coin swap card: amount to withdraw, amount to receive, and coin selector.
// `locked` freezes both inputs (e.g. a scanned BOLT11 invoice fixes the amount) and
// `lockedCaption` explains why below the card.
const WithdrawAmountCard = ({ amountQUSD, amountCoin, onChangeQUSD, onChangeAmountCoin, selectedCoin, balance, currency, onOpenCoinPicker, locked, lockedCaption, theme, textStyles }: WithdrawAmountCardProps) => {
	const { t } = useTranslation()
	return (
	<View style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 2, borderColor: theme.colors.primary }}>

		{/* QUSD amount input */}
		<View style={{ paddingVertical: 2 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>{t('withdraw.amountCard.withdraw')}</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
					<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>{t('withdraw.amountCard.balance')}</Text>
					<Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
						{formatBalance(balance)} {currency}
					</Text>
				</View>
			</View>

			<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<View style={{ flex: 1 }}>
					<TextInput
						value={amountQUSD}
						onChangeText={(v) => onChangeQUSD(sanitizeAmountInput(v))}
						placeholder="0.00"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="numeric"
						editable={!locked}
						style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
					/>
				</View>
				<QPAssetPill icon={{ kind: 'wallet', logoTick: 'qusd', networkTick: null }} symbol="QUSD" />
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
			<Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>{t('withdraw.amountCard.receive')}</Text>
			<View style={{ borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
				<View style={{ flex: 1 }}>
					<TextInput
						value={amountCoin}
						onChangeText={(v) => onChangeAmountCoin(sanitizeAmountInput(v, 8))}
						placeholder="0.00"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="numeric"
						style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0 }]}
						editable={!!selectedCoin && !locked}
					/>
				</View>
				<QPAssetPill
					icon={selectedCoin ? { kind: 'wallet', logoTick: selectedCoin.logo, networkTick: selectedCoin.network ?? null } : null}
					symbol={selectedCoin?.tick}
					placeholder={t('withdraw.amountCard.coinPlaceholder')}
					onPress={onOpenCoinPicker}
				/>
			</View>
		</View>

		{/* Locked amount explainer (e.g. invoice-fixed amounts) */}
		{locked && !!lockedCaption && (
			<Text style={[textStyles.caption, { color: theme.colors.tertiaryText, paddingBottom: 6 }]}>{lockedCaption}</Text>
		)}
	</View>
	)
}

export default WithdrawAmountCard
