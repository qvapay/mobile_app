import { View, Text, StyleSheet } from 'react-native'

/**
 * Hero balance figure: "$" symbol plus the amount in the theme's black weight.
 * Savings balances can go negative (admin-managed debts): the sign renders
 * BEFORE the symbol ("-$12.50") and the whole figure switches to the danger color.
 *
 * @param {object} props
 * @param {string} props.formattedAmount - Pre-formatted amount; may start with "-".
 * @param {number} props.fontSize - Digit size (the symbol stays at xxxl).
 * @param {object} props.theme - Theme object passed in explicitly (no context read).
 */
const QPBalance = ({ formattedAmount, fontSize, theme }) => {
    const isNegative = String(formattedAmount).startsWith('-')
    const displayAmount = isNegative ? String(formattedAmount).slice(1) : formattedAmount
    return (
        <View style={[styles.amountContainer, { alignItems: 'center', justifyContent: 'center', alignContent: 'center' }]}>
            <Text style={[styles.currencySymbol, { color: isNegative ? theme.colors.danger : theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.semiBold }]}>{isNegative ? '-$' : '$'}</Text>
            <Text style={[styles.amountText, { fontSize: fontSize, color: isNegative ? theme.colors.danger : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.black }]} accessibilityRole="text" accessibilityLabel={`Amount: ${isNegative ? '-' : ''}$${displayAmount}`}>
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
    },
})

export default QPBalance
