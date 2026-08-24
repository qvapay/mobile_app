/**
 * Bundle de recursos de i18next: un JSON por dominio y por idioma, fusionados
 * como grupos top-level de un ÚNICO namespace — las claves se consumen como
 * `t('auth.login.title')`. Los 21 dominios existen desde el día uno (los aún
 * no migrados son `{}`): cada lote de migración solo toca SUS dos JSON, nunca
 * este archivo. Un idioma nuevo = carpeta en locales/ + su bloque aquí +
 * SUPPORTED_LANGUAGES/DATE_LOCALES en index.js + CFBundleLocalizations (iOS)
 * + locales_config.xml (Android) + opción en el panel de Idioma.
 */

// Español (idioma fuente — extracción verbatim de los literales del código)
import esAdd from './locales/es/add.json'
import esApi from './locales/es/api.json'
import esAssisted from './locales/es/assisted.json'
import esAuth from './locales/es/auth.json'
import esCommon from './locales/es/common.json'
import esErrors from './locales/es/errors.json'
import esHome from './locales/es/home.json'
import esHooks from './locales/es/hooks.json'
import esInvest from './locales/es/invest.json'
import esKeypad from './locales/es/keypad.json'
import esMarket from './locales/es/market.json'
import esMisc from './locales/es/misc.json'
import esNavigation from './locales/es/navigation.json'
import esP2p from './locales/es/p2p.json'
import esSettings from './locales/es/settings.json'
import esStore from './locales/es/store.json'
import esTopup from './locales/es/topup.json'
import esTransactions from './locales/es/transactions.json'
import esUi from './locales/es/ui.json'
import esWelcome from './locales/es/welcome.json'
import esWithdraw from './locales/es/withdraw.json'

// English
import enAdd from './locales/en/add.json'
import enApi from './locales/en/api.json'
import enAssisted from './locales/en/assisted.json'
import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enErrors from './locales/en/errors.json'
import enHome from './locales/en/home.json'
import enHooks from './locales/en/hooks.json'
import enInvest from './locales/en/invest.json'
import enKeypad from './locales/en/keypad.json'
import enMarket from './locales/en/market.json'
import enMisc from './locales/en/misc.json'
import enNavigation from './locales/en/navigation.json'
import enP2p from './locales/en/p2p.json'
import enSettings from './locales/en/settings.json'
import enStore from './locales/en/store.json'
import enTopup from './locales/en/topup.json'
import enTransactions from './locales/en/transactions.json'
import enUi from './locales/en/ui.json'
import enWelcome from './locales/en/welcome.json'
import enWithdraw from './locales/en/withdraw.json'

// Português (Brasil)
import ptAdd from './locales/pt/add.json'
import ptApi from './locales/pt/api.json'
import ptAssisted from './locales/pt/assisted.json'
import ptAuth from './locales/pt/auth.json'
import ptCommon from './locales/pt/common.json'
import ptErrors from './locales/pt/errors.json'
import ptHome from './locales/pt/home.json'
import ptHooks from './locales/pt/hooks.json'
import ptInvest from './locales/pt/invest.json'
import ptKeypad from './locales/pt/keypad.json'
import ptMarket from './locales/pt/market.json'
import ptMisc from './locales/pt/misc.json'
import ptNavigation from './locales/pt/navigation.json'
import ptP2p from './locales/pt/p2p.json'
import ptSettings from './locales/pt/settings.json'
import ptStore from './locales/pt/store.json'
import ptTopup from './locales/pt/topup.json'
import ptTransactions from './locales/pt/transactions.json'
import ptUi from './locales/pt/ui.json'
import ptWelcome from './locales/pt/welcome.json'
import ptWithdraw from './locales/pt/withdraw.json'

const resources = {
	es: {
		translation: {
			add: esAdd,
			api: esApi,
			assisted: esAssisted,
			auth: esAuth,
			common: esCommon,
			errors: esErrors,
			home: esHome,
			hooks: esHooks,
			invest: esInvest,
			keypad: esKeypad,
			market: esMarket,
			misc: esMisc,
			navigation: esNavigation,
			p2p: esP2p,
			settings: esSettings,
			store: esStore,
			topup: esTopup,
			transactions: esTransactions,
			ui: esUi,
			welcome: esWelcome,
			withdraw: esWithdraw,
		},
	},
	en: {
		translation: {
			add: enAdd,
			api: enApi,
			assisted: enAssisted,
			auth: enAuth,
			common: enCommon,
			errors: enErrors,
			home: enHome,
			hooks: enHooks,
			invest: enInvest,
			keypad: enKeypad,
			market: enMarket,
			misc: enMisc,
			navigation: enNavigation,
			p2p: enP2p,
			settings: enSettings,
			store: enStore,
			topup: enTopup,
			transactions: enTransactions,
			ui: enUi,
			welcome: enWelcome,
			withdraw: enWithdraw,
		},
	},
	pt: {
		translation: {
			add: ptAdd,
			api: ptApi,
			assisted: ptAssisted,
			auth: ptAuth,
			common: ptCommon,
			errors: ptErrors,
			home: ptHome,
			hooks: ptHooks,
			invest: ptInvest,
			keypad: ptKeypad,
			market: ptMarket,
			misc: ptMisc,
			navigation: ptNavigation,
			p2p: ptP2p,
			settings: ptSettings,
			store: ptStore,
			topup: ptTopup,
			transactions: ptTransactions,
			ui: ptUi,
			welcome: ptWelcome,
			withdraw: ptWithdraw,
		},
	},
}

export default resources
