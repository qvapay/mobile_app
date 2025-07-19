import React from 'react'
import { StyleSheet, View } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"

// QPTransaction component
const QPTransaction = ({ transaction, navigation }) => {

    const { uuid, amount, description, owner, paid_by, updated_at, status } = transaction

    // Contexts
    const { theme } = useTheme()

    return (
        <View style={styles.container}>
            <Text>{transaction.description}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        
    }
})

export default QPTransaction