import { forwardRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../../theme/themeUtils'

// UI
import QPFitText from '../../../../../ui/particles/QPFitText'
import QPPressable from '../../../../../ui/particles/QPPressable'
import SwapTokenBadge from './SwapTokenBadge'
import type { SwapTokenIcon } from './SwapTokenBadge'

export type SwapChip = { key: string, label: string, onPress: () => void }

type Props = {
	/** "Pagas" / "Recibes". */
	label: string
	/** Texto a la derecha de la etiqueta cuando no hay chips ("A tu wallet · Stacks"). */
	hint?: string
	token: { symbol: string, caption: string, icon: SwapTokenIcon, onPress?: () => void }
	/** Editable (lado que paga) o calculado (lado que recibe). */
	amount: string
	onChangeAmount?: (text: string) => void
	placeholder?: string
	fiatLabel: string
	balanceLabel: string
	chips?: SwapChip[]
	disabled?: boolean
	accessibilityLabel?: string
}

/**
 * Tarjeta de un lado del swap (patrón Uniswap/Jupiter): etiqueta y chips arriba, importe
 * grande a la izquierda con la píldora del activo a la derecha, equivalente en USD y saldo
 * abajo. El lado que recibe no es editable: su importe sale del modelo.
 */
const SwapAmountCard = forwardRef<TextInput, Props>(({ label, hint, token, amount, onChangeAmount, placeholder = '0', fiatLabel, balanceLabel, chips, disabled, accessibilityLabel }, ref) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const editable = !!onChangeAmount
	const amountStyle = { color: amount ? theme.colors.primaryText : theme.colors.placeholder, fontFamily: theme.typography.fontFamily.semiBold, fontSize: 34 }

	const pill = (
		<View style={[styles.pill, { backgroundColor: theme.colors.background }]}>
			<SwapTokenBadge icon={token.icon} size={26} ringColor={theme.colors.background} />
			<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{token.symbol}</Text>
			{!!token.onPress && <FontAwesome6 name="chevron-down" size={11} color={theme.colors.secondaryText} iconStyle="solid" />}
		</View>
	)

	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<View style={styles.top}>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{label}</Text>
				{chips?.length ? (
					<View style={styles.chips}>
						{chips.map(chip => (
							<Pressable key={chip.key} onPress={chip.onPress} disabled={disabled} hitSlop={6} style={[styles.chip, { backgroundColor: theme.colors.primary + '18' }]} accessibilityRole="button">
								<Text style={{ color: theme.colors.primary, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{chip.label}</Text>
							</Pressable>
						))}
					</View>
				) : !!hint && <Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{hint}</Text>}
			</View>

			<View style={styles.middle}>
				{editable ? (
					<TextInput
						ref={ref}
						style={[styles.input, amountStyle]}
						value={amount}
						onChangeText={onChangeAmount}
						placeholder={placeholder}
						placeholderTextColor={theme.colors.placeholder}
						keyboardType="decimal-pad"
						editable={!disabled}
						maxLength={12}
						accessibilityLabel={accessibilityLabel ?? label}
					/>
				) : (
					<View style={styles.input}>
						<QPFitText style={amountStyle}>{amount || placeholder}</QPFitText>
					</View>
				)}
				{token.onPress
					? <QPPressable onPress={token.onPress} accessibilityRole="button" accessibilityLabel={token.symbol}>{pill}</QPPressable>
					: pill}
			</View>

			<View style={styles.bottom}>
				<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>{fiatLabel}</Text>
				<Text style={[textStyles.h6, styles.balance, { color: theme.colors.secondaryText }]} numberOfLines={1}>{token.caption} · {balanceLabel}</Text>
			</View>
		</View>
	)
})

const styles = StyleSheet.create({
	card: { borderRadius: 20, borderCurve: 'continuous', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 6 },
	top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
	chips: { flexDirection: 'row', gap: 6 },
	chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
	middle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
	input: { flex: 1, paddingVertical: 0, justifyContent: 'center' },
	pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 5, paddingRight: 11, paddingVertical: 5, borderRadius: 20 },
	bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	balance: { flexShrink: 1, textAlign: 'right' },
})

export default SwapAmountCard
