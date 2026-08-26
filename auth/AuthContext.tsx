import { createContext, use } from 'react'
import type { ReactNode } from 'react'
import useAuthState from './useAuthState'

/** Valor del contexto: exactamente lo que devuelve `useAuthState`. */
export type AuthContextValue = ReturnType<typeof useAuthState>

// Create the Auth Context
const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Provides authentication state to the whole app.
 * A thin shell: all state and actions live in the `useAuthState` hook —
 * this component only mounts it once and exposes its return value.
 *
 * Sits near the top of the provider stack (see App.tsx), so anything that
 * needs `isAuthenticated` / `user` / `token` can call `useAuth()`.
 *
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
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
 * @returns Session state (`isAuthenticated`, `user`, `token`, `isLoading`,
 *   `error`) and actions (`login`, `loginWithPasskey`, `logout`, `register`,
 *   `confirmRegistration`, `requestPin`, `updateUser`, `clearError`,
 *   `completeSession`).
 */
export const useAuth = (): AuthContextValue => {
	const context = use(AuthContext)
	if (!context) { throw new Error('useAuth must be used within an AuthProvider') }
	return context
}

// Export the context for direct access if needed
export { AuthContext }
