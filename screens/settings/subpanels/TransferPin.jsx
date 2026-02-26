import { useState, useRef } from 'react'
import { StyleSheet, Text, View, TextInput, Alert } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPButton from '../../../ui/particles/QPButton'
import QPKeyboardView from '../../../ui/QPKeyboardView'

// API
import { userApi } from '../../../api/userApi'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Notifications
import Toast from 'react-native-toast-message'

// Auth
import { useAuth } from '../../../auth/AuthContext'

// TransferPin Screen
const TransferPin = () => {

    // Contexts
    const { theme } = useTheme()
    const { user } = useAuth()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // View mode: 'info' | 'change'
    const [mode, setMode] = useState('info')

    // PIN states
    const [currentPin, setCurrentPin] = useState('')
    const [newPin, setNewPin] = useState('')
    const [confirmPin, setConfirmPin] = useState('')

    // Loading states
    const [isLoading, setIsLoading] = useState(false)
    const [isSendingPin, setIsSendingPin] = useState(false)

    // PIN input refs
    const currentPinRefs = useRef([])
    const newPinRefs = useRef([])
    const confirmPinRefs = useRef([])

    // Focus states
    const [focusedField, setFocusedField] = useState(null)
    const [focusedIndex, setFocusedIndex] = useState(null)

    // User has PIN (pin field is 0 if no PIN set)
    const hasPin = user?.pin !== 0 && user?.pin !== '0' && user?.pin !== undefined

    // Request new random PIN via email
    const handleRequestPin = async () => {
        Alert.alert(
            'Solicitar PIN',
            'Se enviará un nuevo PIN de 4 dígitos a tu correo electrónico. Tu PIN actual será reemplazado.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Enviar',
                    onPress: async () => {
                        try {
                            setIsSendingPin(true)
                            const result = await userApi.resetPin()
                            if (result.success) {
                                Toast.show({ type: 'success', text1: 'PIN enviado', text2: 'Revisa tu correo electrónico' })
                            } else {
                                Toast.show({ type: 'error', text1: result.error || 'No se pudo enviar el PIN' })
                            }
                        } catch (error) {
                            Toast.show({ type: 'error', text1: 'Error al solicitar el PIN' })
                        } finally {
                            setIsSendingPin(false)
                        }
                    }
                }
            ]
        )
    }

    // Change PIN
    const handleChangePin = async () => {
        if (newPin !== confirmPin) {
            Toast.show({ type: 'error', text1: 'Los PINs no coinciden' })
            return
        }

        try {
            setIsLoading(true)
            const result = await userApi.changePin({
                old_pin: currentPin,
                new_pin: newPin,
            })

            if (result.success) {
                Toast.show({ type: 'success', text1: 'PIN actualizado correctamente' })
                resetForm()
                setMode('info')
            } else {
                Toast.show({ type: 'error', text1: result.error || 'No se pudo cambiar el PIN' })
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error al cambiar el PIN' })
        } finally {
            setIsLoading(false)
        }
    }

    // Reset form
    const resetForm = () => {
        setCurrentPin('')
        setNewPin('')
        setConfirmPin('')
    }

    // Generic PIN input handler
    const handlePinInput = (text, index, pin, setPinFn, refs, nextRefs) => {
        const numericText = text.replace(/[^0-9]/g, '')
        const newPinArr = pin.split('')
        newPinArr[index] = numericText
        const updated = newPinArr.join('')
        setPinFn(updated)

        if (numericText && index < 3) {
            refs.current[index + 1]?.focus()
        } else if (numericText && index === 3 && nextRefs) {
            nextRefs.current[0]?.focus()
        }
    }

    // Generic backspace handler
    const handlePinKeyPress = (e, index, pin, setPinFn, refs) => {
        if (e.nativeEvent.key === 'Backspace') {
            if (pin[index]) {
                const newPinArr = pin.split('')
                newPinArr[index] = ''
                setPinFn(newPinArr.join(''))
            } else if (index > 0) {
                const newPinArr = pin.split('')
                newPinArr[index - 1] = ''
                setPinFn(newPinArr.join(''))
                refs.current[index - 1]?.focus()
            }
        }
    }

    // Render PIN input row
    const renderPinInputRow = (label, pin, setPinFn, refs, fieldName, nextRefs) => (
        <View style={styles.pinFieldContainer}>
            <Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>{label}</Text>
            <View style={styles.pinRow}>
                {[0, 1, 2, 3].map((index) => (
                    <TextInput
                        key={index}
                        ref={(ref) => refs.current[index] = ref}
                        style={[
                            styles.pinInput,
                            {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.primaryText,
                                borderColor: focusedField === fieldName && focusedIndex === index ? theme.colors.primary : theme.colors.surface,
                                borderWidth: 1.5,
                            }
                        ]}
                        value={pin[index] || ''}
                        onChangeText={(text) => handlePinInput(text, index, pin, setPinFn, refs, nextRefs)}
                        onKeyPress={(e) => handlePinKeyPress(e, index, pin, setPinFn, refs)}
                        onFocus={() => { setFocusedField(fieldName); setFocusedIndex(index) }}
                        onBlur={() => { setFocusedField(null); setFocusedIndex(null) }}
                        keyboardType="numeric"
                        maxLength={1}
                        secureTextEntry
                        textAlign="center"
                        selectTextOnFocus
                        placeholder={focusedField === fieldName && focusedIndex === index ? '' : '0'}
                        placeholderTextColor={theme.colors.tertiaryText}
                    />
                ))}
            </View>
        </View>
    )

    const canSubmit = currentPin.length === 4 && newPin.length === 4 && confirmPin.length === 4 && newPin === confirmPin

    // Change PIN mode
    if (mode === 'change') {
        return (
            <QPKeyboardView actions={[
                <QPButton
                    title="Cambiar PIN"
                    onPress={handleChangePin}
                    loading={isLoading}
                    disabled={!canSubmit || isLoading}
                    style={{ backgroundColor: canSubmit ? theme.colors.primary : theme.colors.secondaryText }}
                    textStyle={{ color: theme.colors.almostWhite }}
                />,
                <QPButton
                    title="Cancelar"
                    onPress={() => { resetForm(); setMode('info') }}
                    disabled={isLoading}
                    style={{ backgroundColor: theme.colors.surface }}
                    textStyle={{ color: theme.colors.primaryText }}
                />,
            ]}>

                <Text style={textStyles.h1}>Cambiar PIN</Text>
                <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                    Establece un PIN personalizado de 4 dígitos
                </Text>

                <View style={{ marginTop: 24 }}>
                    {renderPinInputRow('PIN actual', currentPin, setCurrentPin, currentPinRefs, 'current', newPinRefs)}
                    {renderPinInputRow('Nuevo PIN', newPin, setNewPin, newPinRefs, 'new', confirmPinRefs)}
                    {renderPinInputRow('Confirmar nuevo PIN', confirmPin, setConfirmPin, confirmPinRefs, 'confirm', null)}
                </View>

                {newPin.length === 4 && confirmPin.length === 4 && newPin !== confirmPin && (
                    <Text style={[textStyles.h5, { color: theme.colors.danger, textAlign: 'center', marginTop: 8 }]}>
                        Los PINs no coinciden
                    </Text>
                )}

                <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, textAlign: 'center', marginTop: 12 }]}>
                    Si no recuerdas tu PIN actual, solicita uno nuevo por correo
                </Text>

            </QPKeyboardView>
        )
    }

    // Info mode (default)
    return (
        <QPKeyboardView actions={[
            <QPButton
                title="Personalizar PIN"
                onPress={() => setMode('change')}
                icon="pen"
                iconColor={theme.colors.almostWhite}
                textStyle={{ color: theme.colors.almostWhite }}
            />,
            <QPButton
                title="Solicitar PIN por correo"
                onPress={handleRequestPin}
                loading={isSendingPin}
                disabled={isSendingPin}
                icon="envelope"
                iconColor={theme.colors.primary}
                style={{ backgroundColor: theme.colors.surface }}
                textStyle={{ color: theme.colors.primaryText }}
            />,
        ]}>

            <Text style={textStyles.h1}>PIN de seguridad</Text>
            <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
                Tu PIN protege transferencias y extracciones
            </Text>

            {/* Status icon */}
            <View style={styles.statusContainer}>
                <View style={[styles.statusIcon, { backgroundColor: theme.colors.primary + '20' }]}>
                    <FontAwesome6 name="lock" size={48} color={theme.colors.primary} iconStyle="solid" />
                </View>
                <Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 20 }]}>
                    PIN de 4 dígitos
                </Text>
                <Text style={[textStyles.h4, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 8 }]}>
                    Se solicita cada vez que realizas una transferencia o extracción
                </Text>
            </View>

            {/* Info cards */}
            <View style={[containerStyles.card, { marginTop: 20 }]}>
                <View style={styles.infoRow}>
                    <FontAwesome6 name="envelope" size={16} color={theme.colors.primary} iconStyle="solid" />
                    <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                        Puedes solicitar un PIN aleatorio que se envía a tu correo electrónico
                    </Text>
                </View>
                <View style={[styles.infoRow, { marginTop: 12 }]}>
                    <FontAwesome6 name="pen" size={16} color={theme.colors.primary} iconStyle="solid" />
                    <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                        O puedes establecer un PIN personalizado que recuerdes fácilmente
                    </Text>
                </View>
                <View style={[styles.infoRow, { marginTop: 12 }]}>
                    <FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
                    <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
                        Nunca compartas tu PIN con nadie, ni siquiera con el equipo de QvaPay
                    </Text>
                </View>
            </View>

        </QPKeyboardView>
    )
}

const styles = StyleSheet.create({
    statusContainer: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    statusIcon: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    pinFieldContainer: {
        marginBottom: 20,
    },
    pinRow: {
        flexDirection: 'row',
        gap: 8,
    },
    pinInput: {
        flex: 1,
        height: 60,
        borderRadius: 12,
        fontSize: 24,
        fontFamily: 'Rubik-Bold',
        textAlign: 'center',
    },
})

export default TransferPin
