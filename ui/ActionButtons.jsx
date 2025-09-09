import { useMemo } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI
import QPButton from './particles/QPButton'

// Routes
import { ROUTES } from '../routes'

const ActionButtons = ({ navigation }) => {

    // Theme variables, dark and light modes with memoized styles
    const { theme } = useTheme()

    return (
        <View>
            <View style={styles.InOutButtons}>
                <QPButton
                    title="Depositar"
                    icon="plus"
                    style={[styles.actionButton, { backgroundColor: theme.colors.elevation, color: theme.colors.primaryText }]}
                    iconStyle="solid"
                    onPress={() => navigation.navigate(ROUTES.ADD)}
                    textStyle={{ color: theme.colors.primaryText }}
                />

                <View style={styles.actionButtonSpacer} />

                <QPButton
                    title={'Extraer'}
                    icon="turn-up"
                    style={[styles.actionButton, { backgroundColor: theme.colors.elevation, color: theme.colors.primaryText }]}
                    iconStyle="solid"
                    onPress={() => navigation.navigate(ROUTES.WITHDRAW)}
                    textStyle={{ color: theme.colors.primaryText }}
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    InOutButtons: {
        flexDirection: 'row',
        paddingBottom: 10,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        minHeight: 56,
    },
    actionButtonSpacer: {
        width: 10,
    },
})

export default ActionButtons