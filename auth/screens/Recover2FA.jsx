import { View, Text, StyleSheet, Button } from 'react-native'

// Routes
import { ROUTES } from '../../routes'

/**
 * Placeholder for the 2FA-recovery flow — not implemented yet.
 * Currently only renders a stub with a button back to Login; the backend
 * endpoint (`POST /auth/reset-2fa`) is not wired up from mobile.
 */
const Recover2FAScreen = ({ navigation }) => {

    return (
        <View style={styles.container}>
            <Text>Recover 2FA Screen</Text>

            <Button title="Go to Login" onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
        justifyContent: 'center',
    },
})

export default Recover2FAScreen