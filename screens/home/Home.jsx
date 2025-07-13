import React from 'react'
import { View, Text, StyleSheet, Button, Alert } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/authContext'

// Home Screen
const HomeScreen = ({ navigation }) => {

    const { user, logout, isLoading } = useAuth()

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
                        const result = await logout()
                        if (!result.success) { Alert.alert('Error', 'Failed to logout. Please try again.') }
                    }
                }
            ]
        )
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Welcome to QvaPay!</Text>

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
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        justifyContent: 'center',
        backgroundColor: 'blue',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 30,
        color: 'white',
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
    },
})

export default HomeScreen