import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Coins and Stocks component
const Invest = () => {

    // Contexts
    const { theme } = useTheme()

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Text style={styles.title}>Invest Screen</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
    },
})

export default Invest