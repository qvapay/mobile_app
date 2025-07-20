import React from 'react'
import { View, Text } from 'react-native'

// Context and Theme
import { useAuth } from '../../auth/authContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'
import QPAvatar from '../../ui/particles/QPAvatar'
import QPInput from '../../ui/particles/QPInput'

// Routes
import { ROUTES } from '../../routes'

const SendScreen = ({ navigation, route }) => {

    // Context
    const { user } = useAuth()
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Variables
    const { amount } = route.params

    // Render
    return (
        <View style={[containerStyles.subContainer]}>
            <Text style={textStyles.title}>Send</Text>
            <Text style={textStyles.subtitle}>{amount}</Text>

            
        </View>
    )
}

export default SendScreen