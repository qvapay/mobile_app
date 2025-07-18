import React, { useState } from 'react'
import { View, Text, StyleSheet, Button, Alert, ScrollView } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/authContext'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'

// Home Screen
const Home = ({ navigation }) => {

    const { theme } = useTheme()
    const { user, logout } = useAuth()
    const [isLoading, setIsLoading] = useState(false)

    const handleLogout = async () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true)
                        const result = await logout()
                        setIsLoading(false)
                        if (!result.success) { Alert.alert('Error', 'Failed to logout. Please try again.') }
                    }
                }
            ]
        )
    }

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
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

                <Button
                    title={isLoading ? "Logging out..." : "Logout"}
                    onPress={handleLogout}
                    disabled={isLoading}
                />
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1C', // Dark theme background
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