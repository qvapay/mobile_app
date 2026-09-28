// Ruta raíz de la app según sesión, onboarding y wallet self-custody. PURO
// (sin react-native): la comparten el initialRouteName de AppNavigator y la
// reconciliación de useAppNavigation, y se testea en el entorno node.
import { ROUTES } from '../routes'

export type RootRoute =
	| typeof ROUTES.ONBOARD_SCREEN
	| typeof ROUTES.MAIN_STACK
	| typeof ROUTES.WALLET_ONLY
	| typeof ROUTES.WELCOME_SCREEN

type RootRouteInput = { firstTime: boolean, isAuthenticated: boolean, hasWallet: boolean }

/**
 * Decide la raíz del stack. Sin sesión pero con wallet en el teléfono se entra
 * en el "modo wallet" (WalletOnly): la seed no es de la cuenta, así que ni
 * crearla sin registrarse ni cerrar sesión deben esconderla tras el Welcome.
 *
 * @param input - Flags ya hidratados (splash, settings y wallet listos).
 * @returns Nombre de la ruta raíz.
 */
export const resolveRootRoute = ({ firstTime, isAuthenticated, hasWallet }: RootRouteInput): RootRoute => {
	if (firstTime) return ROUTES.ONBOARD_SCREEN
	if (isAuthenticated) return ROUTES.MAIN_STACK
	return hasWallet ? ROUTES.WALLET_ONLY : ROUTES.WELCOME_SCREEN
}
