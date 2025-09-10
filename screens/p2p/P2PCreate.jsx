import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Switch, Alert, Animated } from 'react-native'

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

    // Advanced State
    const [minAmount, setMinAmount] = useState('')
    const [maxAmount, setMaxAmount] = useState('')
    const [ratio, setRatio] = useState('')
    const [timeLimit, setTimeLimit] = useState('30')
    const [onlyVerified, setOnlyVerified] = useState(true)

    // Coins (basic list for now)
    const coins = [
        { symbol: 'QUSD', name: 'QvaPay USD', logo: 'qusd' },
        { symbol: 'ETECSA', name: 'ETECSA', logo: 'etecsa' },
        { symbol: 'BANK_CUP', name: 'Bank CUP', logo: 'bank_cup' },
        { symbol: 'CLASICA', name: 'Clásica', logo: 'clasica' },
    ]
    const [selectedCoin, setSelectedCoin] = useState(coins[0])

    // Helpers
    const isNumber = (val) => /^\d*(?:[.,]?\d*)$/.test(val)
    const normalizeNumber = (val) => val.replace(',', '.')

    const handlePublish = () => {
        // Basic validation
        if (!amount || !receive) {
            Alert.alert('Datos incompletos', 'Debes completar los montos de vender y recibir')
            return
        }
        const amt = parseFloat(normalizeNumber(amount))
        const rcv = parseFloat(normalizeNumber(receive))
        if (isNaN(amt) || isNaN(rcv) || amt <= 0 || rcv <= 0) {
            Alert.alert('Montos inválidos', 'Introduce valores numéricos mayores que 0')
            return
        }
        // For now, just a stub success
        Alert.alert('Listo', 'Tu oferta P2P está lista para publicar (próximamente)')
    }

    return (
        <View style={containerStyles.subContainer}>

            <ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

                {/* Type Selector */}
                <QPSwitch type={type} onChange={setType} />

                {/* Swap Card (Vender / Recibir) */}
                <View style={{ backgroundColor: theme.colors.elevation, borderRadius: 16, padding: 16, marginTop: 10, marginBottom: 6, borderWidth: 2, borderColor: theme.colors.primary }}>

                    {/* Vender amount input */}
                    <View style={{ paddingVertical: 2 }}>
                        <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Vender</Text>

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

                    {/* Divider with arrows */}
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 40, backgroundColor: theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome6 name="right-left" size={16} color={theme.colors.primary} iconStyle="solid" />
                        </View>
                    </View>

                    {/* Recibir amount input */}
                    <View style={{ paddingTop: 2 }}>

                        <Text style={[textStyles.h6, { color: theme.colors.tertiaryText, marginBottom: 2 }]}>Recibir</Text>

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

                            {/* Right side - Selected coin pill */}
                            <View style={[styles.currencyButton, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <QPCoin coin={selectedCoin.logo} size={20} />
                                    <Text style={[textStyles.h6, { color: theme.colors.primaryText, fontWeight: '600' }]}>{selectedCoin.symbol}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Details */}
                <View style={containerStyles.card}>
                    <Text style={[textStyles.h5, { marginBottom: 8 }]}>Detalles</Text>
                    <QPInput
                        multiline
                        numberOfLines={4}
                        placeholder="Añade detalles, métodos de pago o condiciones"
                        style={{ borderRadius: 12 }}
                        value={details}
                        onChangeText={setDetails}
                    />
                </View>

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
                            <View style={[styles.switchRow, { borderColor: theme.colors.border }]}>
                                <Text style={[textStyles.h6]}>Solo usuarios verificados</Text>
                                <Switch value={onlyVerified} onValueChange={setOnlyVerified} trackColor={{ true: theme.colors.primary }} />
                            </View>
                        </View>
                    )}
                </View>

            </ScrollView>

            {/* Publish */}
            <View style={containerStyles.bottomButtonContainer}>
                <QPButton
                    title="Publicar oferta"
                    onPress={handlePublish}
                    style={{ backgroundColor: type === 'buy' ? theme.colors.success : theme.colors.danger }}
                    textStyle={{ color: type === 'buy' ? theme.colors.almostBlack : theme.colors.almostWhite }}
                    icon="paper-plane"
                    iconColor={type === 'buy' ? theme.colors.almostBlack : theme.colors.almostWhite}
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 12,
        padding: 12,
        marginVertical: 6,
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
        marginTop: 4,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1
    }
})

export default P2PCreate


