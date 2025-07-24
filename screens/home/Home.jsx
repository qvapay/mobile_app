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

    return (
        <View style={[containerStyles.subContainer]}>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <BalanceCard balance={user.balance} />

                <ActionButtons />

                <View style={{ marginVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={textStyles.h5}>Pago rápido</Text>
                        <Text style={[textStyles.h6, { color: theme.colors.primary }]}>Ver todas</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginVertical: 5 }}>
                        <QPAvatar user={user} size={48} />
                    </View>
                </View>

                <View style={{ marginVertical: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={textStyles.h5}>Últimas transacciones</Text>
                        <Text style={[textStyles.h6, { color: theme.colors.primary }]}>Ver todas</Text>
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