import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View, Pressable, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI
import QPButton from '../../ui/particles/QPButton'
import QPCoin from '../../ui/particles/QPCoin'
import QPInput from '../../ui/particles/QPInput'

// API
import apiClient from '../../api/client'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const Withdraw = () => {

    // States
    const [amountQUSD, setAmountQUSD] = useState('')
    const [amountCoin, setAmountCoin] = useState('')
    const [availableCoins, setAvailableCoins] = useState([])
    const [selectedCoin, setSelectedCoin] = useState(null)
    const [showCoinPicker, setShowCoinPicker] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [coinSearch, setCoinSearch] = useState('')
    const [workingForm, setWorkingForm] = useState({})

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)
    const textStyles = createTextStyles(theme)

    // Fetch available coins enabled_out
    useEffect(() => {
        const fetchCoins = async () => {
            try {
                setIsLoading(true)
                const response = await apiClient.get('/coins/v2?enabled_out=true')
                setAvailableCoins(response.data)
            } catch (error) {
                console.warn('Error fetching enabled_out coins', error)
            } finally { setIsLoading(false) }
        }
        fetchCoins()
    }, [])

    // Price helpers
    const coinPrice = useMemo(() => {
        if (!selectedCoin) { return null }
        const price = Number(selectedCoin.price)
        return isNaN(price) ? null : price
    }, [selectedCoin])

    // Handlers for amount changes (bidirectional)
    const handleChangeQUSD = (value) => {
        setAmountQUSD(value)
        const num = Number(value)
        if (coinPrice && !isNaN(num)) {
            const converted = num / coinPrice
            setAmountCoin(converted ? String(converted.toFixed(6)) : '')
        } else { setAmountCoin('') }
    }

    const handleChangeCoin = (value) => {
        setAmountCoin(value)
        const num = Number(value)
        if (coinPrice && !isNaN(num)) {
            const converted = num * coinPrice
            setAmountQUSD(converted ? String(converted.toFixed(2)) : '')
        } else { setAmountQUSD('') }
    }

    // Working data parsing
    const workingFields = useMemo(() => {
        if (!selectedCoin || !selectedCoin.working_data) { return [] }
        try {
            const raw = typeof selectedCoin.working_data === 'string' ? JSON.parse(selectedCoin.working_data) : selectedCoin.working_data
            if (Array.isArray(raw)) { return raw }
            return []
        } catch (e) {
            console.warn('Invalid working_data JSON for coin', selectedCoin?.tick)
            return []
        }
    }, [selectedCoin])

    const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

    const isFormValid = useMemo(() => {
        if (!selectedCoin) { return false }
        const amount = Number(amountQUSD)
        if (!amount || isNaN(amount)) { return false }
        // Check working fields
        return workingFields.every((field) => {
            const key = keyFromFieldName(field.name)
            const value = (workingForm[key] ?? '').toString().trim()
            return value.length > 0
        })
    }, [selectedCoin, amountQUSD, workingFields, workingForm])

    const handleCoinSelect = (coin) => {
        setSelectedCoin(coin)
        setShowCoinPicker(false)
        // Recompute bottom amount when selecting coin
        if (amountQUSD) {
            const price = Number(coin.price)
            if (!isNaN(price)) {
                setAmountCoin(String((Number(amountQUSD) / price).toFixed(6)))
            }
        }
        // Reset form for new coin
        setWorkingForm({})
    }

    return (
        <KeyboardAvoidingView
            style={containerStyles.subContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

                <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                    <View style={{ flex: 1 }}>

                        {/* Swap Card */}
                        <View style={{ backgroundColor: theme.colors.elevation, borderRadius: 16, padding: 16, marginTop: 10, borderWidth: 2, borderColor: theme.colors.primary }}>

                                                         {/* QUSD amount input */}
                             <View style={{ paddingVertical: 8 }}>
                                 <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>Extraer</Text>
                                 
                                 {/* Single row container with dark background */}
                                 <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                     {/* Left side - Amount input */}
                                     <View style={{ flex: 1 }}>
                                         <TextInput
                                             value={amountQUSD}
                                             onChangeText={handleChangeQUSD}
                                             placeholder="0.00"
                                             placeholderTextColor={theme.colors.placeholder}
                                             keyboardType="numeric"
                                             style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 28, fontWeight: '600', padding: 0, margin: 0 }]}
                                         />
                                     </View>
                                     
                                     {/* Right side - Static QUSD display */}
                                     <View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation }]}>
                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                             <QPCoin coin="qusd" size={20} />
                                             <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
                                         </View>
                                     </View>
                                 </View>
                             </View>

                            {/* Divider with arrows */}
                            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 40, backgroundColor: theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                                    <FontAwesome6 name="right-left" size={16} color={theme.colors.primary} iconStyle="solid" />
                                </View>
                            </View>

                            {/* Coin amount and selector */}
                            <View style={{ paddingTop: 8 }}>
                                <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 6 }]}>Recibir</Text>

                                {/* Single row container with dark background */}
                                <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    {/* Left side - Amount and available balance */}
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            value={amountCoin}
                                            onChangeText={handleChangeCoin}
                                            placeholder="0.00"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="numeric"
                                            style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 28, fontWeight: '600', padding: 0, margin: 0 }]}
                                            editable={!!selectedCoin}
                                        />
                                    </View>

                                    {/* Right side - Currency selector button */}
                                    <Pressable style={[styles.currencyButton, { backgroundColor: theme.colors.elevation }]} onPress={() => setShowCoinPicker(true)} >
                                        {selectedCoin ? (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <QPCoin coin={selectedCoin.logo} size={20} />
                                                <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.tick}</Text>
                                                <FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
                                            </View>
                                        ) : (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]}>Moneda</Text>
                                                <FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
                                            </View>
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Dynamic Working Data Inputs */}
                    {selectedCoin && workingFields.length > 0 && (
                        <View style={{ marginTop: 20 }}>
                            <Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 10 }]}>Datos requeridos</Text>
                            {workingFields.map((field) => {
                                const key = keyFromFieldName(field.name)
                                return (
                                    <QPInput
                                        key={key}
                                        value={workingForm[key] || ''}
                                        onChangeText={(text) => setWorkingForm((prev) => ({ ...prev, [key]: text }))}
                                        placeholder={field.name}
                                        keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                                        style={{ marginVertical: 6 }}
                                        prefixIconName="id-card"
                                    />
                                )
                            })}
                        </View>
                    )}

                    {/* Bottom Button */}
                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title="Continuar"
                            onPress={() => { /* Submit flow will be handled in next step */ }}
                            disabled={!isFormValid}
                            icon="arrow-right"
                            iconStyle="solid"
                            iconColor={theme.colors.almostWhite}
                            textStyle={{ color: theme.colors.almostWhite }}
                        />
                    </View>

                    <Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCoinPicker(false)}>
                        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
                                <Text style={textStyles.h4}>Seleccionar Moneda</Text>
                                <Pressable onPress={() => setShowCoinPicker(false)} style={styles.closeButton}>
                                    <FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
                                </Pressable>
                            </View>

                            <ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true}>
                                {isLoading ? (
                                    <View style={styles.loadingContainer}>
                                        <Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando monedas...</Text>
                                    </View>
                                ) : availableCoins.length > 0 ? (
                                    availableCoins
                                        .filter((coin) => coin.name.toLowerCase().includes(coinSearch.toLowerCase()) || coin.tick.toLowerCase().includes(coinSearch.toLowerCase()))
                                        .map((coin) => (
                                            <Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => handleCoinSelect(coin)}>
                                                <QPCoin coin={coin.logo} size={40} />
                                                <View style={{ marginLeft: 12, flex: 1 }}>
                                                    <Text style={textStyles.h4}>{coin.name}</Text>
                                                    <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Mín: ${coin.min_out} | Precio: ${Number(coin.price).toFixed(6)}</Text>
                                                </View>
                                                {coin.network && (
                                                    <View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
                                                        <Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>{coin.network}</Text>
                                                    </View>
                                                )}
                                            </Pressable>
                                        ))
                                ) : (
                                    <View style={styles.loadingContainer}>
                                        <Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>No hay monedas disponibles</Text>
                                    </View>
                                )}
                            </ScrollView>
                        </SafeAreaView>
                    </Modal>

                </ScrollView>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    coinSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.2)'
    },
    currencyButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.1)'
    },
    coinSelectorPlaceholder: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flex: 1,
    },
    selectedCoin: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    // Modal styles (reused from Add.jsx for consistency)
    modalContainer: { flex: 1 },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 0.5
    },
    closeButton: { padding: 5 },
    coinList: { flex: 1 },
    coinListContent: { padding: 20, paddingBottom: 40 },
    coinItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    networkBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
})

export default Withdraw