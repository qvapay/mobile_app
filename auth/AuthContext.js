import { createContext, useContext, useState, useEffect, useRef } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

// API
import { authApi } from '../api/authApi'
import { userApi } from '../api/userApi'
import { setAuthToken, removeAuthToken, getAuthToken } from '../api/client'

// OneSignal Push Notifications
import { OneSignal } from 'react-native-onesignal'

// Create the Auth Context
const AuthContext = createContext()

// Storage keys
const STORAGE_KEYS = {
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Track consecutive token check failures to distinguish transient network errors from invalid tokens
	const tokenCheckFailures = useRef(0)
	const MAX_TOKEN_FAILURES = 2

	// Effect to check token validity periodically
	// Check token every 30 seconds
	useEffect(() => {
		if (isAuthenticated && token) {
			const interval = setInterval(async () => {
				try {
					const isValid = await authApi.checkToken(token)
					if (isValid.success) {
						tokenCheckFailures.current = 0
					} else {
						tokenCheckFailures.current += 1
						if (tokenCheckFailures.current >= MAX_TOKEN_FAILURES) {
							tokenCheckFailures.current = 0
							await logout()
						}
					}
				} catch (error) {
					tokenCheckFailures.current += 1
					if (tokenCheckFailures.current >= MAX_TOKEN_FAILURES) {
						tokenCheckFailures.current = 0
						await logout()
					}
				}
			}, 30000)
			return () => clearInterval(interval)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isAuthenticated, token])

	// Initialize authentication state from storage
	// Migrates legacy AsyncStorage token to Keychain on first run
	// If token is found, validates against API
	const initializeAuth = async () => {

		try {

			setIsLoading(true)
			const saved_token = await getAuthToken()

			if (saved_token) {

				const apiResponse = await authApi.checkToken()
				if (apiResponse.success) {
					setToken(saved_token)
					setIsAuthenticated(true)
					const userData = await userApi.getUserProfile()
					if (userData.success && userData.data) {
						setUser(userData.data)
						// Re-register with OneSignal on app restart
						OneSignal.login(userData.data.uuid)
					} else {
						await clearAuthData()
						setUser(null)
						setToken(null)
						setIsAuthenticated(false)
					}
				} else { setIsAuthenticated(false) }

			} else {
				await clearAuthData()
				setUser(null)
				setToken(null)
				setIsAuthenticated(false)
			}

		} catch (error) { setError('Failed to initialize authentication') }
		finally { setIsLoading(false) }
	}

	// Login function, we ask to the API for authentication
	// If authentication is successful, we store the token and user data in storage and state
	const login = async (credentials) => {

		try {

			setError(null)

			// Call QvaPay API for authentication
			const apiResponse = await authApi.login(credentials)

			if (!apiResponse.success) {
				setError(apiResponse.error || 'Login failed')
				return { success: false, error: apiResponse.error, details: apiResponse.details, status: apiResponse.status, action: apiResponse.action }
			}

			// If Prelogin is successful, we return the status and success
			if (apiResponse.status === 202) { return { success: true, status: apiResponse.status, notified: apiResponse.notified, has_otp: apiResponse.has_otp } }

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

			// Register user with OneSignal for targeted push notifications
			OneSignal.login(userData.uuid)
			OneSignal.User.addTags({
				kyc: userData.kyc ? 'true' : 'false',
				vip: userData.vip ? 'true' : 'false',
				golden_check: userData.golden_check ? 'true' : 'false',
			})

			return { success: true, security_warning: apiResponse.security_warning || null }

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

			if (token) {
				try { await authApi.logout() }
				catch (apiError) { /* API logout failed */ }
			}

			// Unlink user from OneSignal push notifications
			OneSignal.logout()

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
		} catch (error) { /* error clearing auth data */ }
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
