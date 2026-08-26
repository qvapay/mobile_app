import { View, Text, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'

// Theme type (theme llega como prop explícita, sin leer el contexto)
import type { Theme } from '../../theme/ThemeContext'

type QPBalanceProps = {
	formattedAmount: string | number
	fontSize: number
	theme: Theme
	style?: StyleProp<ViewStyle>
}

/**
 * Hero balance figure: "$" symbol plus the amount in the theme's black weight.
 * Savings balances can go negative (admin-managed debts): the sign renders
 * BEFORE the symbol ("-$12.50") and the whole figure switches to the danger color.
 *
 * @param props
 * @param props.formattedAmount - Pre-formatted amount; may start with "-".
 * @param props.fontSize - Digit size (the symbol stays at xxxl).
 * @param props.theme - Theme object passed in explicitly (no context read).
 * @param [props.style] - Container style override (e.g. height/margins outside the keypad).
 */
const QPBalance = ({ formattedAmount, fontSize, theme, style }: QPBalanceProps) => {
    const isNegative = String(formattedAmount).startsWith('-')
    const displayAmount = isNegative ? String(formattedAmount).slice(1) : formattedAmount
    return (
        <View style={[styles.amountContainer, { alignItems: 'center', justifyContent: 'center', alignContent: 'center' }, style]}>
            <Text style={[styles.currencySymbol, { color: isNegative ? theme.colors.danger : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold }]}>{isNegative ? '-$' : '$'}</Text>
            {/* Red de seguridad de ancho: si aún con el shrink por longitud del
                caller el número no cabe (pantallas estrechas), se auto-escala */}
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
                style={[styles.amountText, { fontSize: fontSize, color: isNegative ? theme.colors.danger : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.black }]}
                accessibilityRole="text"
                accessibilityLabel={`Amount: ${isNegative ? '-' : ''}$${displayAmount}`}>
                {displayAmount}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        height: 100,
    },
    currencySymbol: {
        marginRight: 8,
    },
    amountText: {
        textAlign: 'center',
        flexShrink: 1,
    },
})

export default QPBalance
