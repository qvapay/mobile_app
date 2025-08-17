import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Import transferApi
import { transferApi } from '../../api/transferApi'

// UI Particles
import QPTransaction from '../../ui/particles/QPTransaction'
import BalanceCard from '../../ui/BalanceCard'
import ActionButtons from '../../ui/ActionButtons'
import QPAvatar from '../../ui/particles/QPAvatar'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// Home Screen
const Home = ({ navigation }) => {

    // Context
    const { user } = useAuth()
    const { theme } = useTheme()
    const containerStyles = useContainerStyles(theme)
    const textStyles = useTextStyles(theme)

    // State
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [latestTransactions, setLatestTransactions] = useState([])
    const [latestSentTransfersUsers, setLatestSentTransfersUsers] = useState([])

    // Fetch latest transactions
    useEffect(() => {
        const fetchLatestTransactions = async () => {
            try {
                setIsLoading(true)
                const result = await transferApi.getLatestTransactions({ take: 6 })
                if (result.success) {
                    setLatestTransactions(result.data)
                } else { console.error('Error fetching latest transactions:', result.error) }
            } catch (error) {
                console.error('Error fetching latest transactions:', error)
            } finally { setIsLoading(false) }
        }
        fetchLatestTransactions()
    }, [])

    // Get latest sent transfers users
    useEffect(() => {
        const fetchLatestSentTransfersUsers = async () => {
            try {
                const result = await transferApi.getLatestSentTransfers(10)
                if (result.success) {
                    // filter out users with no image
                    const users = result.data.filter(user => user.image)
                    setLatestSentTransfersUsers(users)
                } else { console.error('Error fetching latest sent transfers:', result.error) }
            } catch (error) { console.error('Error fetching latest sent transfers:', error) }
            finally { setIsLoading(false) }
        }
        fetchLatestSentTransfersUsers()
    }, [])

    return (
        <View style={[containerStyles.subContainer]}>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <BalanceCard balance={user.balance} />

                <ActionButtons navigation={navigation} />

                <View style={{ marginVertical: 10, gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Pago rápido</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Text style={[textStyles.h6, { color: theme.colors.primary }]}>Ver todas</Text>
                            <FontAwesome6 name="arrow-right" size={10} color={theme.colors.primary} iconStyle="solid" />
                        </View>
                    </View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 0 }}
                        style={{ marginVertical: 5 }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ backgroundColor: theme.colors.elevation, height: 56, width: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }}>
                                <FontAwesome6 name="plus" size={24} color={theme.colors.primary} iconStyle="solid" />
                            </View>
                            {latestSentTransfersUsers.map((user, index) => (
                                <QPAvatar key={index} user={user} size={56} />
                            ))}
                        </View>
                    </ScrollView>
                </View>

                <View style={{ marginVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={[textStyles.h5, { color: theme.colors.tertiaryText }]}>Últimas transacciones</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Text style={[textStyles.h6, { color: theme.colors.primary }]} onPress={() => navigation.navigate(ROUTES.TRANSACTIONS)}>Ver todas</Text>
                            <FontAwesome6 name="arrow-right" size={10} color={theme.colors.primary} iconStyle="solid" />
                        </View>
                    </View>
                    {latestTransactions.map((transaction, index) => (
                        <QPTransaction key={transaction.uuid} transaction={transaction} navigation={navigation} index={index} totalItems={latestTransactions.length} />
                    ))}
                </View>


            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 10,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 20,
        paddingBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 30,
        color: 'white',
    },
    text: {
        color: 'white',
        fontSize: 16,
        marginBottom: 10,
    },
    userInfo: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 20,
        borderRadius: 10,
        marginBottom: 30,
    },
    userText: {
        fontSize: 16,
        marginBottom: 5,
        textAlign: 'center',
        fontFamily: 'Rubik-Black',
    },
})

export default Home