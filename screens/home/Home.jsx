import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles } from '../../theme/themeUtils'

// Import transferApi
import { transferApi } from '../../api/transferApi'

// UI Particles
import QPTransaction from '../../ui/particles/QPTransaction'
import BalanceCard from '../../ui/BalanceCard'
import ActionButtons from '../../ui/ActionButtons'

// Home Screen
const Home = ({ navigation }) => {

    // Context
    const { user } = useAuth()
    const { theme } = useTheme()
    const containerStyles = useContainerStyles(theme)

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
                } else {
                    console.error('Error fetching latest transactions:', result.error)
                }
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

                {latestTransactions.map((transaction) => (
                    <QPTransaction key={transaction.uuid} transaction={transaction} />
                ))}

                {/* {latestTransactions.map((transaction) => (
                    <View key={transaction.uuid} style={{ marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                        <Text style={[styles.text, { fontWeight: 'bold', fontSize: 18 }]}>
                            {transaction.description}
                        </Text>
                        <Text style={styles.text}>
                            Amount: <Text style={{ color: parseFloat(transaction.amount) < 0 ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>
                                {parseFloat(transaction.amount) < 0 ? '-' : '+'}${Math.abs(Number(transaction.amount))}
                            </Text>
                        </Text>
                        <Text style={styles.text}>
                            Status: <Text style={{ color: transaction.status === 'paid' ? '#2ecc71' : '#e67e22' }}>{transaction.status}</Text>
                        </Text>
                        <Text style={styles.text}>
                            Date: {new Date(transaction.created_at).toLocaleString()}
                        </Text>
                        {transaction.paid_by && (
                            <Text style={styles.text}>
                                From: {transaction.paid_by.name || transaction.paid_by.username}
                            </Text>
                        )}
                        {transaction.owner && (
                            <Text style={styles.text}>
                                To: {transaction.owner.name || transaction.owner.username}
                            </Text>
                        )}
                        {transaction.app && (
                            <Text style={styles.text}>
                                App: {transaction.app.name}
                            </Text>
                        )}
                    </View>
                ))} */}

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