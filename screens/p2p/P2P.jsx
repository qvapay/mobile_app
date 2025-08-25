import { View, Text, StyleSheet } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// User Context
import { useAuth } from '../../auth/AuthContext'

// P2P component
const P2P = () => {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Text>P2P Screen</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
    },
})

export default P2P