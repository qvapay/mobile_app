import React, { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI Particles
import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'

// User AuthContext
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import Toast from 'react-native-toast-message'

// FontAwesome6
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Common country codes with dial codes
import { countries } from '../../../labels/countries'

// Phone Component
const Phone = () => {

    // Contexts
    const { user, updateUser } = useAuth()

    // Theme variables, dark and light modes with memoized styles
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // States
    const [phone, setPhone] = useState('')
    const [country, setCountry] = useState('US')
    const [pin, setPin] = useState('')
    const [isVerifying, setIsVerifying] = useState(false)
    const [showPinInput, setShowPinInput] = useState(false)
    const [userPhoneVerified, setUserPhoneVerified] = useState(false)
    const [userPhone, setUserPhone] = useState('')
    const [showCountryPicker, setShowCountryPicker] = useState(false)
    const [countrySearch, setCountrySearch] = useState('')

    // Loading States
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(true)

    // Load user data on mount
    useEffect(() => {
        loadUserData()
    }, [])

    // Load user data from API
    const loadUserData = async () => {
        try {
            setIsLoadingData(true)
            const result = await userApi.getUserProfile()
            if (result.success && result.data) {
                setUserPhoneVerified(result.data.phone_verified || false)
                setUserPhone(result.data.phone || '')
                if (result.data.phone) {
                    // Extract country code from phone
                    const phoneWithCode = result.data.phone
                    const countryData = countries.find(c => phoneWithCode.startsWith(c.dial_code))
                    if (countryData) {
                        setCountry(countryData.code)
                        setPhone(phoneWithCode.replace(countryData.dial_code, ''))
                    }
                }
            }
        } catch (error) { console.error('Error loading user data:', error) }
        finally { setIsLoadingData(false) }
    }

    const handleSendCode = async () => {

        if (!phone.trim()) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Por favor ingresa un número de teléfono'
            })
            return
        }

        if (phone.trim().length < 7) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'El número de teléfono debe tener al menos 7 dígitos'
            })
            return
        }

        if (!country) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Por favor selecciona un país'
            })
            return
        }

        setIsLoading(true)

        try {
            const countryData = countries.find(c => c.code === country)
            const phoneNumber = `${countryData.dial_code}${phone.trim()}`

            const result = await userApi.verifyPhone({
                phone: phone.trim(),
                country: country,
                verify: false
            })

            if (result.success) {
                setShowPinInput(true)
                Toast.show({
                    type: 'success',
                    text1: 'Éxito',
                    text2: 'PIN de verificación enviado'
                })
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: result.error || 'Error al enviar el código'
                })
            }
        } catch (error) {
            console.error('Error sending code:', error)
            if (error.message.includes('Network Error')) {
                Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Error de conexión. Verifica tu conexión a internet.'
                })
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Error al enviar el código. Intenta nuevamente.'
                })
            }
        } finally { setIsLoading(false) }
    }

    const handleVerifyPhone = async () => {

        if (!pin.trim() || pin.trim().length !== 6) {
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Por favor ingresa un PIN válido de 6 dígitos'
            })
            return
        }

        setIsVerifying(true)
        try {
            const countryData = countries.find(c => c.code === country)
            const phoneNumber = `${countryData.dial_code}${phone.trim()}`

            const result = await userApi.verifyPhone({
                phone: phone.trim(),
                country: country,
                code: pin.trim(),
                verify: true
            })

            if (result.success) {
                setUserPhoneVerified(true)
                setUserPhone(phoneNumber)
                setShowPinInput(false)
                setPin('')
                setPhone('')
                Toast.show({
                    type: 'success',
                    text1: 'Éxito',
                    text2: 'Teléfono verificado correctamente'
                })
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: result.error || 'Error al verificar el teléfono'
                })
            }
        } catch (error) {
            console.error('Error verifying phone:', error)
            if (error.message.includes('Network Error')) {
                Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Error de conexión. Verifica tu conexión a internet.'
                })
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Error al verificar el teléfono. Intenta nuevamente.'
                })
            }
        } finally { setIsVerifying(false) }
    }

    // Loading state
    if (isLoadingData) { return (<QPLoader />) }

    if (userPhoneVerified) {
        return (
            <View style={containerStyles.subContainer}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={[styles.verifiedTitle, { color: theme.colors.successText }]}>
                        Teléfono Verificado
                    </Text>
                    <Text style={[styles.verifiedPhone, { color: theme.colors.successText }]}>
                        {userPhone}
                    </Text>
                </View>
                <View style={containerStyles.bottomButtonContainer}>
                    <QPButton
                        title="Cambiar Número de Teléfono"
                        // onPress={() => {
                        //     setUserPhoneVerified(false)
                        //     setUserPhone('')
                        //     setPhone('')
                        //     setPin('')
                        //     setShowPinInput(false)
                        // }}
                        style={{ borderRadius: 25 }}
                        textStyle={{ color: theme.colors.almostWhite }}
                    />
                </View>
            </View>
        )
    }

    return (
        <KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <View style={containerStyles.scrollContainer}>

                    <Text style={[textStyles.h1, { color: theme.colors.primaryText }]}>Verificar Teléfono</Text>
                    <Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>Ingresa tu número de teléfono para recibir un código de verificación</Text>

                    <View style={styles.formContainer}>
                        {/* Country Selection */}
                        <View style={styles.countryContainer}>
                            <Text style={[styles.label, { color: theme.colors.primaryText }]}>País</Text>
                            <TouchableOpacity style={[styles.countryPicker, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => setShowCountryPicker(true)} >
                                <Text style={[styles.countryText, { color: theme.colors.primaryText }]}>
                                    {countries.find(c => c.code === country)?.name} ({countries.find(c => c.code === country)?.dial_code})
                                </Text>
                                <FontAwesome6 name="chevron-down" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
                            </TouchableOpacity>
                        </View>

                        {/* Phone Input */}
                        <View style={styles.inputContainer}>
                            <Text style={[styles.label, { color: theme.colors.primaryText }]}>Número de Teléfono</Text>
                            <QPInput
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="Ingresa tu número de teléfono"
                                keyboardType="phone-pad"
                                prefixIconName="phone-volume"
                                style={styles.input}
                            />
                        </View>
                    </View>

                    <View style={containerStyles.bottomButtonContainer}>
                        {!showPinInput ? (
                            <QPButton
                                title="Enviar Código de Verificación"
                                onPress={handleSendCode}
                                loading={isLoading}
                                disabled={isLoading || !phone.trim()}
                                style={{ borderRadius: 25 }}
                                textStyle={{ color: theme.colors.buttonText }}
                            />
                        ) : (
                            <>
                                <View style={styles.inputContainer}>
                                    <Text style={[styles.label, { color: theme.colors.primaryText }]}>Código de Verificación</Text>
                                    <QPInput
                                        value={pin}
                                        onChangeText={setPin}
                                        placeholder="Ingresa el código de 6 dígitos"
                                        keyboardType="numeric"
                                        maxLength={6}
                                        prefixIconName="key"
                                        style={styles.input}
                                    />
                                </View>

                                <QPButton
                                    title="Verificar Teléfono"
                                    onPress={handleVerifyPhone}
                                    loading={isVerifying}
                                    disabled={isVerifying || !pin.trim() || pin.trim().length !== 6}
                                    style={styles.button}
                                />

                                <QPButton
                                    title="Reenviar Código"
                                    onPress={handleSendCode}
                                    loading={isLoading}
                                    disabled={isLoading}
                                    style={[styles.button, styles.secondaryButton]}
                                />
                            </>
                        )}
                    </View>

                    {/* Country Picker Modal */}
                    <Modal
                        visible={showCountryPicker}
                        transparent={true}
                        animationType="slide"
                        onRequestClose={() => {
                            setShowCountryPicker(false)
                            setCountrySearch('')
                        }}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: theme.colors.primaryText }]}>
                                        Seleccionar País
                                    </Text>
                                    <TouchableOpacity onPress={() => {
                                        setShowCountryPicker(false)
                                        setCountrySearch('')
                                    }}>
                                        <Text style={[styles.closeButton, { color: theme.colors.secondaryText }]}>✕</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Search Input */}
                                <View style={styles.searchContainer}>
                                    <QPInput
                                        value={countrySearch}
                                        onChangeText={setCountrySearch}
                                        placeholder="Buscar país..."
                                        prefixIconName="search"
                                        style={styles.searchInput}
                                    />
                                </View>

                                <ScrollView style={styles.countryList}>
                                    {countries
                                        .filter(countryData =>
                                            countryData.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                                            countryData.code.toLowerCase().includes(countrySearch.toLowerCase())
                                        )
                                        .map((countryData) => (
                                            <TouchableOpacity
                                                key={countryData.code}
                                                style={[
                                                    styles.countryItem,
                                                    {
                                                        backgroundColor: country === countryData.code
                                                            ? theme.colors.primary
                                                            : theme.colors.background
                                                    }
                                                ]}
                                                onPress={() => {
                                                    setCountry(countryData.code)
                                                    setShowCountryPicker(false)
                                                    setCountrySearch('')
                                                }}
                                            >
                                                <Text style={[
                                                    styles.countryItemText,
                                                    {
                                                        color: country === countryData.code
                                                            ? theme.colors.buttonText
                                                            : theme.colors.primaryText
                                                    }
                                                ]}>
                                                    {countryData.name} ({countryData.dial_code})
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    formContainer: {
        flex: 1,
    },
    title: {
        fontSize: 24,
        fontFamily: 'Rubik-Bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        fontFamily: 'Rubik-Regular',
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 22,
    },
    countryContainer: {
        marginTop: 20,
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontFamily: 'Rubik-Medium',
        marginBottom: 8,
    },
    countryPicker: {
        height: 50,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 15,
        justifyContent: 'space-between',
        alignItems: 'center',
        flexDirection: 'row',
    },
    countryText: {
        fontSize: 16,
        fontFamily: 'Rubik-Regular',
    },
    inputContainer: {
        marginBottom: 20,
    },
    input: {
        marginVertical: 0,
    },
    button: {
        marginBottom: 12,
    },
    secondaryButton: {
        backgroundColor: '#6c757d',
    },
    verifiedCard: {
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 40,
    },
    verifiedTitle: {
        fontSize: 20,
        fontFamily: 'Rubik-Bold',
        marginBottom: 8,
    },
    verifiedPhone: {
        fontSize: 18,
        fontFamily: 'Rubik-Medium',
    },
    dropdownIcon: {
        fontSize: 12,
        marginLeft: 10,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxHeight: '80%',
        borderRadius: 16,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#E9ECEF',
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Rubik-Bold',
    },
    closeButton: {
        fontSize: 24,
        fontFamily: 'Rubik-Bold',
    },
    countryList: {
        maxHeight: 400,
    },
    searchContainer: {
        marginBottom: 20,
    },
    searchInput: {
        marginVertical: 0,
    },
    countryItem: {
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 10,
        marginBottom: 8,
    },
    countryItemText: {
        fontSize: 16,
        fontFamily: 'Rubik-Regular',
    },
})

export default Phone