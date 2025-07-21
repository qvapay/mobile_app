import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
    StyleSheet,
    Text,
    View,
    Pressable,
    Alert,
    Animated,
    AccessibilityInfo,
    Vibration,
    Platform
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Context and Theme
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI Particles
import QPButton from '../../ui/particles/QPButton'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Constants
const MAX_AMOUNT_LENGTH = 5
const MAX_DECIMAL_PLACES = 2
const MIN_FONT_SIZE = 40
const MAX_FONT_SIZE = 80
const FONT_SIZE_DECREASE_FACTOR = 4
const ANIMATION_DURATION = 150
const VIBRATION_DURATION = 50

export default function Keypad({ navigation }) {

    // Contexts
    const { user } = useAuth()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()

    // State
    const [amount, setAmount] = useState('0')
    const [isProcessing, setIsProcessing] = useState(false)

    // Refs
    const fontSize = useRef(new Animated.Value(MAX_FONT_SIZE)).current
    const hapticFeedbackEnabled = useRef(true)

    // Memoized values
    const textStyles = useMemo(() => createTextStyles(theme), [theme])
    const containerStyles = useMemo(() => createContainerStyles(theme), [theme])

    // Keypad layout
    const keys = useMemo(() => [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['.', '0', 'backspace'],
    ], [])

    // Haptic feedback
    const triggerHapticFeedback = useCallback(() => {
        if (hapticFeedbackEnabled.current && Platform.OS === 'ios') {
            Vibration.vibrate(VIBRATION_DURATION)
        }
    }, [])

    // Calculate font size based on amount length
    const calculateFontSize = useCallback((currentAmount) => {
        const baseSize = MAX_FONT_SIZE
        const decreaseFactor = FONT_SIZE_DECREASE_FACTOR
        // Count only numeric characters for font size calculation
        const numericLength = currentAmount.replace('.', '').length
        const newSize = baseSize - ((numericLength - 1) * decreaseFactor)
        return Math.max(newSize, MIN_FONT_SIZE)
    }, [])

    // Animate font size change
    const animateFontSize = useCallback((newSize) => {
        Animated.timing(fontSize, {
            toValue: newSize,
            duration: ANIMATION_DURATION,
            useNativeDriver: false,
        }).start()
    }, [fontSize])

    // Validate amount input
    const validateAmount = useCallback((newAmount, key) => {

        // Prevent leading zeros (except for decimal numbers)
        if (newAmount === '0' && key !== '.' && key !== 'backspace') {
            return false
        }

        // Check decimal places - only for numeric keys, not for decimal point itself
        if (key !== '.' && key !== 'backspace' && newAmount.includes('.')) {
            const [, decimalPart] = newAmount.split('.')
            if (decimalPart && decimalPart.length >= MAX_DECIMAL_PLACES) {
                return false
            }
        }

        // Check total length - exclude decimal point from length calculation for validation
        const lengthToCheck = newAmount.replace('.', '').length
        if (lengthToCheck > MAX_AMOUNT_LENGTH) {
            return false
        }

        return true
    }, [])

    // Handle key press
    const handleKeyPress = useCallback((key) => {

        triggerHapticFeedback()

        let newAmount = amount

        if (key === 'backspace') {
            newAmount = amount.slice(0, -1) || '0'
        } else if (key === '.') {
            // Prevent multiple decimal points
            if (amount.includes('.')) { return }
            newAmount = amount === '0' ? '0.' : amount + '.'
            // For decimal, we don't need to validate length since we're just adding a decimal point
            setAmount(newAmount)
            const newFontSize = calculateFontSize(newAmount)
            animateFontSize(newFontSize)

            // Announce to screen reader
            AccessibilityInfo.announceForAccessibility(`Amount: $${newAmount}`)

            return
        } else {
            // Handle numeric keys
            if (amount === '0') {
                newAmount = key
            } else {
                newAmount = amount + key
            }
        }

        // Validate the new amount
        if (!validateAmount(newAmount, key)) {
            return
        }

        // Update amount and animate font size
        setAmount(newAmount)
        const newFontSize = calculateFontSize(newAmount)
        animateFontSize(newFontSize)

        // Announce to screen reader
        AccessibilityInfo.announceForAccessibility(`Amount: $${newAmount}`)

    }, [amount, validateAmount, calculateFontSize, animateFontSize, triggerHapticFeedback])

    // Set maximum balance
    const setMaxBalance = useCallback(() => {

        if (!user?.balance) return
        const maxAmount = user.balance.toString()
        setAmount(maxAmount)
        const newFontSize = calculateFontSize(maxAmount)
        animateFontSize(newFontSize)
        triggerHapticFeedback()

        // Announce to screen reader
        AccessibilityInfo.announceForAccessibility(`Set to maximum balance: $${maxAmount}`)

    }, [user?.balance, calculateFontSize, animateFontSize, triggerHapticFeedback])

    // Send amount
    const handleSendAmount = useCallback(async () => {

        if (isProcessing) return
        const numericAmount = parseFloat(amount)

        if (numericAmount <= 0) {
            Alert.alert('Monto inválido', 'El monto debe ser mayor a 0', [{ text: 'OK', style: 'default' }])
            return
        }

        if (user?.balance && numericAmount > user.balance) {
            Alert.alert('Saldo insuficiente', 'El monto no puede exceder tu saldo disponible', [{ text: 'OK', style: 'default' }])
            return
        }

        setIsProcessing(true)

        try {
            // Temporary modify this to SendSuccessScreen
            navigation.navigate(ROUTES.SEND_SCREEN, { amount: numericAmount.toString() })
            // navigation.navigate(ROUTES.SEND_SUCCESS_SCREEN)
        } catch (error) {
            Alert.alert('Error', 'Error al procesar la solicitud de envío')
        } finally { setIsProcessing(false) }

    }, [amount, user?.balance, isProcessing, navigation])

    // Receive amount
    const handleReceiveAmount = useCallback(() => {
        const numericAmount = parseFloat(amount)
        navigation.navigate(ROUTES.PROFILE_SCREEN, { amount: numericAmount.toString() })
    }, [amount, navigation])

    // Render individual key
    const renderKey = useCallback((key, index) => {

        const isBackspace = key === 'backspace'
        const accessibilityLabel = isBackspace ? 'Delete last digit' : `Number ${key}`

        return (
            <Pressable
                key={index}
                style={({ pressed }) => [styles.keyButton, pressed && styles.keyButtonPressed]}
                onPress={() => handleKeyPress(key)}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={isBackspace ? "Removes the last entered digit" : "Adds this number to the amount"}
                disabled={isProcessing}
            >
                {isBackspace ? (
                    <FontAwesome6
                        name="delete-left"
                        size={20}
                        color={theme.colors.primaryText}
                        style={styles.icon}
                        iconStyle="solid"
                    />
                ) : (
                    <Text style={[styles.keyText, { color: theme.colors.primaryText }]}>
                        {key}
                    </Text>
                )}
            </Pressable>
        )
    }, [handleKeyPress, isProcessing, theme.colors.primaryText])

    // Format amount for display
    const formattedAmount = useMemo(() => {
        const numericAmount = parseFloat(amount)
        return isNaN(numericAmount) ? '0' : amount
    }, [amount])

    return (
        <View style={[containerStyles.container, styles.container, { paddingBottom: insets.bottom }]}>
            {/* Amount Display Section */}
            <View style={styles.amountSection}>

                <View style={[styles.amountContainer, { alignItems: 'center', justifyContent: 'center', alignContent: 'center' }]}>
                    <Text style={[styles.currencySymbol, { color: theme.colors.secondaryText }]}>
                        $
                    </Text>
                    <Animated.Text
                        style={[styles.amountText, { fontSize: fontSize, color: theme.colors.primaryText }]}
                        accessibilityRole="text"
                        accessibilityLabel={`Amount: $${formattedAmount}`}
                    >
                        {formattedAmount}
                    </Animated.Text>
                </View>

                {/* Balance Display */}
                <Pressable
                    style={[styles.balanceContainer, { backgroundColor: theme.colors.elevation }]}
                    onPress={setMaxBalance}
                    accessibilityRole="button"
                    accessibilityLabel={`Current balance: $${user?.balance || 0}`}
                    accessibilityHint="Double tap to set amount to maximum balance"
                >
                    <Text style={[styles.balanceText, { color: theme.colors.primaryText }]}>
                        ${user?.balance || 0}
                    </Text>
                </Pressable>
            </View>

            {/* Keypad Section */}
            <View style={styles.keypadSection}>
                {keys.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.keypadRow}>
                        {row.map((key, keyIndex) => renderKey(key, keyIndex))}
                    </View>
                ))}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionSection}>
                <QPButton
                    title="Recibir"
                    onPress={handleReceiveAmount}
                    disabled={isProcessing}
                    icon="arrow-down"
                    style={[
                        styles.actionButton,
                        styles.receiveButton,
                        { backgroundColor: theme.colors.elevation },
                        isProcessing && styles.actionButtonDisabled
                    ]}
                />

                <View style={styles.actionButtonSpacer} />

                <QPButton
                    title={isProcessing ? 'Procesando...' : 'Enviar'}
                    onPress={handleSendAmount}
                    disabled={isProcessing}
                    icon="arrow-up"
                    style={[
                        styles.actionButton,
                        styles.sendButton,
                        { backgroundColor: theme.colors.primary },
                        isProcessing && styles.actionButtonDisabled
                    ]}
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
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
})