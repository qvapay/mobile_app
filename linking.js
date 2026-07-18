import { ROUTES } from './routes'

/**
 * React Navigation linking config, wired into NavigationContainer in App.tsx.
 *
 * Handles https://qvapay.com, https://www.qvapay.com and the qvapay:// custom
 * scheme:
 *   /p2p/:p2p_uuid → P2POffer (offer detail)
 *   /pay/:uuid     → Pay (merchant invoice)
 *   /home, /p2p    → tabs inside MainStack
 *
 * Links that arrive while unauthenticated are NOT resolved here — App.tsx's
 * `pendingDeepLinkRef` stashes the URL (see hooks/useAppNavigation) and
 * replays it with navigation.reset() right after login.
 */
const linking = {
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
