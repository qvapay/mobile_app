import { createContext, useContext, useState, useEffect } from 'react'

// Keychain and Async Storage
// import * as Keychain from 'react-native-keychain'
import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'
import { setAuthToken, removeAuthToken, getAuthToken } from '../api/client'

// Create the Auth Context
const AuthContext = createContext()

// Storage keys
const STORAGE_KEYS = {
    TOKEN: 'token',
    USER_DATA: 'user_data'
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
                // const isValid = await authApi.checkToken(token)
                // if (!isValid.success) { await logout() }
                try {
                    const isValid = await authApi.checkToken(token)
                    if (!isValid.success) { await logout() }
                } catch (error) { await logout() }
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
            const saved_token = await getAuthToken()
            if (saved_token) {

                // Check token against API for validity
                const apiResponse = await authApi.checkToken()
                if (apiResponse.success) {

                    setToken(saved_token)
                    setIsAuthenticated(true)

                    // Get user data from API
                    const userData = await userApi.getUserProfile()
                    if (userData.success && userData.data) {
                        setUser(userData.data)
                    } else { await logout() }

                } else { setIsAuthenticated(false) }

            } else { setIsAuthenticated(false) }

        } catch (error) {
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

            console.log('🔐 Login response:', apiResponse)

            if (!apiResponse.success) {
                setError(apiResponse.error || 'Login failed')
                return { success: false, error: apiResponse.error, details: apiResponse.details }
            }

            // If Prelogin is successful, we return the status and success
            if (apiResponse.status === 202) { return { success: true, status: apiResponse.status, notified: apiResponse.notified } }

            // Extract data from API response
            const { accessToken, me } = apiResponse

            // Map user data from API response
            const userData = {
                uuid: me.uuid,
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
                vip: me.vip,
                golden_check: me.golden_check,
                golden_expire: me.golden_expire,
                p2p_enabled: me.p2p_enabled,
                cover_photo_url: me.cover_photo_url,
                image: me.image,
                average_rating: me.average_rating,
                role: me.role,
            }

            // Store user data and auth status
            await Promise.all([
                AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData)),
                setAuthToken(accessToken), // Use API client's token storage
            ])

            // Update state
            setUser(userData)
            setToken(accessToken)
            setIsAuthenticated(true)

            return { success: true }

        } catch (error) {
            setError('Login failed. Please try again.')
            return { success: false, error: error.message, details: error.details }
        } finally { setIsLoading(false) }
    }


    // Request PIN function, we call the API to request a PIN
    const requestPin = async (credentials) => {

        try {

            setError(null)
            const apiResponse = await authApi.requestPin(credentials)

            if (apiResponse.success) {
                return { success: true, message: apiResponse.message }
            } else {
                setError(apiResponse.error)
                return { success: false, error: apiResponse.error }
            }
        }
        catch (error) {
            setError('Failed to request PIN')
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
            setError('Logout failed. Please try again.')
            return { success: false, error: error.message }
        } finally { setIsLoading(false) }
    }

    // Register function, we call the API to register and store the user data in storage and state
    const register = async (credentials) => {

        try {

            setError(null)

            const apiResponse = await authApi.register(credentials)
            if (apiResponse.success) {

                // Return success response
                return {
                    success: true,
                    message: apiResponse.message,
                    user: apiResponse.user
                }

            } else {

                setError(apiResponse.error)

                return {
                    success: false,
                    error: apiResponse.error
                }
            }

        } catch (error) {
            setError('Registration failed. Please try again.')
            return {
                success: false,
                error: 'Registration failed. Please try again.'
            }
        } finally { setIsLoading(false) }
    }

    // Confirm registration function, we call the API to confirm the registration
    const confirmRegistration = async (credentials) => {
        try {
            const apiResponse = await authApi.confirmRegistration(credentials)
            if (apiResponse.success) {
                return { success: true, message: apiResponse.message }
            } else {
                setError(apiResponse.error)
                return { 
                    success: false, 
                    error: apiResponse.error,
                    details: apiResponse.details || {}
                }
            }
        }
        catch (error) {
            setError('Failed to confirm registration')
            return { 
                success: false, 
                error: error.message || 'Failed to confirm registration',
                details: {}
            }
        } finally { setIsLoading(false) }
    }

    // Clear all authentication data
    // Remove token, and user data
    const clearAuthData = async () => {
        try {
            await Promise.all([
                removeAuthToken(), // Use API client's token removal
                AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
            ])
        } catch (error) { console.warn('Error clearing auth data:', error) }
    }

    // Update user data in storage
    const updateUser = async (newUserData) => {
        try {
            const updatedUser = { ...user, ...newUserData }
            await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser))
            setUser(updatedUser)
            return { success: true }
        } catch (error) {
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
        register,
        updateUser,
        clearError,
        requestPin,
        confirmRegistration
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
