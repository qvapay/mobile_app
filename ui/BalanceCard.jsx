import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

const BalanceCard = ({ navigation, balance }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)

    // State
    const [showBalance, setShowBalance] = useState(false)

    // Functions
    const toggleShowBalance = () => {
        setShowBalance(!showBalance)
    }

    return (
        <View style={[styles.amountContainer, { alignItems: 'center', justifyContent: 'center', alignContent: 'center' }]}>
            <Text style={[textStyles.h1, { color: theme.colors.secondaryText, marginRight: 8 }]}>
                $
            </Text>
            <Text style={[textStyles.amount, { color: theme.colors.primaryText }]}>
                {balance}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
        height: 120,
    },
})

export default BalanceCard