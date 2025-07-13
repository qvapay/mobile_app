import React, { createContext, useContext, useState, useEffect } from 'react'

// Keychain and Async Storage
// import * as Keychain from 'react-native-keychain'
import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { authApi } from './authApi'

// Create the Auth Context
const AuthContext = createContext()

// Storage keys
const STORAGE_KEYS = {
    TOKEN: 'token',
    USER_DATA: 'user_data',
    FIRST_TIME_USER: 'first_time_user'
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

    // Effect to check token validity periodically
    useEffect(() => {
        if (isAuthenticated && token) {
            // Check token every 30 seconds
            const interval = setInterval(async () => {
                const isValid = await authApi.checkToken(token)
                if (!isValid.success) {
                    console.log('🔄 Token expired - closing session')
                    await logout()
                }
            }, 30000) // 30 seconds
            return () => clearInterval(interval)
        }
    }, [isAuthenticated, token])

    // Initialize authentication state from storage
    // This is the initial function to check if the user is authenticated
    // If Token is found, check agains API if the token is valid
    // If token is valid, set isAuthenticated to true
    const initializeAuth = async () => {

        try {

            // Set loading to true and we show a loading screen
            setIsLoading(true)

            // Check if user is authenticated, retrieve token from storage
            const saved_token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN)
            if (saved_token) {

                // If token found, check if its valid

                // Load user data and tokens
                // const [userData, firstTimeUser] = await Promise.all([
                //     AsyncStorage.getItem(STORAGE_KEYS.USER_DATA),
                //     AsyncStorage.getItem(STORAGE_KEYS.FIRST_TIME_USER),
                // ])

                // Check token against API for validity
                const apiResponse = await authApi.checkToken(saved_token)
                if (apiResponse.success) {
                    console.log('Token is valid')
                    setToken(saved_token)
                    setIsAuthenticated(true)

                    // Get user data from API
                    const userData = await authApi.getProfile(saved_token)
                    console.log('User data:', userData)
                    setUser(userData.me)

                } else {
                    console.log('Token is invalid')
                    setIsAuthenticated(false)
                }

            } else {
                // No auth status found, so set isAuthenticated to false and loading to false
                // This variable is used to show the splash screen and then, redirect to Welcome Screen
                setIsAuthenticated(false)
            }

        } catch (error) {
            console.error('Error initializing auth:', error)
            setError('Failed to initialize authentication')
        } finally { setIsLoading(false) }
    }

    // Login function, we ask to the API for authentication
    // If authentication is successful, we store the token and user data in storage and state
    const login = async (credentials) => {

        try {

            setError(null)

            // Call QvaPay API for authentication
            const apiResponse = await authApi.login(credentials)

            console.log('API Response:', apiResponse)

            if (!apiResponse.success) {
                setError(apiResponse.error || 'Login failed')
                return { success: false, error: apiResponse.error }
            }

            // Extract data from API response
            const { accessToken, me } = apiResponse

            console.log('API Response Access Token:', accessToken)
            console.log('API Response Me:', me)

            // Map user data from API response
            const userData = {
                id: me.uuid,
                email: credentials.email,
                username: me.username,
                name: me.name,
                lastname: me.lastname,
                two_factor_secret: me.two_factor_secret,
                bio: me.bio,
                balance: me.balance,
                satoshis: me.satoshis,
                phone: me.phone,
                phone_verified: me.phone_verified,
                kyc: me.kyc,
                golden_check: me.golden_check,
                golden_expire: me.golden_expire,
                p2p_enabled: me.p2p_enabled,
                complete_name: me.complete_name,
                cover_photo_url: me.cover_photo_url,
                profile_photo_url: me.profile_photo_url,
                average_rating: me.average_rating,
            }

            // Store user data and auth status
            await Promise.all([
                AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData)),
                AsyncStorage.setItem(STORAGE_KEYS.TOKEN, accessToken),
                AsyncStorage.setItem(STORAGE_KEYS.FIRST_TIME_USER, 'false'),
            ])

            // Update state
            setUser(userData)
            setToken(accessToken)
            setIsAuthenticated(true)

            return { success: true }

        } catch (error) {
            console.error('Login error:', error)
            setError('Login failed. Please try again.')
            return { success: false, error: error.message }
        } finally { setIsLoading(false) }
    }

    // Logout function, we call the API to logout and clear the storage
    const logout = async () => {

        try {

            // Call API logout if we have a token
            if (token) {
                try {
                    await authApi.logout()
                } catch (apiError) {
                    // Don't fail logout if API call fails
                    console.warn('API logout failed:', apiError.message)
                }
            }

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
    }

    // Clear all authentication data
    // Remove token, and user data
    const clearAuthData = async () => {
        try {
            await Promise.all([
                AsyncStorage.multiRemove([
                    STORAGE_KEYS.TOKEN,
                    STORAGE_KEYS.USER_DATA,
                ]),
            ])
        } catch (error) { console.error('Error clearing auth data:', error) }
    }

    // Update user data
    // Update user data in storage and state and production server
    const updateUser = async (newUserData) => {
        try {
            const updatedUser = { ...user, ...newUserData }

            // Update stored user data
            await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser))

            // Update state
            setUser(updatedUser)
            return { success: true }
        } catch (error) {
            console.error('Update user error:', error)
            setError('Failed to update user data')
            return { success: false, error: error.message }
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
