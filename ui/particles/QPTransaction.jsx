import React from 'react'
import { StyleSheet, View, Text } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// Imagecomponents
import FastImage from "@d11/react-native-fast-image"

// QPTransaction component
const QPTransaction = ({ transaction, navigation }) => {

    const { uuid, amount, description, owner, paid_by, updated_at, status } = transaction

    // Contexts
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)
    const textStyles = createTextStyles(theme)

    return (
        <View style={containerStyles.box}>
            <Text style={textStyles.h4}>{transaction.description}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    
})

export default QPTransaction