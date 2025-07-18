import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/authContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Import transferApi


// Home Screen
const Home = ({ navigation }) => {

    const { user } = useAuth()
    const { theme } = useTheme()

    const latestTransactions = []

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <Text style={styles.title}>TopBar</Text>

                <Text style={styles.title}>Hi {user.name}!</Text>

                <Text style={styles.text}>balance</Text>
                <Text style={styles.text}>Send Receive Buttons</Text>
                <Text style={styles.text}>Services Promotions</Text>
                <Text style={styles.text}>Latest Transactions</Text>

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
        paddingHorizontal: 20,
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