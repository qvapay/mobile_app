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
	/** Flags de features servidos por el backend (rollout remoto). */
	features?: Record<string, unknown>
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
	/** Flags de features servidos por el backend (rollout remoto). */
	features?: Record<string, unknown>
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
 * Coin enriquecida por el CLIENTE (cryptoQueries/homeQueries): precio spot
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

// ---------------------------------------------------------------------------
// Announcements (`GET /announcement`)
// ---------------------------------------------------------------------------

/**
 * Aviso global vigente, gestionado desde el panel admin de qpweb
 * (`/admin/announcements`) — la misma fuente que pinta el banner del dashboard
 * web. Solo hay uno activo a la vez; el backend ya filtra por la ventana
 * `starts_at`/`ends_at` y devuelve `null` cuando no toca ninguno.
 *
 * NO confundir con la promo (`promoApi`): la promo es una oferta comercial con
 * logo y sin descarte; el aviso es comunicación operativa, descartable.
 */
export type Announcement = {
	/** Identidad del aviso: la clave de descarte cuelga de aquí, así que uno nuevo vuelve a aparecer. */
	id: string
	/** Parte en negritas. */
	title: string
	message?: string
	cta_label?: string | null
	/** Ruta interna (`/p2p`) o URL absoluta `https://`. */
	cta_url?: string | null
	/** Días que dura el descarte; 0 = para siempre. */
	dismiss_days: number
	/** ISO 8601, o null si el aviso no caduca. Lo usa la app para no resucitar uno caducado desde la caché persistida. */
	ends_at?: string | null
}

// ---------------------------------------------------------------------------
// Wallet self-custody (historial on-chain vía proxy de qpweb)
// ---------------------------------------------------------------------------

/** Movimiento on-chain normalizado por `GET /wallet/history` (misma forma en todas las cadenas). */
export type WalletTx = {
	/** 'fee' = llamada a contrato propia (enviar un token, approve…): solo se quemó la comisión, `amount` es esa comisión en el nativo. Ausente = transferencia. */
	kind?: 'transfer' | 'fee'
	hash: string
	/** Unix en SEGUNDOS. */
	time: number
	direction: 'in' | 'out' | 'self'
	from: string | null
	to: string | null
	/** Decimal humano, siempre positivo ('12.5'). */
	amount: string
	symbol: string
	/** null = nativo. */
	contract: string | null
	/** En unidades del nativo de la cadena; null si no se conoce. */
	fee: string | null
	status: 'confirmed' | 'pending' | 'failed'
}

export type WalletHistoryPage = {
	items: WalletTx[]
	next_cursor: string | null
}

// ── Alquiler de energía TRON (`/v2/energy`, se cobra del saldo QvaPay) ──────

/** Plazos que vende el proveedor. Para enviar USDT ahora mismo, `1h` sobra. */
export type EnergyDuration = '1h' | '1d' | '3d' | '7d'

export type EnergyOrderStatus = 'pending' | 'dispatching' | 'completed' | 'refunded' | 'needs_review'

/** Clave de un monto popular de la tabla de precios (la prosa se traduce en la app). */
export type EnergyPreset = 'usdt_known' | 'usdt_new'

/** Fila de `GET /v2/energy/prices`: un monto popular para una duración. */
export type EnergyPriceRow = {
	preset: EnergyPreset
	/** Prosa del backend, en español. NO se pinta: el copy sale de i18n por `preset`. */
	title: string
	detail: string
	volume: number
	duration: EnergyDuration
	price_usd: number
	/** Precio por unidad de esa duración, para estimar volúmenes fuera de la tabla. */
	unit_price_usd: number
}

export type EnergyPricesPayload = {
	data: EnergyPriceRow[]
	meta: {
		durations: EnergyDuration[]
		min_volume: number
		max_volume: number
		presets: Array<{ key: EnergyPreset, volume: number, title: string, detail: string }>
		note: string
	}
}

/** Cotización congelada (90 s, un solo uso) de `POST /v2/energy/quote`. */
export type EnergyQuote = {
	quote_id: string
	volume: number
	duration: EnergyDuration
	price_usd: number
	expires_at: string
}

/** Orden de energía tal como la serializa el backend. */
export type EnergyOrder = {
	uuid: string
	resource: string
	/** Dirección que recibe la delegación: la que FIRMA el envío, no la que recibe los fondos. */
	target_address: string
	volume: number
	duration: EnergyDuration
	price_usd: number
	status: EnergyOrderStatus
	/** Solo legible en `refunded` / `needs_review`. */
	reason: string | null
	order_id: string | null
	txid: string | null
	explorer: string | null
	created_at: string
	completed_at: string | null
}

// ── Patrocinio de fees on-chain (QvaPay paga el gas de un envío del usuario) ─

/**
 * Permiso acotado a UN envío. `fee_payer` viaja desde el backend a propósito: llevar
 * esa dirección en la app obligaría a publicar versión para rotar la tesorería.
 */
export type SponsorGrant = {
	uuid: string
	fee_payer: string
	from: string
	to: string
	mint: string
	amount: string
	decimals: number
	expires_at: string
}

/**
 * Por qué NO se patrocina. No es un error: el usuario puede enviar igual pagando su
 * gas, y cada motivo tiene su copy (de `not_gold` sale el gancho de GOLD).
 */
export type GaslessIneligibleReason = 'disabled' | 'not_gold' | 'wallet_not_registered' | 'quota_exhausted' | 'grant_spent'

export type GaslessQuote =
	| { eligible: true, grant: SponsorGrant, remaining_today: number, renews_at: string, duplicate?: boolean }
	| { eligible: false, reason: GaslessIneligibleReason, remaining_today?: number, renews_at?: string, daily_limit?: number }

export type GaslessSubmitStatus = 'confirmed' | 'pending' | 'authorized' | 'failed' | 'review'

export type GaslessSubmitResult = {
	status: GaslessSubmitStatus
	reason: string | null
	/** El blockhash caducó: reconstruir, re-firmar y reenviar con ESTE mismo permiso. */
	rebuild: boolean
	retryable: boolean
	signature: string | null
	explorer: string | null
	message: string | null
}

export type SponsorGrantState = {
	uuid: string
	status: GaslessSubmitStatus | 'expired' | 'cancelled' | 'submitted'
	to: string
	mint: string
	amount: string
	decimals: number
	signature: string | null
	explorer: string | null
	creates_ata: boolean
	reason: string | null
	expires_at: string
	created_at: string
	completed_at: string | null
}

// ── Swap saldo QvaPay ↔ activo on-chain (primer par: QUSD en Stacks) ─────────

export type SwapDirection = 'out' | 'in'
export type SwapStatus = 'pending' | 'dispatching' | 'sent' | 'completed' | 'failed' | 'refunded' | 'needs_review'

/** Fila de `swaps` tal como la sirve `GET /swap/{uuid}` (BigInt como string). */
export type Swap = {
	uuid: string
	pair: string
	direction: SwapDirection
	amount: number
	amount_base: string | null
	asset: string
	from_address: string | null
	to_address: string
	txid: string | null
	explorer: string | null
	status: SwapStatus
	/** `nonce` | `funds` | `abort` | `cancelled` | `manual`… — legible solo en failed/refunded. */
	reason: string | null
	sponsored_fee_ustx: string | null
	created_at: string
	updated_at: string
	sent_at: string | null
	completed_at: string | null
	transaction_uuid?: string | null
}

export type SwapPair = {
	id: string
	base: string
	quote: string
	rate: number
	fee_bps: number
	min: number
	max: number
	decimals: number
	/** `SP….contrato::asset` del par: con esto (y `treasury`) la app construye la tx del IN. */
	asset: string
	contract_id: string
	asset_name: string
	treasury: string
	network: string
	enabled: boolean
	disabled_reason: string | null
}

/** `GET /swap/pairs`. */
export type SwapPairsPayload = {
	data: SwapPair[]
	limits: { kyc: boolean, daily: number | null, monthly: number | null, available: number | null, requires_kyc: boolean }
	sponsor: { daily_per_user: number, used_today: number, remaining_today: number, max_fee_ustx: number }
	wallet: { stx: string | null }
}
