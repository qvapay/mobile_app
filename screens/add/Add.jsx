import { useState, useEffect } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Modal, Alert } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { SafeAreaView } from 'react-native-safe-area-context'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createContainerStyles, createTextStyles } from '../../theme/themeUtils'

// UI
import QPCoin from '../../ui/particles/QPCoin'
import QPButton from '../../ui/particles/QPButton'
import QPMoneyInput from '../../ui/particles/QPMoneyInput'

// API
import apiClient from '../../api/client'

// QR Code
import QRCode from 'react-native-qrcode-styled'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const Add = ({ navigation }) => {

    // Theme variables, dark and light modes
    const { theme } = useTheme()
    const containerStyles = createContainerStyles(theme)
    const textStyles = createTextStyles(theme)

    // States
    const [availableCoins, setAvailableCoins] = useState([])
    const [selectedCoin, setSelectedCoin] = useState(null)
    const [amount, setAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [showInstructions, setShowInstructions] = useState(false)
    const [showCoinPicker, setShowCoinPicker] = useState(false)
    const [topupData, setTopupData] = useState(null)

    // Get Available Coins for enabled_in
    useEffect(() => {
        const fetchAvailableCoins = async () => {
            try {
                setIsLoading(true)
                const response = await apiClient.get('/coins/v2?enabled_in=true')
                setAvailableCoins(response.data)
            } catch (error) {
                console.error('Error fetching coins:', error)
                setError('Error al cargar las monedas disponibles')
            } finally {
                setIsLoading(false)
            }
        }
        fetchAvailableCoins()
    }, [])

    // Handle coin selection
    const handleCoinSelect = (coin) => {
        setSelectedCoin(coin)
        setShowCoinPicker(false)
    }

    // Handle topup request
    const handleTopup = async () => {

        if (!selectedCoin || !amount) {
            Alert.alert('Error', 'Por favor selecciona una moneda e ingresa un monto')
            return
        }

        const amountValue = parseFloat(amount)
        if (isNaN(amountValue) || amountValue <= 0) {
            Alert.alert('Error', 'Por favor ingresa un monto válido')
            return
        }

        if (amountValue < parseFloat(selectedCoin.min_in)) {
            Alert.alert('Error', `El monto mínimo para ${selectedCoin.name} es ${selectedCoin.min_in}`)
            return
        }

        try {
            setIsLoading(true)
            setError(null)

            console.log(selectedCoin.tick)
            console.log(Number(amount))

            const response = await apiClient.post('/topup', {
                pay_method: selectedCoin.tick,
                amount: Number(amount)
            })

            console.error(response.data)

            if (response.data && response.status === 200) {
                setTopupData(response.data.data)
                setSuccess('Solicitud de depósito creada exitosamente')
            } else {
                setError('Error al crear la solicitud de depósito')
            }
        } catch (error) {
            console.error('Error creating topup:', error)
            setError('Error al crear la solicitud de depósito')
        } finally { setIsLoading(false) }
    }

    // Reset form
    const handleReset = () => {
        setSelectedCoin(null)
        setAmount('')
        setTopupData(null)
        setError(null)
        setSuccess(null)
    }

    // Copy to clipboard
    const copyToClipboard = (text) => {
        Clipboard.setString(text)
        Alert.alert('Copiado', 'Dirección copiada al portapapeles')
    }

    return (
        <View style={[containerStyles.subContainer, { paddingVertical: 20 }]}>

            <Text style={[textStyles.h1, { color: theme.colors.primaryText }]}>Depositar</Text>

            <View style={{ flex: 1 }}>

                {/* Coin Selection */}
                <View style={containerStyles.card}>
                    <Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>Moneda</Text>
                    <Pressable style={[styles.coinSelector, { backgroundColor: theme.colors.surface }]} onPress={() => setShowCoinPicker(true)} disabled={isLoading}>
                        {selectedCoin ? (
                            <View style={styles.selectedCoin}>
                                <QPCoin coin={selectedCoin.logo} size={32} />
                                <View style={{ marginLeft: 12 }}>
                                    <Text style={textStyles.h4}>{selectedCoin.name}</Text>
                                    <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
                                        Mín: {selectedCoin.min_in} | Fee: {selectedCoin.fee_in}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[textStyles.subtitle, { color: theme.colors.tertiaryText }]}>
                                {isLoading ? "Cargando monedas..." : "Seleccionar moneda"}
                            </Text>
                        )}
                        <Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>▼</Text>
                    </Pressable>
                </View>

                {/* Amount Input */}
                <View style={{ marginVertical: 10 }}>
                    <QPMoneyInput
                        placeholder="0.00"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                        style={{
                            color: theme.colors.success,
                        }}
                        prefixIconName="plus"
                        type="add"
                    />
                    {selectedCoin && (
                        <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
                            Mínimo: {selectedCoin.min_in} {selectedCoin.tick}
                        </Text>
                    )}
                </View>

                {/* Error/Success Messages */}
                {error && (
                    <View style={[containerStyles.card, { backgroundColor: theme.colors.danger + '20' }]}>
                        <Text style={[textStyles.caption, { color: theme.colors.danger }]}>{error}</Text>
                    </View>
                )}

                {success && (
                    <View style={[containerStyles.card, { backgroundColor: theme.colors.success + '20' }]}>
                        <Text style={[textStyles.caption, { color: theme.colors.success }]}>{success}</Text>
                    </View>
                )}
            </View>

            {/* Action Buttons */}
            {!topupData ? (
                <QPButton title={isLoading ? "Generando..." : "Generar Depósito"} onPress={handleTopup} disabled={!selectedCoin || !amount || isLoading} icon="plus" />
            ) : (
                <QPButton title="Nuevo Depósito" onPress={handleReset} icon="plus" />
            )}

            {/* Topup Details */}
            {topupData && (
                <View style={containerStyles.card}>
                    <Text style={textStyles.h3}>Detalles del Depósito</Text>

                    <View style={styles.detailRow}>
                        <Text style={textStyles.h5}>Moneda:</Text>
                        <Text style={textStyles.h4}>{topupData.coin}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={textStyles.h5}>Monto:</Text>
                        <Text style={textStyles.h4}>{topupData.value}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={textStyles.h5}>Precio:</Text>
                        <Text style={textStyles.h4}>${topupData.price}</Text>
                    </View>

                    <View style={styles.qrContainer}>
                        <QRCode
                            data={topupData.wallet}
                            size={200}
                            backgroundColor={theme.colors.background}
                            color={theme.colors.primaryText}
                        />
                    </View>

                    <View style={styles.walletContainer}>
                        <Text style={textStyles.h5}>Dirección de la Wallet:</Text>
                        <Pressable
                            style={[styles.walletAddress, { backgroundColor: theme.colors.surface }]}
                            onPress={() => copyToClipboard(topupData.wallet)}
                        >
                            <Text style={[textStyles.caption, { flex: 1 }]}>{topupData.wallet}</Text>
                            <Text style={[textStyles.h5, { color: theme.colors.primary }]}>Copiar</Text>
                        </Pressable>
                    </View>

                    <View style={styles.transactionContainer}>
                        <Text style={textStyles.h5}>ID de Transacción:</Text>
                        <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
                            {topupData.transaction_id}
                        </Text>
                    </View>
                </View>
            )}

            {/* Coin Picker Modal */}
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
                                <Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>
                                    Cargando monedas...
                                </Text>
                            </View>
                        ) : availableCoins.length > 0 ? (availableCoins.map((coin) => (
                            <Pressable key={coin.id} style={[styles.coinItem, { backgroundColor: theme.colors.surface }]} onPress={() => handleCoinSelect(coin)} >
                                <QPCoin coin={coin.logo} size={40} />
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                    <Text style={textStyles.h4}>{coin.name}</Text>
                                    <Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>
                                        Mín: {coin.min_in} | Fee: {coin.fee_in}
                                    </Text>
                                </View>
                                {coin.network && (
                                    <View style={[styles.networkBadge, { backgroundColor: theme.colors.primary }]}>
                                        <Text style={[textStyles.caption, { color: theme.colors.buttonText }]}>
                                            {coin.network}
                                        </Text>
                                    </View>
                                )}
                            </Pressable>
                        ))
                        ) : (
                            <View style={styles.loadingContainer}>
                                <Text style={[textStyles.subtitle, { color: theme.colors.secondaryText }]}>
                                    No hay monedas disponibles
                                </Text>
                            </View>
                        )}
                        
                    </ScrollView>
                </SafeAreaView>
            </Modal>

        </View>
    )
}

const styles = StyleSheet.create({
    coinSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        borderRadius: 10,
        marginTop: 10,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    selectedCoin: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 5,
    },
    qrContainer: {
        alignItems: 'center',
        marginVertical: 20,
        padding: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    walletContainer: {
        marginVertical: 10,
    },
    walletAddress: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginTop: 5,
        borderWidth: 0.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    transactionContainer: {
        marginTop: 15,
        paddingTop: 15,
        borderTopWidth: 0.5,
        borderTopColor: 'rgba(255, 255, 255, 0.2)',
    },
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 0.5
    },
    closeButton: {
        padding: 5,
    },
    coinList: {
        flex: 1,
    },
    coinListContent: {
        padding: 20,
        paddingBottom: 40,
    },
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
    }
})

export default Add
