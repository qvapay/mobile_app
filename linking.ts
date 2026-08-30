import type { LinkingOptions } from '@react-navigation/native'
import { ROUTES } from './routes'
import type { RootStackParamList } from './types/navigation'

/**
 * React Navigation linking config, wired into NavigationContainer in App.tsx.
 *
 * Handles https://qvapay.com, https://www.qvapay.com and the qvapay:// custom
 * scheme:
 *   /p2p/:p2p_uuid → P2POffer (offer detail)
 *   /pay/:uuid     → Pay (merchant invoice)
 *   /store/:slug   → MarketStore (marketplace storefront)
 *   /store/:slug/:uuid → MarketProduct (public product sheet)
 *   /home, /p2p    → tabs inside MainStack
 *   /add, /withdraw, /send, /savings → accesos directos de los widgets
 *
 * Links that arrive while unauthenticated are NOT resolved here — App.tsx's
 * `pendingDeepLinkRef` stashes the URL (see hooks/useAppNavigation) and
 * replays it with navigation.reset() right after login.
 */
const linking: LinkingOptions<RootStackParamList> = {
	prefixes: [
		'https://qvapay.com',
		'https://www.qvapay.com',
		'qvapay://',
	],
	config: {
		screens: {
			[ROUTES.P2P_OFFER_SCREEN]: 'p2p/:p2p_uuid',
			[ROUTES.PAY_SCREEN]: 'pay/:uuid',
			[ROUTES.TOPUP_SCREEN]: 'topup',
			// Accesos directos de los widgets de pantalla de inicio: los botones
			// mandan qvapay://add|withdraw|send|savings y sin estas entradas la app
			// abria en el Home sin navegar a ningun sitio
			[ROUTES.ADD]: 'add',
			[ROUTES.WITHDRAW]: 'withdraw',
			[ROUTES.SEND]: 'send',
			[ROUTES.SAVINGS_SCREEN]: 'savings',
			// El patrón de producto (2 segmentos) va antes que el de tienda (1)
			[ROUTES.MARKET_PRODUCT]: 'store/:slug/:uuid',
			[ROUTES.MARKET_STORE]: 'store/:slug',
			[ROUTES.MAIN_STACK]: {
				screens: {
					[ROUTES.HOME_SCREEN]: 'home',
					[ROUTES.P2P_SCREEN]: 'p2p',
				},
			},
		},
	},
}

export default linking
