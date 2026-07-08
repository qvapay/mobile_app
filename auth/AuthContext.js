import { createContext, use } from 'react'
import useAuthState from './useAuthState'

// Create the Auth Context
const AuthContext = createContext()

/**
 * Provides authentication state to the whole app.
 * A thin shell: all state and actions live in the `useAuthState` hook —
 * this component only mounts it once and exposes its return value.
 *
 * Sits near the top of the provider stack (see App.tsx), so anything that
 * needs `isAuthenticated` / `user` / `token` can call `useAuth()`.
 *
 * @param {{ children: React.ReactNode }} props
 */
export const AuthProvider = ({ children }) => {
	const value = useAuthState()
	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	)
}

/**
 * Consumes the auth context. Throws if used outside an `AuthProvider`.
 *
 * @returns {ReturnType<import('./useAuthState').default>} Session state
 *   (`isAuthenticated`, `user`, `token`, `isLoading`, `error`) and actions
 *   (`login`, `loginWithPasskey`, `logout`, `register`, `confirmRegistration`,
 *   `requestPin`, `updateUser`, `clearError`, `completeSession`).
 */
export const useAuth = () => {
	const context = use(AuthContext)
	if (!context) { throw new Error('useAuth must be used within an AuthProvider') }
	return context
}

// Export the context for direct access if needed
export { AuthContext }
