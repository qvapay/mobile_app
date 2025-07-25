import { useState, useEffect } from 'react'
import { Text, Pressable, StyleSheet } from 'react-native'
import AnimatedNumbers from 'react-native-animated-numbers'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'

// Settings Context
import { useSettings } from '../settings/SettingsContext'

const BalanceCard = ({ balance }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)

    // Settings context
    const { getSetting, updateSetting } = useSettings()

    // State
    const [showBalance, setShowBalance] = useState(true)
    const [animatedBalance, setAnimatedBalance] = useState(balance || 0)

    // Load balance visibility setting on component mount
    useEffect(() => {
        const balanceVisibility = getSetting('privacy', 'showBalance', true)
        setShowBalance(balanceVisibility)
    }, [getSetting])

    // useEffect with balance dependency to animate the balance
    useEffect(() => {
        if (balance !== undefined && balance !== null) {
            setAnimatedBalance(balance)
        }
    }, [balance])

    // Functions
    const toggleShowBalance = async () => {
        const newVisibility = !showBalance
        setShowBalance(newVisibility)

        // Save the setting to SettingsContext
        await updateSetting('privacy', 'showBalance', newVisibility)
    }

    // Generate asterisks based on balance length
    const getHiddenBalance = () => {
        if (!balance) return '***'
        const balanceStr = balance.toString()
        return '*'.repeat(Math.max(3, balanceStr.length))
    }

    return (
        <Pressable onPress={toggleShowBalance} style={styles.amountContainer}>
            <Text style={[textStyles.h1, { color: theme.colors.secondaryText, marginRight: 8 }]}>
                $
            </Text>
            {showBalance ? (
                <AnimatedNumbers
                    includeComma
                    animateToNumber={animatedBalance}
                    fontStyle={[textStyles.amount, { color: theme.colors.primaryText }]}
                />
            ) : (
                <Text style={[textStyles.amount, { color: theme.colors.primaryText }]}>
                    {getHiddenBalance()}
                </Text>
            )}
        </Pressable>
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