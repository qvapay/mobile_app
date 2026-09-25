/**
 * Contrato ruta → params de React Navigation, reconstruido de la arqueología
 * de todos los navigate()/push()/reset()/replace() y lecturas de route.params
 * del repo (2026-08-25). Las claves son los VALORES de routes.ts.
 *
 * La declaración global de abajo hace que useNavigation() quede tipado en toda
 * la app sin genéricos explícitos.
 *
 * Discrepancias reales detectadas (documentadas aquí, NO arregladas — son
 * runtime pre-existente):
 * - `Transaction`: el tap de push OneSignal manda `{ uuid }` pero la pantalla
 *   solo lee `transaction` — ese camino llega con transaction undefined.
 * - `SendSuccess`: se mandan `amount`/`recipient` pero solo se lee `description`.
 * - `P2PUser.initialTab` y `MarketStores.category`: se leen, nadie los manda.
 * - `MarketProduct.slug`: llega por deep link, nunca se lee.
 */
import type { NavigatorScreenParams } from '@react-navigation/native'
import type { WalletTx } from './domain'
import type { Coin, EnergyDuration, EnrichedCoin, Transaction } from './domain'

/** Metadatos de país que viajan a las pantallas de marca (forma variable: catálogo completo o `{ code, ...country_meta }`). */
export type CountryParam = { code?: string } & Record<string, unknown>

/** Tabs dentro de MainStack (screens/MainStack.jsx). */
export type MainTabParamList = {
	Home: undefined
	Crypto: undefined
	Keypad: undefined
	/** Preselección de moneda al saltar desde Crypto/CoinDetail. */
	P2P: { coin?: string, coinName?: string } | undefined
	Store: undefined
}

/** Subpanels de Ajustes (screens/settings/SettingsStack.jsx) — ninguna lee params. */
export type SettingsStackParamList = {
	SettingsMenu: undefined
	GoldCheck: undefined
	Referals: undefined
	Theme: undefined
	FontSize: undefined
	Language: undefined
	Userdata: undefined
	Phone: undefined
	Telegram: undefined
	Password: undefined
	TwoFactor: undefined
	Biometrics: undefined
	KYC: undefined
	DeleteAccount: undefined
	Notifications: undefined
	PaymentMethods: undefined
	Contacts: undefined
	AppLock: undefined
	Passkeys: undefined
	Roundup: undefined
	/** Oculta: solo con flag self-custody o en dev (plan crypto). */
	RpcNodes: undefined
	/** Oculta como RpcNodes: direcciones, ver frase y eliminar wallet (gate PIN). */
	WalletSettings: undefined
	Enterprise: undefined
	EnterpriseRegister: undefined
}

export type RootStackParamList = {

	// ── Arranque / onboarding ──────────────────────────────────────────────
	Onboard: undefined
	Welcome: undefined
	MainStack: NavigatorScreenParams<MainTabParamList> | undefined

	// ── Auth ───────────────────────────────────────────────────────────────
	Login: undefined
	Register: undefined
	/** OBLIGATORIO: RecoverPassword.jsx lee route.params.email sin guard. */
	RecoverPassword: { email: string }
	Recover2FA: undefined

	// ── Dinero: enviar / recibir / pagar ──────────────────────────────────
	/** `user_uuid` admite uuid O username (Scan manda username en QR de perfil). */
	Send: { user_uuid?: string, send_amount?: string } | undefined
	SendConfirm: { user_uuid: string, send_amount: string, description?: string }
	/** `amount`/`recipient` se mandan pero la pantalla solo lee `description`. */
	SendSuccess: { amount?: string, recipient?: Record<string, unknown>, description?: string } | undefined
	Receive: { receive_amount?: string } | undefined
	NearbyPay: { prefill_amount?: string } | undefined
	Pay: { uuid: string }
	/** `returnTo`: una dirección escaneada vuelve a esa pantalla por params (WalletSend). */
	Scan: { view?: 'scan' | 'show', returnTo?: 'WalletSend', assetId?: string } | undefined

	// ── Transacciones ─────────────────────────────────────────────────────
	Transactions: { showSearch?: boolean } | undefined
	/** `uuid` solo lo manda el push de OneSignal y la pantalla no lo lee (bug documentado). */
	Transaction: { transaction?: Transaction, uuid?: string }

	// ── Depósito / retiro ─────────────────────────────────────────────────
	/** `preselectedCoin`: tick del catálogo, para llegar con la moneda ya elegida. */
	Add: { preselectedCoin?: string } | undefined
	/** `prefillAddress`: destino ya escrito (retiro hacia la propia wallet self-custody, destino 'personal'). */
	Withdraw: { preselectedCoin?: string, lnInvoice?: string, lnAmountSats?: number | string, prefillAddress?: string } | undefined

	// ── P2P ───────────────────────────────────────────────────────────────
	P2POffer: { p2p_uuid: string }
	/** `initialTab` está implementado en la pantalla pero ningún call site lo manda aún. */
	P2PUser: { uuid: string, initialTab?: 'offers' | 'reviews' | 'stats' }
	P2PCreate: undefined

	// ── Crypto ────────────────────────────────────────────────────────────
	Savings: { action?: 'deposit' | 'withdraw', savings?: Record<string, unknown> } | undefined
	StockDetail: {
		symbol: string
		name?: string
		icon?: string
		iconStyle?: string
		image?: unknown
		initialData?: Record<string, unknown>
	}
	CoinDetail: { tick: string, name?: string, initialData?: Coin | EnrichedCoin }

	// ── Wallet self-custody (branch crypto) ───────────────────────────────
	WalletOnboarding: undefined
	/** El mnemonic NUNCA viaja por params: Backup lo crea/lee él mismo (quiz interno). */
	WalletBackup: undefined
	WalletImport: undefined
	/** `assetId` = `${chainKey}:native` | `${chainKey}:${contract}` (wallet/assets.ts). */
	WalletAsset: { assetId: string }
	/** Sin assetId abre el selector de activo. */
	WalletReceive: { assetId?: string } | undefined
	WalletManageAssets: undefined
	/** Sin assetId abre el selector; `address` la trae el escáner de vuelta. */
	WalletSend: { assetId?: string, address?: string } | undefined
	/** `amount` en decimal humano ya validado por WalletSend. */
	/**
	 * `exchangeUuid`: el envío es el depósito de un intercambio, así que al confirmarse
	 * vuelve a su seguimiento y no a la pantalla de éxito genérica — el envío no es el final
	 * de nada, es el principio del cambio.
	 */
	WalletSendConfirm: { assetId: string, to: string, amount: string, exchangeUuid?: string }
	WalletSendSuccess: { assetId: string, txid: string, amount: string, to: string }
	/** Movimiento ya cargado en la actividad (serializable): no se vuelve a pedir. */
	WalletTxDetail: { assetId: string, tx: WalletTx }
	/** Swap saldo ↔ QUSD; `direction` preselecciona el sentido (out = saldo → wallet). */
	/** `assetId`: se llega desde la pantalla de ese activo, que pasa a ser el lado que entrega. */
	WalletSwap: { direction?: 'out' | 'in', assetId?: string } | undefined
	WalletSwapStatus: { uuid: string }
	/** Seguimiento de un intercambio cripto↔cripto. */
	WalletExchangeStatus: { uuid: string }
	WalletExchanges: undefined
	/** Recursos TRON y alquiler de energía; los params preseleccionan la compra. */
	WalletEnergy: { address?: string, duration?: EnergyDuration } | undefined
	WalletEnergyOrders: undefined

	// ── Store: recargas y gift cards ──────────────────────────────────────
	PhoneTopupIndex: { country?: string } | undefined
	PhoneTopupBrand: { country?: CountryParam, countryCode?: string, brandSlug?: string } | undefined
	Topup: undefined
	GiftCards: { category?: string } | undefined
	GiftCardBrand: { country?: CountryParam, countryCode?: string, brandSlug?: string } | undefined
	MyPurchases: undefined
	PurchaseDetail: { purchaseId: number | string }

	// ── Marketplace (Seller Shops) ────────────────────────────────────────
	/** `category` se lee pero ningún call site lo manda aún. */
	MarketStores: { category?: string } | undefined
	MarketStore: { slug: string }
	/** `slug` llega por el deep link store/:slug/:uuid pero la pantalla solo lee `uuid`. */
	MarketProduct: { uuid: string, slug?: string }
	MarketCart: undefined
	MarketOrders: undefined
	MarketOrderDetail: { order: Record<string, unknown> }

	// ── Assisted Shopping (Personal Shopper) ──────────────────────────────
	/** Dos formas mutuamente excluyentes: producto ya resuelto o uuid a fetchear. */
	AssistedProduct: { product?: Record<string, unknown>, uuid?: string } | undefined
	AssistedShopping: undefined
	AssistedCart: undefined
	AssistedCheckout: undefined
	AssistedOrders: undefined
	/** OJO: AssistedOrders manda un order id; AssistedCheckout (replace) manda un cart_id. */
	AssistedOrderDetail: { id: number | string }

	// ── Settings ──────────────────────────────────────────────────────────
	SettingsStack: NavigatorScreenParams<SettingsStackParamList> | undefined
	/** También registrado dentro de SettingsStack (copia anidada). */
	GoldCheck: undefined
	Contacts: undefined

	// ── Otros ─────────────────────────────────────────────────────────────
	Help: undefined
}

// Tipado global: useNavigation() y linking quedan tipados en toda la app.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace ReactNavigation {
		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface RootParamList extends RootStackParamList { }
	}
}
