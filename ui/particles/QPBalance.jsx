import { View, Text, StyleSheet, Animated } from 'react-native'

const QPBalance = ({ formattedAmount, fontSize, theme }) => {
    return (
        <View style={[styles.amountContainer, { alignItems: 'center', justifyContent: 'center', alignContent: 'center' }]}>
            <Text style={[styles.currencySymbol, { color: theme.colors.secondaryText }]}>$</Text>
            <Animated.Text style={[styles.amountText, { fontSize: fontSize, color: theme.colors.primaryText }]} accessibilityRole="text" accessibilityLabel={`Amount: $${formattedAmount}`}>
                {formattedAmount}
            </Animated.Text>
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
        fontSize: 30,
        fontFamily: 'Rubik-ExtraBold',
        marginRight: 8,
    },
    amountText: {
        fontFamily: 'Rubik-Black',
        textAlign: 'center',
    },
})

export default QPBalance