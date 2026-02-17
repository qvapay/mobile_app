import { ROUTES } from './routes'

const linking = {
	prefixes: [
		'https://qvapay.com',
		'https://www.qvapay.com',
		'qvapay://',
	],
	config: {
		screens: {
			[ROUTES.P2P_OFFER_SCREEN]: 'p2p/:p2p_uuid',
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
