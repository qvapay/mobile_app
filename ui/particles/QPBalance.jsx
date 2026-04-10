import { View, Text, StyleSheet } from 'react-native'

const QPBalance = ({ formattedAmount, fontSize, theme }) => {
    return (
        <View style={[styles.amountContainer, { alignItems: 'center', justifyContent: 'center', alignContent: 'center' }]}>
            <Text style={[styles.currencySymbol, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xxxl, fontFamily: theme.typography.fontFamily.bold }]}>$</Text>
            <Text style={[styles.amountText, { fontSize: fontSize, color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.black }]} accessibilityRole="text" accessibilityLabel={`Amount: $${formattedAmount}`}>
                {formattedAmount}
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