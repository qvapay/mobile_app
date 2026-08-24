import { View, Text, StyleSheet, Button } from 'react-native'
import { useTranslation } from 'react-i18next'

// Routes
import { ROUTES } from '../../routes'

/**
 * Placeholder for the 2FA-recovery flow — not implemented yet.
 * Currently only renders a stub with a button back to Login; the backend
 * endpoint (`POST /auth/reset-2fa`) is not wired up from mobile.
 */
const Recover2FAScreen = ({ navigation }) => {

    const { t } = useTranslation()

    return (
        <View style={styles.container}>
            <Text>{t('auth.recover2fa.title')}</Text>

            <Button title={t('auth.recover2fa.goToLogin')} onPress={() => navigation.navigate(ROUTES.LOGIN_SCREEN)} />
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