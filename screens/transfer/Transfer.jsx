import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// User Context
import { useAuth } from '../../auth/authContext'

// Transfer component
const Transfer = ({ navigation }) => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()

    const [isLoading, setIsLoading] = useState(false)

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Text>Transfer Screen</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
    },
})

export default Transfer