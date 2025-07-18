import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/authContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Import transferApi
import { transferApi } from '../../api/transferApi'

// Home Screen
const Home = ({ navigation }) => {

    const { user } = useAuth()
    const { theme } = useTheme()

    // State
    const [latestTransactions, setLatestTransactions] = useState([])

    // Fetch latest transactions
    useEffect(() => {
        const fetchLatestTransactions = async () => {
            const result = await transferApi.getLatestTransactions({ take: 6 })
            if (result.success) {
                setLatestTransactions(result.data)
            } else {
                console.error('Error fetching latest transactions:', result.error)
            }
        }
        fetchLatestTransactions()
    }, [])

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <Text style={styles.title}>TopBar</Text>

                <Text style={styles.title}>Hi {user.name}!</Text>

                <Text style={styles.text}>balance ${user.balance}</Text>
                <Text style={styles.text}>Send Receive Buttons</Text>
                <Text style={styles.text}>Services Promotions</Text>
                <Text style={styles.text}>Latest Transactions</Text>

                {latestTransactions.map((transaction) => (
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
                ))}

                {user && (
                    <View style={styles.userInfo}>
                        <Text style={styles.userText}>Hello, {user.name} {user.lastname}!</Text>
                        <Text style={styles.userText}>Username: @{user.username}</Text>
                        <Text style={styles.userText}>Email: {user.email}</Text>
                        <Text style={styles.userText}>Balance: ${user.balance}</Text>
                        <Text style={styles.userText}>Phone: {user.phone}</Text>
                        {user.bio && <Text style={styles.userText}>Bio: {user.bio}</Text>}
                    </View>
                )}
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