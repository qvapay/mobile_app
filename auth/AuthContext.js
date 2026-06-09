import { createContext, use } from 'react'
import useAuthState from './useAuthState'

// Create the Auth Context
const AuthContext = createContext()

// Auth Provider Component — state + actions live in the useAuthState hook
export const AuthProvider = ({ children }) => {
	const value = useAuthState()
	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	)
}

// Custom hook to use the auth context
export const useAuth = () => {
	const context = use(AuthContext)
	if (!context) { throw new Error('useAuth must be used within an AuthProvider') }
	return context
}

// Export the context for direct access if needed
export { AuthContext }
