import React, { createContext, useContext, useState, useEffect } from 'react'

// Keychain and Async Storage
import * as Keychain from 'react-native-keychain'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Create the Auth Context
const AuthContext = createContext()

// Storage keys
const STORAGE_KEYS = {
    USER_TOKEN: 'user_token',
    USER_DATA: 'user_data',
    IS_AUTHENTICATED: 'is_authenticated',
}

// Auth Provider Component
export const AuthProvider = ({ children }) => {

    // State for the auth context
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [user, setUser] = useState(null)
    const [token, setToken] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    // Initialize auth state on app start
    useEffect(() => {
        initializeAuth()
    }, [])

    // Initialize authentication state from storage
    const initializeAuth = async () => {
        try {
            setIsLoading(true)

            // Check if user is authenticated
            const authStatus = await AsyncStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED);
            if (authStatus === 'true') {

                // Load user data and tokens
                const [userData, userToken] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.USER_DATA),
                    Keychain.getInternetCredentials(STORAGE_KEYS.USER_TOKEN)
                ])

                if (userData && userToken) {
                    setUser(JSON.parse(userData))
                    setToken(userToken.password)
                    setIsAuthenticated(true)
                } else {
                    // Clear invalid data
                    await clearAuthData()
                }
            }

        } catch (error) {
            console.error('Error initializing auth:', error)
            setError('Failed to initialize authentication')
        } finally {
            setIsLoading(false)
        }
    }

    // Login function
    const login = async (credentials) => {

        try {
            setIsLoading(true)
            setError(null)

            // Here you would typically make an API call to authenticate
            // For now, we'll simulate a successful login
            const mockUserData = {
                id: '1',
                email: credentials.email,
                name: 'John Doe',
                avatar: null,
            }

            const mockToken = 'mock_jwt_token_' + Date.now()
            const mockRefreshToken = 'mock_refresh_token_' + Date.now()

            // Store tokens securely in keychain
            await Promise.all([
                Keychain.setInternetCredentials(STORAGE_KEYS.USER_TOKEN, credentials.email, mockToken),
                Keychain.setInternetCredentials(STORAGE_KEYS.REFRESH_TOKEN, credentials.email, mockRefreshToken),
            ])

            // Store user data and auth status
            await Promise.all([
                AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(mockUserData)),
                AsyncStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, 'true'),
            ])

            // Update state
            setUser(mockUserData)
            setToken(mockToken)
            setIsAuthenticated(true)

            return { success: true }
        } catch (error) {
            console.error('Login error:', error)
            setError('Login failed. Please try again.')
            return { success: false, error: error.message }
        } finally {
            setIsLoading(false)
        }
    }

    // Logout function
    const logout = async () => {
        try {
            setIsLoading(true)

            // Clear all stored data
            await clearAuthData()

            // Reset state
            setUser(null)
            setToken(null)
            setIsAuthenticated(false)
            setError(null)

            return { success: true }
        } catch (error) {
            console.error('Logout error:', error)
            setError('Logout failed. Please try again.')
            return { success: false, error: error.message }
        } finally {
            setIsLoading(false)
        }
    };

    // Clear all authentication data
    const clearAuthData = async () => {
        try {
            await Promise.all([
                Keychain.resetInternetCredentials(STORAGE_KEYS.USER_TOKEN),
                Keychain.resetInternetCredentials(STORAGE_KEYS.REFRESH_TOKEN),
                AsyncStorage.multiRemove([
                    STORAGE_KEYS.USER_DATA,
                    STORAGE_KEYS.IS_AUTHENTICATED,
                ]),
            ])
        } catch (error) { console.error('Error clearing auth data:', error) }
    }

    // Update user data
    const updateUser = async (newUserData) => {
        try {
            const updatedUser = { ...user, ...newUserData }

            // Update stored user data
            await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser))

            // Update state
            setUser(updatedUser)
            return { success: true }
        } catch (error) {
            console.error('Update user error:', error);
            setError('Failed to update user data');
            return { success: false, error: error.message };
        }
    }

    // Clear error
    const clearError = () => { setError(null) }

    // Context value
    const value = {
        // State
        isAuthenticated,
        user,
        token,
        isLoading,
        error,

        // Functions
        login,
        logout,
        updateUser,
        clearError,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

// Custom hook to use the auth context
export const useAuth = () => {
    const context = useContext(AuthContext)
    if (!context) { throw new Error('useAuth must be used within an AuthProvider') }
    return context
}

// Export the context for direct access if needed
export { AuthContext }
