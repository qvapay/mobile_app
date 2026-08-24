/**
 * Bundle de recursos de i18next: un JSON por dominio y por idioma, fusionados
 * como grupos top-level de un ÚNICO namespace — las claves se consumen como
 * `t('auth.login.title')`. Los 21 dominios existen desde el día uno (los aún
 * no migrados son `{}`): cada lote de migración solo toca SUS dos JSON, nunca
 * este archivo.
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
}

export default resources
