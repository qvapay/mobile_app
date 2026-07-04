import { View, Text, StyleSheet } from 'react-native'

// Los balances de ahorro pueden ser negativos (deudas gestionadas desde admin):
// el signo va ANTES del símbolo ("-$12.50") y todo el monto se pinta en danger.
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
