import { useState } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Switch, Alert } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// UI
import QPCoin from '../../ui/particles/QPCoin'
import QPInput from '../../ui/particles/QPInput'
import QPButton from '../../ui/particles/QPButton'

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
    const [timeLimit, setTimeLimit] = useState('30') // minutes
    const [onlyVerified, setOnlyVerified] = useState(false)

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
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[textStyles.h5, { marginBottom: 8 }]}>Tipo</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable
                            onPress={() => setType('buy')}
                            style={[styles.segment, {
                                backgroundColor: type === 'buy' ? theme.colors.success : theme.colors.elevation,
                                borderColor: type === 'buy' ? theme.colors.success : theme.colors.border
                            }]}>
                            <FontAwesome6 name="circle-arrow-down" size={14} color={type === 'buy' ? theme.colors.almostBlack : theme.colors.primaryText} iconStyle="solid" />
                            <Text style={[textStyles.h6, { marginLeft: 6, color: type === 'buy' ? theme.colors.almostBlack : theme.colors.primaryText }]}>Comprar</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setType('sell')}
                            style={[styles.segment, {
                                backgroundColor: type === 'sell' ? theme.colors.danger : theme.colors.elevation,
                                borderColor: type === 'sell' ? theme.colors.danger : theme.colors.border
                            }]}>
                            <FontAwesome6 name="circle-arrow-up" size={14} color={type === 'sell' ? theme.colors.almostWhite : theme.colors.primaryText} iconStyle="solid" />
                            <Text style={[textStyles.h6, { marginLeft: 6, color: type === 'sell' ? theme.colors.almostWhite : theme.colors.primaryText }]}>Vender</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Amount to Sell */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[textStyles.h5, { marginBottom: 8 }]}>Monto a vender</Text>
                    <View style={[styles.inputRow, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                        <TextInput
                            value={amount}
                            onChangeText={(v) => { if (isNumber(v)) setAmount(v) }}
                            placeholder="0.00"
                            placeholderTextColor={theme.colors.placeholder}
                            keyboardType="decimal-pad"
                            style={[textStyles.h3, { flex: 1, color: theme.colors.primaryText, padding: 0 }]}
                        />
                        <View style={styles.rightPill}>
                            <QPCoin coin="qusd" size={18} />
                            <Text style={[textStyles.h6, { marginLeft: 6 }]}>QUSD</Text>
                        </View>
                    </View>
                </View>

                {/* Amount to Receive */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[textStyles.h5, { marginBottom: 8 }]}>Monto a recibir</Text>
                    <View style={[styles.inputRow, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                        <TextInput
                            value={receive}
                            onChangeText={(v) => { if (isNumber(v)) setReceive(v) }}
                            placeholder="0.00"
                            placeholderTextColor={theme.colors.placeholder}
                            keyboardType="decimal-pad"
                            style={[textStyles.h3, { flex: 1, color: theme.colors.primaryText, padding: 0 }]}
                        />
                        <View style={styles.rightPill}>
                            <QPCoin coin={selectedCoin.logo} size={18} />
                            <Text style={[textStyles.h6, { marginLeft: 6 }]}>{selectedCoin.symbol}</Text>
                        </View>
                    </View>
                </View>

                {/* Coin Selector */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[textStyles.h5, { marginBottom: 8 }]}>Moneda</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {coins.map((coin) => {
                            const isActive = selectedCoin.symbol === coin.symbol
                            return (
                                <Pressable
                                    key={coin.symbol}
                                    onPress={() => setSelectedCoin(coin)}
                                    style={[styles.coinChip, {
                                        backgroundColor: isActive ? theme.colors.primary : theme.colors.elevation,
                                        borderColor: isActive ? theme.colors.primary : theme.colors.border
                                    }]}
                                >
                                    <QPCoin coin={coin.logo} size={18} />
                                    <Text style={[textStyles.h6, { marginLeft: 6, color: isActive ? theme.colors.buttonText : theme.colors.primaryText }]}>{coin.symbol}</Text>
                                </Pressable>
                            )
                        })}
                    </ScrollView>
                </View>

                {/* Details */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
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
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Pressable onPress={() => setAdvancedOpen(!advancedOpen)} style={[styles.advancedHeader]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <FontAwesome6 name="sliders" size={16} color={theme.colors.primaryText} iconStyle="solid" />
                            <Text style={[textStyles.h5, { marginLeft: 8 }]}>Opciones avanzadas</Text>
                        </View>
                        <FontAwesome6 name={advancedOpen ? 'angle-up' : 'angle-down'} size={18} color={theme.colors.primaryText} iconStyle="solid" />
                    </Pressable>

                    {advancedOpen && (
                        <View style={{ marginTop: 10, gap: 10 }}>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h6, { marginBottom: 6, color: theme.colors.tertiaryText }]}>Mínimo</Text>
                                    <View style={[styles.inputRow, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                                        <TextInput
                                            value={minAmount}
                                            onChangeText={(v) => { if (isNumber(v)) setMinAmount(v) }}
                                            placeholder="0.00"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="decimal-pad"
                                            style={[textStyles.h6, { flex: 1, color: theme.colors.primaryText, padding: 0 }]}
                                        />
                                    </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h6, { marginBottom: 6, color: theme.colors.tertiaryText }]}>Máximo</Text>
                                    <View style={[styles.inputRow, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                                        <TextInput
                                            value={maxAmount}
                                            onChangeText={(v) => { if (isNumber(v)) setMaxAmount(v) }}
                                            placeholder="0.00"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="decimal-pad"
                                            style={[textStyles.h6, { flex: 1, color: theme.colors.primaryText, padding: 0 }]}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h6, { marginBottom: 6, color: theme.colors.tertiaryText }]}>Ratio</Text>
                                    <View style={[styles.inputRow, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                                        <TextInput
                                            value={ratio}
                                            onChangeText={(v) => { if (isNumber(v)) setRatio(v) }}
                                            placeholder="1.00"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="decimal-pad"
                                            style={[textStyles.h6, { flex: 1, color: theme.colors.primaryText, padding: 0 }]}
                                        />
                                    </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[textStyles.h6, { marginBottom: 6, color: theme.colors.tertiaryText }]}>Tiempo límite (min)</Text>
                                    <View style={[styles.inputRow, { backgroundColor: theme.colors.elevation, borderColor: theme.colors.border }]}>
                                        <TextInput
                                            value={timeLimit}
                                            onChangeText={(v) => { if (/^\d*$/.test(v)) setTimeLimit(v) }}
                                            placeholder="30"
                                            placeholderTextColor={theme.colors.placeholder}
                                            keyboardType="number-pad"
                                            style={[textStyles.h6, { flex: 1, color: theme.colors.primaryText, padding: 0 }]}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={[styles.switchRow, { borderColor: theme.colors.border }]}>
                                <Text style={[textStyles.h6]}>Solo usuarios verificados</Text>
                                <Switch value={onlyVerified} onValueChange={setOnlyVerified} trackColor={{ true: theme.colors.primary }} />
                            </View>
                        </View>
                    )}
                </View>

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
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 12,
        padding: 12,
        marginVertical: 6,
        borderWidth: 1
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


