/**
 * Tipos de dominio del backend QvaPay, derivados de los campos que el cliente
 * consume realmente (no del schema completo de Prisma): si un campo no se lee
 * en ninguna pantalla, no está aquí. Ampliar según se migren consumidores.
 *
 * Convención transversal: los decimales de Laravel/Prisma viajan como STRING
 * ("10.50") y a veces como number — todo el cliente los envuelve en
 * `Number()`/`parseFloat()` antes de operar. De ahí el alias `Decimal`.
 */

/** Decimal del backend: string ("10.50") o number según el endpoint. Operar siempre vía Number()/parseFloat(). */
export type Decimal = string | number

/** Booleano de MySQL: llega como 0/1 (p. ej. P2POffer.only_vip). */
export type BoolInt = 0 | 1

// ---------------------------------------------------------------------------
// User / sesión
// ---------------------------------------------------------------------------

/** Señal de UI del KYC (pending = Didit en revisión); el flag autoritativo de gating es `kyc`. */
export type KycStatus = 'none' | 'pending' | 'approved' | 'declined' | (string & {})

/**
 * Payload `me` de los endpoints de auth (login 200, passkey, registro).
 * El índice `unknown` absorbe campos que el backend añada sin romper.
 */
export type Me = {
	uuid: string
	username?: string
	email?: string
	name?: string
	lastname?: string
	two_factor_secret?: string | null
	bio?: string | null
	balance?: Decimal
	satoshis?: number
	phone?: string | null
	phone_verified?: boolean | BoolInt
	kyc?: boolean | BoolInt
	kyc_status?: KycStatus
	telegram_id?: string | number | null
	trustscore?: number
	createdAt?: string
	vip?: boolean | BoolInt
	golden_check?: boolean | BoolInt
	golden_expire?: string | null
	p2p_enabled?: boolean | BoolInt
	cover?: string | null
	image?: string | null
	average_rating?: number
	role?: string
} & Record<string, unknown>

/**
 * Perfil local del usuario: lo que guarda `mapMeToUser` (auth/useAuthState)
 * más el perfil completo de `/user/extended` que lo sobreescribe después.
 * TODO opcional a propósito: puede venir de caché parcial o de merges
 * (`updateUser` mezcla campos sueltos).
 */
export type User = {
	uuid?: string
	email?: string
	username?: string
	name?: string
	lastname?: string
	two_factor_secret?: string | null
	bio?: string | null
	balance?: Decimal
	satoshis?: number
	phone?: string | null
	phone_verified?: boolean | BoolInt
	kyc?: boolean | BoolInt
	kyc_status?: KycStatus
	telegram_id?: string | number | null
	trustscore?: number
	created_at?: string
	vip?: boolean | BoolInt
	golden_check?: boolean | BoolInt
	golden_expire?: string | null
	p2p_enabled?: boolean | BoolInt
	cover?: string | null
	cover_photo_url?: string | null
	image?: string | null
	average_rating?: number
	role?: string
} & Record<string, unknown>

// ---------------------------------------------------------------------------
// Coins (`GET /coins/v2`)
// ---------------------------------------------------------------------------

/** Campo del formulario de destino de un retiro (columna Json `working_data`). */
export type CoinWorkingField = {
	/** Clave del campo y a la vez label visible. */
	name: string
	type?: 'text' | 'number' | 'select'
	options?: { value: string | number, fee_pct?: Decimal }[]
}

export type Coin = {
	tick: string
	name: string
	/** Slug del logo: media.qvapay.com/coins/{logo}.svg */
	logo: string
	id?: number
	network?: string | null
	/** `Number(...) === 1` ⇒ criptomoneda (el backend lo añadió tarde: opcional). */
	coins_categories_id?: number | string

	price: Decimal
	/** true ⇒ estable, no se convierte por precio. */
	stable?: boolean
	decimals?: number

	fee_in?: Decimal
	fee_out?: Decimal
	fee_in_gold?: Decimal
	fee_out_gold?: Decimal
	/** Columna Json: number, tupla [umbral, fijo], string JSON o null. */
	fee_out_fixed?: number | [Decimal, Decimal] | string | null
	min_in?: Decimal
	min_out?: Decimal

	// CoinDetail trata `undefined` como "sí" — opcionales de verdad
	enabled_in?: boolean
	enabled_out?: boolean
	enabled_p2p?: boolean

	/** Puede llegar YA parseada o como string JSON — los call-sites parsean condicionalmente. */
	working_data?: CoinWorkingField[] | string | null
}

/**
 * Coin enriquecida por el CLIENTE (investQueries/homeQueries): precio spot
 * sobrescrito + variación calculada contra el histórico. No viene del backend.
 */
export type EnrichedCoin = Coin & {
	change?: number
	changeDollar?: number
	/** Histórico crudo de `coinsApi.priceHistory`: puntos `{ time?, value }` (los sparklines leen `.value`). */
	priceHistory?: { time?: string | number, value: number }[]
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type TransactionStatus =
	| 'paid' | 'pending' | 'processing' | 'cancelled' | 'received'
	| 'completed' | 'open' | 'unpaid' | 'failed' | 'revision'
	| (string & {})

/** Usuario embebido en transacciones y quick-pay (subset del perfil). */
export type EmbeddedUser = {
	uuid: string
	username?: string
	name?: string
	image?: string | null
	vip?: boolean
}

export type TxWallet = {
	status: string
	value: Decimal
	received: Decimal
	wallet: string
	txid?: string | null
	created_at: string
	/** Forma detalle (minúsculas). */
	coin?: { logo: string, name: string }
	/** Forma lista (PascalCase). */
	Coin?: { logo?: string, tick?: string }
	wallet_type?: string
}

export type TxWithdraw = {
	status: string
	amount: Decimal
	receive: Decimal
	tx_id?: string | null
	/** Objeto o string JSON — el cliente parsea condicionalmente. */
	details?: object | string | null
	created_at: string
	coin?: { logo: string, name: string }
	payment_method?: string
}

export type TxP2P = {
	uuid: string
	status: string
	type: 'buy' | 'sell'
	amount: Decimal
	receive: Decimal
	coin?: { logo: string, name: string }
}

export type TxApp = {
	uuid: string
	name: string
	logo?: string
	desc?: string
}

export type TxService = {
	status: string
	amount: Decimal
	created_at: string
	service?: { name: string }
	service_data?: object | string
}

export type TxCart = {
	cancelled: boolean
	delivered: boolean
	purchased: boolean
	address?: string
	tracking_code?: string
	note?: string
	created_at: string
}

/**
 * Transacción. OJO con la asimetría del backend: la LISTA (`GET /transaction`)
 * entrega las relaciones en PascalCase (`User`, `PaidBy`, `Wallet`…) y el
 * DETALLE (`GET /transaction/{uuid}`) en minúsculas (`user`, `paid_by`…).
 * Transaction.jsx y Pay.jsx normalizan; aquí ambas formas son opcionales.
 */
export type Transaction = {
	uuid: string
	amount: Decimal
	/** Puede ser un sticker persistido (`:sticker:<name>.webm`). */
	description: string | null
	status: TransactionStatus
	created_at: string
	updated_at: string

	// Relaciones, forma LISTA (PascalCase)
	User?: EmbeddedUser | null
	PaidBy?: EmbeddedUser | null
	Wallet?: TxWallet | null
	Withdraw?: TxWithdraw | null
	App?: TxApp | null
	BuyedService?: object | null

	// Relaciones, forma DETALLE (minúsculas)
	user?: EmbeddedUser | null
	paid_by?: EmbeddedUser | null
	wallet?: TxWallet | null
	withdraw?: TxWithdraw | null
	app?: TxApp | null
	p2p?: TxP2P | null
	cart?: TxCart | null
	service?: TxService | null

	/** Solo en la respuesta de POST /transaction/transfer: replay idempotente de una operación completada. */
	duplicate?: boolean
}

// ---------------------------------------------------------------------------
// P2P
// ---------------------------------------------------------------------------

export type P2PStatus = 'open' | 'processing' | 'paid' | 'completed' | 'cancelled' | 'revision'

/** Subset del perfil que viaja embebido como User/Peer de una oferta. */
export type P2PUser = EmbeddedUser & {
	kyc?: boolean | BoolInt
	golden_check?: boolean | BoolInt
	role?: string
	rating_avg?: number
	operations?: number
	_count?: { P2P: number, P2P_Peer: number }
	p2p_message?: string
}

/** Detalles de pago del anunciante: array de pares O mapa plano O string JSON. */
export type P2POfferDetails =
	| { name?: string, key?: string, value?: string, val?: string }[]
	| Record<string, unknown>
	| string
	| null

export type P2POffer = {
	uuid: string
	type: 'buy' | 'sell'
	status: P2PStatus
	/** Strings ya formateados por el backend ("10.00") — se pintan crudos y se operan vía Number(). */
	amount: Decimal
	receive: Decimal
	/** Tick plano de la moneda (la relación viaja aparte en `Coin`). */
	coin: string
	Coin?: { logo: string, name: string }
	User?: P2PUser | null
	Peer?: P2PUser | null
	only_vip: BoolInt
	private: BoolInt
	message?: string
	created_at: string
	rating?: number
	tx_id?: string | null
	/** Datos sensibles: solo llegan en el detalle, nunca en la lista. */
	details?: P2POfferDetails
	/** Alias PascalCase del anterior (el backend ha mandado ambos). */
	Details?: P2POfferDetails
	payment_window_expires_at?: string | null
}

/** Paginador Laravel crudo de `GET /p2p/index` (las ofertas viven en `data`). */
export type P2PIndexEnvelope = {
	data: P2POffer[]
	current_page: number
	per_page: number
	total: number
} & Record<string, unknown>

/** Media de mercado por tick (`GET /p2p/averages`). */
export type P2PMarketAverages = Record<string, {
	average?: number
	average_buy: number
	average_sell: number
	name: string
	count: number
}>

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------

/**
 * Resumen de ahorro (`['savings','summary']`). El backend ha mandado tanto
 * camelCase como snake_case en los totales (el cliente lee `camel || snake`),
 * y `rate`/`currentRate` conviven — ambos se mantienen hasta unificar en qpweb.
 */
export type SavingsSummary = {
	/** Puede ser NEGATIVO (deuda). */
	balance: number
	rate?: number
	currentRate?: number
	totalDeposited?: Decimal
	total_deposited?: Decimal
	totalWithdrawn?: Decimal
	total_withdrawn?: Decimal
	totalEarned?: Decimal
	total_earned?: Decimal
}

/** Movimiento de ahorro — camelCase, a diferencia del resto de la API. */
export type SavingsMovement = {
	id: string | number
	type: 'deposit' | 'withdrawal' | 'earning'
	/** Aquí sí es number (el cliente hace Math.abs(amount).toFixed sin Number()). */
	amount: number
	description?: string
	createdAt: string
}

// ---------------------------------------------------------------------------
// Quick pay (`GET /transaction/latestusers`)
// ---------------------------------------------------------------------------

/** Item del carrusel de pago rápido; `image` garantizado no vacío (useQuickPayQuery filtra). */
export type QuickPayUser = EmbeddedUser & { image: string }
