import { useState, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Switch, Animated, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI
import QPCoin from '../../ui/particles/QPCoin'
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import Toast from 'react-native-toast-message'

// API & Helpers
import coinsApi from '../../api/coinsApi'
import p2pApi from '../../api/p2pApi'
import { adjustNumber } from '../../helpers'

const P2PCreate = () => {

    // Theme
    const { theme } = useTheme()
    const textStyles = createTextStyles(theme)
    const containerStyles = createContainerStyles(theme)

    // Form State
    const [type, setType] = useState('buy') // 'buy' | 'sell'
    const [amount, setAmount] = useState('')
    const [receive, setReceive] = useState('')
    const [details, setDetails] = useState('')
    const [advancedOpen, setAdvancedOpen] = useState(false)

    // Advanced P2P Settings
    const [onlyVerified, setOnlyVerified] = useState(true)
    const [onlyVIP, setOnlyVIP] = useState(true)
    const [privateOffer, setPrivateOffer] = useState(false)

    // Coins selector state (mirrors Withdraw)
    const [availableCoins, setAvailableCoins] = useState([])
    const [selectedCoin, setSelectedCoin] = useState(null)
    const [showCoinPicker, setShowCoinPicker] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [coinSearch, setCoinSearch] = useState('')
    const [showCoinSearch, setShowCoinSearch] = useState(false)
    const [workingForm, setWorkingForm] = useState({})

    // Button Text State with Type and Amount values
    const [buttonText, setButtonText] = useState('')
    useEffect(() => {
        if (type === 'buy') {
            setButtonText(`Comprar ${amount > 0 ? '$' + amount : ''}`)
        } else {
            setButtonText(`Vender ${amount > 0 ? '$' + amount : ''}`)
        }
    }, [type, amount])

    // Fetch available coins (enabled_p2p like Withdraw)
    useEffect(() => {
        const fetchCoins = async () => {
            try {
                setIsLoading(true)
                const response = await coinsApi.index({ enabled_p2p: true })
                setAvailableCoins(response.data)
            } catch (error) { console.warn('Error fetching enabled_p2p coins', error) }
            finally { setIsLoading(false) }
        }
        fetchCoins()
    }, [])

    // Handle coin selection
    const handleCoinSelect = (coin) => {
        setSelectedCoin(coin)
        setShowCoinPicker(false)
        setWorkingForm({})
    }

    // Working data parsing (same logic as Withdraw)
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

    // Helpers
    const keyFromFieldName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const isNumber = (val) => /^\d*(?:[.,]?\d*)$/.test(val)
    const normalizeNumber = (val) => val.replace(',', '.')

    // Handle publish
    const handlePublish = async () => {

        if (type != 'buy' && type != 'sell') {
            Toast.show({ type: 'error', text1: 'Datos incompletos', text2: 'Debes seleccionar una opción' })
            return
        }

        if (!selectedCoin) {
            Toast.show({ type: 'error', text1: 'Datos incompletos', text2: 'Debes seleccionar una moneda' })
            return
        }

        // Basic validation
        if (!amount || !receive) {
            Toast.show({ type: 'error', text1: 'Datos incompletos', text2: 'Debes completar los montos de comprar y vender' })
            return
        }
        const amt = parseFloat(normalizeNumber(amount))
        const rcv = parseFloat(normalizeNumber(receive))
        if (isNaN(amt) || isNaN(rcv) || amt <= 0 || rcv <= 0) {
            Toast.show({ type: 'error', text1: 'Montos inválidos', text2: 'Introduce valores numéricos mayores que 0 para comprar y vender' })
            return
        }
        // Working data required if coin has fields
        if (selectedCoin && workingFields.length > 0) {
            const allFilled = workingFields.every((field) => {
                const key = keyFromFieldName(field.name)
                const value = (workingForm[key] ?? '').toString().trim()
                return value.length > 0
            })
            if (!allFilled) {
                Toast.show({ type: 'error', text1: 'Faltan datos', text2: 'Completa los datos de su cuenta para la moneda seleccionada para comprar y vender' })
                return
            }
        }

        try {

            setIsSending(true)

            const detailsArray = (workingFields.length > 0)
                ? workingFields.map((field) => ({
                    name: field.name,
                    value: (workingForm[keyFromFieldName(field.name)] ?? '').toString().trim()
                }))
                : []

            const payload = {
                type,
                coin: selectedCoin?.tick,
                amount: amt,
                receive: rcv,
                details: detailsArray,
                only_kyc: onlyVerified ? 1 : 0,
                only_vip: onlyVIP ? 1 : 0,
                private: privateOffer ? 1 : 0,
            }

            const res = await p2pApi.create(payload)

            if (res.status === 201) {
                Toast.show({ type: 'success', text1: 'Listo', text2: 'Tu oferta se ha creado correctamente' })
            } else {
                const errMsg = res?.data?.error || 'No se pudo crear la oferta P2P'
                Toast.show({ type: 'error', text1: 'Error al crear la oferta', text2: errMsg })
            }

        } catch (error) {
            console.error('Error publishing P2P', error)
            Toast.show({ type: 'error', text1: 'Error al crear la oferta', text2: error.message })
        } finally { setIsSending(false) }
    }

    return (
        <KeyboardAvoidingView style={containerStyles.subContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={{ flex: 1 }}>

                    <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                        {/* Type Selector */}
                        <QPSwitch type={type} onChange={setType} />

                        {/* Swap Card (Vender / Recibir) */}
                        <View style={{ backgroundColor: theme.colors.elevation, borderRadius: 16, padding: 16, marginTop: 10, marginBottom: 6, borderWidth: 2, borderColor: theme.colors.primary }}>

                            {/* Vender amount input */}
                            <View style={{ paddingVertical: 2 }}>
                                <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>{type === 'buy' ? 'Comprar' : 'Vender'}</Text>
                                {/* Single row container */}
                                <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    {/* Left side - Amount input */}
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            value={amount}
                                            onChangeText={(v) => { if (isNumber(v)) setAmount(v) }}
                                            placeholder="0.00"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="decimal-pad"
                                            style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 32, fontWeight: '600', padding: 0, margin: 0 }]}
                                        />
                                    </View>

                                    {/* Right side - Static QUSD pill */}
                                    <View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <QPCoin coin="qusd" size={20} />
                                            <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>QUSD</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {/* Recibir amount input */}
                            <View style={{ paddingTop: 2 }}>
                                <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>{type === 'buy' ? 'Enviar' : 'Recibir'}</Text>
                                {/* Single row container */}
                                <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    {/* Left side - Amount input */}
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            value={receive}
                                            onChangeText={(v) => { if (isNumber(v)) setReceive(v) }}
                                            placeholder="0.00"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="decimal-pad"
                                            style={[textStyles.h2, { color: theme.colors.primaryText, fontSize: 32, fontWeight: '600', padding: 0, margin: 0 }]}
                                        />
                                    </View>
                                    {/* Right side - Currency selector button */}
                                    <Pressable style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]} onPress={() => setShowCoinPicker(true)} >
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

                        {/* Details: Coin working data (same UX as Withdraw) */}
                        {selectedCoin && workingFields.length > 0 && (
                            <View style={{ marginTop: 12, marginBottom: 6 }}>

                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 6 }]}>Detalles adicionales:</Text>

                                    <Pressable onPress={() => console.log(selectedCoin.working_data)}>
                                        <FontAwesome6 name="book" size={16} color={theme.colors.primary} iconStyle="solid" />
                                    </Pressable>

                                </View>

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
                                        />
                                    )
                                })}
                            </View>
                        )}

                        {/* Advanced */}
                        <View style={containerStyles.card}>

                            <Pressable onPress={() => setAdvancedOpen(!advancedOpen)} style={[styles.advancedHeader]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <FontAwesome6 name="sliders" size={16} color={theme.colors.primaryText} iconStyle="solid" />
                                    <Text style={[textStyles.h5, { marginLeft: 8 }]}>Opciones avanzadas</Text>
                                </View>
                                <FontAwesome6 name={advancedOpen ? 'angle-up' : 'angle-down'} size={18} color={theme.colors.primaryText} iconStyle="solid" />
                            </Pressable>

                            {advancedOpen && (
                                <View style={{ marginTop: 10, gap: 10 }}>
                                    <View style={[styles.switchRow, { marginTop: 12 }]}>
                                        <Text style={[textStyles.h6]}>Solo usuarios verificados</Text>
                                        <Switch value={onlyVerified} onValueChange={setOnlyVerified} trackColor={{ true: theme.colors.primary }} />
                                    </View>
                                    <View style={styles.switchRow}>
                                        <Text style={[textStyles.h6]}>Solo usuarios VIP</Text>
                                        <Switch value={onlyVIP} onValueChange={setOnlyVIP} trackColor={{ true: theme.colors.primary }} />
                                    </View>
                                    <View style={styles.switchRow}>
                                        <Text style={[textStyles.h6]}>Oferta Privada</Text>
                                        <Switch value={privateOffer} onValueChange={setPrivateOffer} trackColor={{ true: theme.colors.primary }} />
                                    </View>
                                </View>
                            )}
                        </View>

                    </ScrollView>

                    {/* Publish */}
                    <View style={containerStyles.bottomButtonContainer}>
                        <QPButton
                            title={buttonText}
                            onPress={handlePublish}
                            disabled={selectedCoin === null || amount === '' || receive === '' || isSending}
                            loading={isSending}
                            style={{ backgroundColor: type === 'buy' ? theme.colors.success : theme.colors.danger }}
                            textStyle={{ color: type === 'buy' ? theme.colors.almostBlack : theme.colors.almostWhite }}
                            iconColor={type === 'buy' ? theme.colors.almostBlack : theme.colors.almostWhite}
                        />
                    </View>

                    {/* Coin Picker Modal (same UX as Withdraw) */}
                    <Modal visible={showCoinPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCoinPicker(false)}>
                        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>

                            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.elevation }]}>
                                <Text style={textStyles.h4}>Seleccionar Moneda</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                                    <Pressable onPress={() => setShowCoinSearch(!showCoinSearch)}>
                                        <FontAwesome6 name="magnifying-glass" size={18} color={showCoinSearch ? theme.colors.primary : theme.colors.primaryText} iconStyle="solid" />
                                    </Pressable>
                                    <Pressable onPress={() => setShowCoinPicker(false)} style={styles.closeButton}>
                                        <FontAwesome6 name="xmark" size={24} color={theme.colors.primaryText} iconStyle="solid" />
                                    </Pressable>
                                </View>
                            </View>

                            {showCoinSearch && (
                                <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
                                    <QPInput
                                        value={coinSearch}
                                        onChangeText={setCoinSearch}
                                        placeholder="Buscar moneda..."
                                        prefixIconName="magnifying-glass"
                                        style={styles.searchInput}
                                    />
                                </View>
                            )}

                            <ScrollView style={styles.coinList} contentContainerStyle={styles.coinListContent} showsVerticalScrollIndicator={true} >
                                {isLoading ? (
                                    <View style={styles.loadingContainer}>
                                        <Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>Cargando monedas...</Text>
                                    </View>
                                ) : availableCoins.length > 0 ? (availableCoins
                                    .filter((coin) => coin.name.toLowerCase().includes(coinSearch.toLowerCase()) || coin.tick.toLowerCase().includes(coinSearch.toLowerCase()))
                                    .map((coin) => (
                                        <Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]} onPress={() => handleCoinSelect(coin)}>
                                            <QPCoin coin={coin.logo} size={40} />
                                            <View style={{ marginLeft: 12, flex: 1 }}>
                                                <Text style={textStyles.h4}>{coin.name}</Text>
                                                <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>Mín: ${adjustNumber(coin.min_out)} | Precio: ${adjustNumber(coin.price)}</Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                                {coin.network && (
                                                    <View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
                                                        <Text style={[textStyles.h7, { color: theme.colors.buttonText }]}>{coin.network}</Text>
                                                    </View>
                                                )}
                                            </View>
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

                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 12,
        padding: 12,
        marginVertical: 6,
    },
    // Modal styles (mirroring Withdraw)
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
    coinListContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
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
    currencyButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 0.5
    },
    segmentedContainer: {
        position: 'relative',
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center'
    },
    segmentedPill: {
        position: 'absolute',
        left: 0,
        top: 2,
        bottom: 2,
        borderRadius: 20,
    },
    segmentedOption: {
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
    },
    segment: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1
    },
    inputRow: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    rightPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'transparent'
    },
    coinChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1
    },
    advancedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    switchRow: {
        paddingVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    }
})

export default P2PCreate


