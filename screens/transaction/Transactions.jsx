import { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Contexts
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Routes
import { ROUTES } from '../../routes'

const Transactions = ({ navigation }) => {

    // States
    const [transactions, setTransactions] = useState([])

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Render
    return (
        <View>
            <Text>Transactions</Text>
        </View>
    )
}

const styles = StyleSheet.create({

})

export default Transactions