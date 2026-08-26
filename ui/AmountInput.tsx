import { View, Text, TextInput, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import QPPressable from './particles/QPPressable'
import { sanitizeAmountInput } from '../helpers/amountInput'

// Tipos de dominio
import type { Decimal } from '../types/domain'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// UI Particles
import QPCoin from './particles/QPCoin'

// Format balance for display
const formatBalance = (val?: Decimal) => {
	if (!val) return '0.00'
	return parseFloat(val as string).toFixed(2)
}

type AmountInputProps = {
	amount: string
	onAmountChange: (amount: string) => void
	balance: Decimal
	placeholder?: string
	style?: StyleProp<ViewStyle>
}

/**
 * QUSD amount entry card: numeric input with balance readout plus a 3x2 grid of
 * quick-amount badges ($25–$150). Used by the Send and Add (deposit) flows.
 * Controlled component — quick badges call `onAmountChange` with the amount as a
 * string, so selection highlighting compares against the string value.
 *
 * @param props
 * @param props.amount - Current amount (string, as typed).
 * @param props.onAmountChange - Change handler for both typing and badge taps.
 * @param props.balance - User's QUSD balance, shown formatted to 2 decimals.
 * @param props.placeholder - Label above the input. Default 'Enter Amount'.
 */
const AmountInput = ({
	amount,
	onAmountChange,
	balance,
	placeholder = 'Enter Amount',
	style = {}
}: AmountInputProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	// Common amounts for quick selection
	const commonAmounts = [25, 50, 75, 100, 125, 150]

	// Handle amount selection from badges
	const handleAmountSelect = (selectedAmount: number) => { onAmountChange(selectedAmount.toString()) }

	return (
		<View style={[{ marginVertical: 10 }, style]}>

			{/* Main Amount Input Container */}
			<View style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, borderWidth: 2, borderColor: theme.colors.primary }}>

				{/* Amount Input Row */}
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
					<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>
						{placeholder}:
					</Text>
					<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
						<Text style={[textStyles.h7, { color: theme.colors.tertiaryText }]}>
							{t('ui.amountInput.balanceLabel')}
						</Text>
						<Text style={[textStyles.h7, { color: theme.colors.primary, fontWeight: '600' }]}>
							${formatBalance(balance)} QUSD
						</Text>
					</View>
				</View>

				<View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
					<TextInput
						value={amount}
						onChangeText={(v) => onAmountChange(sanitizeAmountInput(v))}
						placeholder="0.00"
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="numeric"
						style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold, padding: 0, margin: 0, }]}
					/>
					<View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<QPCoin coin="qusd" size={20} />
							<Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
						</View>
					</View>
				</View>

			</View>

			{/* Common Amount Badges - 3x2 Grid */}
			<View style={{ marginTop: 8, gap: 8 }}>
				{/* First Row */}
				<View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
					{commonAmounts.slice(0, 3).map((commonAmount) => (
						<QPPressable
							key={commonAmount}
							onPress={() => handleAmountSelect(commonAmount)}
							style={{
								flex: 1,
								backgroundColor: amount === commonAmount.toString()
									? theme.colors.primary
									: theme.colors.elevation,
								paddingVertical: 12,
								borderRadius: 12,
								borderCurve: 'continuous',
								borderWidth: 1,
								borderColor: amount === commonAmount.toString()
									? theme.colors.primary
									: theme.colors.border,
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Text style={[textStyles.h6, { color: amount === commonAmount.toString() ? theme.colors.buttonText : theme.colors.primaryText, fontWeight: '600' }]}>
								${commonAmount}.00
							</Text>
						</QPPressable>
					))}
				</View>

				{/* Second Row */}
				<View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
					{commonAmounts.slice(3, 6).map((commonAmount) => (
						<QPPressable
							key={commonAmount}
							onPress={() => handleAmountSelect(commonAmount)}
							style={{
								flex: 1,
								backgroundColor: amount === commonAmount.toString()
									? theme.colors.primary
									: theme.colors.elevation,
								paddingVertical: 12,
								borderRadius: 12,
								borderCurve: 'continuous',
								borderWidth: 1,
								borderColor: amount === commonAmount.toString()
									? theme.colors.primary
									: theme.colors.border,
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Text style={[textStyles.h6, { color: amount === commonAmount.toString() ? theme.colors.buttonText : theme.colors.primaryText, fontWeight: '600' }]}>
								${commonAmount}.00
							</Text>
						</QPPressable>
					))}
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	currencyButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 12,
		borderCurve: 'continuous',
		borderWidth: 0.5
	},
})

export default AmountInput
