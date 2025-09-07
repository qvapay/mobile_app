import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Modal, TouchableOpacity, FlatList, Pressable } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Confirm Screen for Send instructions
// It could be a QR code or a link to the transaction
// but also could be a internal transfer
const SendConfirm = ({ navigation, route }) => {

    // Contexts
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Params from route
    const { send_amount, user_uuid = null } = route.params || {}

    console.log('SendConfirm Params:', { send_amount, user_uuid })

    return (
        <View>
            <Text>SendConfirm</Text>
            <Text>Send Amount: {send_amount}</Text>
            <Text>User UUID: {user_uuid}</Text>
        </View>
    )
}

export default SendConfirm