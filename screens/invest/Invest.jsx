import React from 'react'
import { View, Text } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Coins and Stocks component
const Invest = () => {

    // Contexts
    const { theme } = useTheme()

    return (
        <View>
            <Text>Invest Screen</Text>
        </View>
    )
}

export default Invest