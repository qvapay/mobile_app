/**
 * Nearby Pay wire protocol — pure module, no React Native imports.
 *
 * Every message exchanged over a proximity transport (Multipeer today, BLE
 * GATT in phase 2) is a small JSON object `{ v, t, ts, ...payload }`. The
 * channel is treated as 100% untrusted: announces only tell us WHICH uuid to
 * resolve against the server (userApi.searchUser) and an optional charge
 * amount — identity shown in the UI always comes from the server profile.
 *
 * Message types:
 *   announce        uuid, username, name, avatarUrl, goldenCheck, mode, amount?
 *   charge_update   amount                amount null/absent = stop charging
 *   payment_intent  toUuid, amount        "X te está pagando…" hint
 *   payment_result  status, amount, txUuid?  payer → chargee after transferMoney OK
 *   ni_token        token                 phase 3: UWB discovery token (base64)
 *   bye             (empty)
 */

export const PROTOCOL_VERSION = 1

/** Multipeer serviceType: 1-15 chars, [a-z0-9-] only. */
export const SERVICE_TYPE = 'qvapay-nearby'

/** Phase 2 — QvaPay's own 128-bit GATT service/characteristic UUIDs. */
export const BLE_SERVICE_UUID = '0000f0a1-9d3a-4f2e-b1c7-4a1e6b2c8d5f'
export const BLE_CHAR_ANNOUNCE_UUID = '0000f0a2-9d3a-4f2e-b1c7-4a1e6b2c8d5f'
export const BLE_CHAR_INBOX_UUID = '0000f0a3-9d3a-4f2e-b1c7-4a1e6b2c8d5f'

/** A peer with no fresh announce for this long is swept from the radar. */
export const ANNOUNCE_TTL_MS = 15000

/** Announces whose `ts` deviates more than this from local time are dropped. */
export const MAX_CLOCK_SKEW_MS = 30000

/** Hard cap on the serialized message size (BLE characteristic budget). */
export const MAX_MESSAGE_BYTES = 1024

/** Radar/announce mode: passive presence or actively charging an amount. */
export type NearbyMode = 'browse' | 'charge'

/** Presence broadcast — UNTRUSTED hints; the UI renders the server profile. */
export type AnnounceMessage = {
	v: number
	t: 'announce'
	ts: number
	uuid: string
	username: string
	name: string
	avatarUrl: string
	goldenCheck: boolean
	mode: NearbyMode
	amount?: string | null
	uwb?: boolean
}

/** Charge-mode toggle broadcast to already-connected peers. */
export type ChargeUpdateMessage = {
	v: number
	t: 'charge_update'
	ts: number
	amount: string | null
}

/** "X te está pagando…" hint sent before the transfer executes. */
export type PaymentIntentMessage = {
	v: number
	t: 'payment_intent'
	ts: number
	toUuid: string
	amount: string
}

/** Payer → chargee ack after transferMoney OK — never proof of payment. */
export type PaymentResultMessage = {
	v: number
	t: 'payment_result'
	ts: number
	status: 'paid'
	amount: string
	txUuid?: string
}

/** Phase 3: UWB discovery token exchange. */
export type NiTokenMessage = {
	v: number
	t: 'ni_token'
	ts: number
	token: string
}

/** Graceful goodbye before tearing the session down. */
export type ByeMessage = {
	v: number
	t: 'bye'
	ts: number
}

/** Every message that can travel over a proximity transport. */
export type NearbyMessage =
	| AnnounceMessage
	| ChargeUpdateMessage
	| PaymentIntentMessage
	| PaymentResultMessage
	| NiTokenMessage
	| ByeMessage

type MessageType = NearbyMessage['t']

/** Minimal user shape `buildAnnounce` reads from the authenticated profile. */
export type AnnounceUser = {
	uuid: string
	username?: string
	name?: string
	profile_photo_url?: string
	image?: string
	golden_check?: number | boolean
}

const MESSAGE_TYPES: MessageType[] = ['announce', 'charge_update', 'payment_intent', 'payment_result', 'ni_token', 'bye']

// Same lenient 8-4-4-4-12 hex shape parseQRData uses to detect uuids.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
// Positive money amount, up to 7 integer digits and 2 decimals.
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/
const MAX_NAME_LENGTH = 64
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/

/**
 * Validates an amount string coming from an untrusted peer.
 */
export const isValidAmount = (amount: unknown): amount is string => typeof amount === 'string' && AMOUNT_RE.test(amount) && parseFloat(amount) > 0

/**
 * Validates a uuid string against the same shape parseQRData accepts.
 */
export const isValidUuid = (uuid: unknown): uuid is string => typeof uuid === 'string' && UUID_RE.test(uuid)

const isSafeName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH && !CONTROL_CHARS_RE.test(value)

/**
 * Builds the announce payload broadcast to nearby peers. Never include
 * balance, email or phone here — presence + charge amount only.
 *
 * @param user - Authenticated user profile.
 * @param mode - 'browse' (default) or 'charge'.
 * @param amount - Charge amount when mode === 'charge'.
 */
export const buildAnnounce = (user: AnnounceUser, mode: NearbyMode = 'browse', amount: string | null = null): AnnounceMessage => {
	const msg: AnnounceMessage = {
		v: PROTOCOL_VERSION,
		t: 'announce',
		ts: Date.now(),
		uuid: user.uuid,
		username: user.username || '',
		name: user.name || '',
		avatarUrl: user.profile_photo_url || user.image || '',
		goldenCheck: !!user.golden_check,
		mode,
	}
	if (mode === 'charge' && isValidAmount(amount)) { msg.amount = amount }
	return msg
}

/**
 * Charge-mode update broadcast to already-connected peers.
 *
 * @param amount - null cancels charge mode.
 */
export const buildChargeUpdate = (amount: string | null): ChargeUpdateMessage => ({
	v: PROTOCOL_VERSION,
	t: 'charge_update',
	ts: Date.now(),
	amount: isValidAmount(amount) ? amount : null,
})

/**
 * Payer → chargee ack sent right after transferMoney succeeds. NEVER treated
 * as proof of payment by the receiver — it only triggers the "Confirmando…"
 * overlay until a server balance refetch confirms.
 */
export const buildPaymentResult = ({ amount, txUuid }: { amount: string, txUuid?: string }): PaymentResultMessage => {
	const msg: PaymentResultMessage = { v: PROTOCOL_VERSION, t: 'payment_result', ts: Date.now(), status: 'paid', amount: String(amount) }
	if (txUuid) { msg.txUuid = txUuid }
	return msg
}

/**
 * Phase 3 — UWB discovery token exchange over the already-open channel.
 *
 * @param token - NIDiscoveryToken serialized as base64.
 */
export const buildNiToken = (token: string): NiTokenMessage => ({ v: PROTOCOL_VERSION, t: 'ni_token', ts: Date.now(), token })

/**
 * Builds the SAME payme URL the Receive QR encodes, so a tapped peer flows
 * through the existing parseQRData + Scan routing (SEND / SEND_CONFIRM).
 */
export const buildPaymeUrl = (uuid: string, amount: string | null = null): string => amount ? `https://www.qvapay.com/payme/uuid/${uuid}/${amount}` : `https://www.qvapay.com/payme/uuid/${uuid}`

/**
 * Defensive parse + strict validation of a raw incoming message.
 * Forward-compatible: messages with `v` above ours are accepted (unknown
 * fields ignored); unknown `t` or malformed fields return null.
 *
 * @param raw - Raw string received from the transport (untrusted).
 * @param now - Injectable clock for tests (defaults to Date.now()).
 * @returns Validated message or null when rejected.
 */
export const parseMessage = (raw: unknown, now: number = Date.now()): NearbyMessage | null => {

	if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_BYTES) { return null }

	let parsed: unknown
	try { parsed = JSON.parse(raw) } catch { return null }
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return null }
	const msg = parsed as Record<string, unknown>

	const { v, t, ts } = msg
	if (typeof v !== 'number' || v < 1) { return null }
	if (!MESSAGE_TYPES.includes(t as MessageType)) { return null }
	if (typeof ts !== 'number' || !isFinite(ts)) { return null }

	switch (t) {
		case 'announce': {
			if (!isValidUuid(msg.uuid)) { return null }
			if (Math.abs(now - ts) > MAX_CLOCK_SKEW_MS) { return null }
			if (msg.mode !== 'browse' && msg.mode !== 'charge') { return null }
			if (msg.amount !== undefined && !isValidAmount(msg.amount)) { return null }
			if (msg.username !== undefined && msg.username !== '' && !isSafeName(msg.username)) { return null }
			if (msg.name !== undefined && msg.name !== '' && !isSafeName(msg.name)) { return null }
			if (msg.avatarUrl !== undefined && msg.avatarUrl !== '' &&
				(typeof msg.avatarUrl !== 'string' || !msg.avatarUrl.startsWith('https://'))) { return null }
			return {
				v, t, ts,
				uuid: msg.uuid.toLowerCase(),
				username: (msg.username as string | undefined) || '',
				name: (msg.name as string | undefined) || '',
				avatarUrl: (msg.avatarUrl as string | undefined) || '',
				goldenCheck: !!msg.goldenCheck,
				mode: msg.mode,
				amount: msg.mode === 'charge' && isValidAmount(msg.amount) ? msg.amount : null,
				uwb: !!msg.uwb,
			}
		}
		case 'charge_update': {
			const amount = isValidAmount(msg.amount) ? msg.amount : null
			return { v, t, ts, amount }
		}
		case 'payment_intent': {
			if (!isValidUuid(msg.toUuid) || !isValidAmount(msg.amount)) { return null }
			return { v, t, ts, toUuid: msg.toUuid.toLowerCase(), amount: msg.amount }
		}
		case 'payment_result': {
			if (msg.status !== 'paid' || !isValidAmount(msg.amount)) { return null }
			const out: PaymentResultMessage = { v, t, ts, status: 'paid', amount: msg.amount }
			if (typeof msg.txUuid === 'string' && msg.txUuid.length <= 64) { out.txUuid = msg.txUuid }
			return out
		}
		case 'ni_token': {
			if (typeof msg.token !== 'string' || msg.token.length === 0 || msg.token.length > 512) { return null }
			return { v, t, ts, token: msg.token }
		}
		case 'bye':
			return { v, t, ts }
		default:
			return null
	}
}

/**
 * Serializes a message for the wire, enforcing the size budget.
 *
 * @returns null when the message exceeds MAX_MESSAGE_BYTES.
 */
export const serializeMessage = (msg: NearbyMessage): string | null => {
	const raw = JSON.stringify(msg)
	return raw.length <= MAX_MESSAGE_BYTES ? raw : null
}

/**
 * UTF-8 → hex, the encoding munim-bluetooth expects for message payloads.
 *
 * @returns Lowercase hex string.
 */
export const utf8ToHex = (str: string): string => {
	let hex = ''
	// encodeURIComponent trick yields UTF-8 bytes without Buffer/TextEncoder.
	const utf8 = unescape(encodeURIComponent(str))
	for (let i = 0; i < utf8.length; i++) {
		hex += utf8.charCodeAt(i).toString(16).padStart(2, '0')
	}
	return hex
}

/**
 * Hex → UTF-8 string. Returns null on malformed hex (untrusted input).
 */
export const hexToUtf8 = (hex: unknown): string | null => {
	if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) { return null }
	let utf8 = ''
	for (let i = 0; i < hex.length; i += 2) {
		utf8 += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
	}
	try { return decodeURIComponent(escape(utf8)) } catch { return null }
}
