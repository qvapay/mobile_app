import { useMemo } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'

// Theme Context
import { useTheme } from '../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI
import QPButton from './particles/QPButton'

const ActionButtons = () => {

    // Theme variables, dark and light modes with memoized styles
    const { theme } = useTheme()

    return (
        <View style={styles.container}>
            <View style={styles.InOutButtons}>
                <QPButton
                    title="Depositar"
                    icon="plus"
                    style={[
                        styles.actionButton,
                        styles.receiveButton,
                        { backgroundColor: theme.colors.elevation }
                    ]}
                    iconStyle="solid"
                />

                <View style={styles.actionButtonSpacer} />

                <QPButton
                    title={'Extraer'}
                    icon="turn-up"
                    style={[
                        styles.actionButton,
                        styles.sendButton,
                        { backgroundColor: theme.colors.elevation }
                    ]}
                    iconStyle="solid"
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    InOutButtons: {
        flexDirection: 'row',
        paddingBottom: 20,
    },
    amountSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        height: 100,
    },
    currencySymbol: {
        fontSize: 30,
        fontFamily: 'Rubik-ExtraBold',
        marginRight: 8,
    },
    amountText: {
        fontFamily: 'Rubik-Black',
        textAlign: 'center',
    },
    balanceContainer: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 3,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    balanceText: {
        fontSize: 14,
        fontFamily: 'Rubik-Medium',
    },
    keypadSection: {
        paddingHorizontal: 5,
        marginBottom: 20,
    },
    keypadRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    keyButton: {
        flex: 1,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8,
        borderRadius: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    keyButtonPressed: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        transform: [{ scale: 0.95 }],
    },
    keyText: {
        fontSize: 24,
        fontFamily: 'Rubik-Medium',
    },
    icon: {
        marginHorizontal: 2,
    },
    actionSection: {
        flexDirection: 'row',
        paddingHorizontal: 5,
        paddingBottom: 20,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        minHeight: 56,
    },
    receiveButton: {
        borderTopLeftRadius: 12,
        borderBottomLeftRadius: 12,
    },
    sendButton: {
        borderTopRightRadius: 12,
        borderBottomRightRadius: 12,
    },
    actionButtonDisabled: {
        opacity: 0.6,
    },
    actionButtonSpacer: {
        width: 12,
    },
    actionButtonText: {
        fontSize: 16,
        fontFamily: 'Rubik-SemiBold',
        marginLeft: 8,
    },
    actionIcon: {
        marginRight: 4,
    },
    gray: {
        color: '#7f8c8d',
        fontSize: 14,
        fontFamily: "Rubik-Light",
    },
    actionButton1: {
        flex: 1,
        marginVertical: 10,
        paddingVertical: 10,
        alignItems: 'center',
        flexDirection: 'row',
        borderTopLeftRadius: 10,
        justifyContent: 'center',
        borderBottomLeftRadius: 10
    },
    actionButton2: {
        flex: 1,
        marginVertical: 10,
        paddingVertical: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10
    },
    actionButtonLabel: {
        fontSize: 16,
        color: 'white',
        textAlign: 'center',
        fontFamily: "Rubik-Bold",
    }
})

export default ActionButtons