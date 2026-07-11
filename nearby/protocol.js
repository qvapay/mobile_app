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
 *   announce        { uuid, username, name, avatarUrl, goldenCheck, mode, amount? }
 *   charge_update   { amount }              amount null/absent = stop charging
 *   payment_intent  { toUuid, amount }      "X te está pagando…" hint
 *   payment_result  { status, amount, txUuid? }  payer → chargee after transferMoney OK
 *   ni_token        { token }               phase 3: UWB discovery token (base64)
 *   bye             {}
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

const MESSAGE_TYPES = ['announce', 'charge_update', 'payment_intent', 'payment_result', 'ni_token', 'bye']

// Same lenient 8-4-4-4-12 hex shape parseQRData uses to detect uuids.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
// Positive money amount, up to 7 integer digits and 2 decimals.
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/
const MAX_NAME_LENGTH = 64
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/

/**
 * Validates an amount string coming from an untrusted peer.
 * @param {*} amount
 * @returns {boolean}
 */
export const isValidAmount = (amount) => typeof amount === 'string' && AMOUNT_RE.test(amount) && parseFloat(amount) > 0

/**
 * Validates a uuid string against the same shape parseQRData accepts.
 * @param {*} uuid
 * @returns {boolean}
 */
export const isValidUuid = (uuid) => typeof uuid === 'string' && UUID_RE.test(uuid)

const isSafeName = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH && !CONTROL_CHARS_RE.test(value)

/**
 * Builds the announce payload broadcast to nearby peers. Never include
 * balance, email or phone here — presence + charge amount only.
 * @param {{ uuid: string, username?: string, name?: string, profile_photo_url?: string, golden_check?: number|boolean }} user
 * @param {'browse'|'charge'} [mode="browse"]
 * @param {string|null} [amount=null] - Charge amount when mode === 'charge'.
 * @returns {object}
 */
export const buildAnnounce = (user, mode = 'browse', amount = null) => {
	const msg = {
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
 * @param {string|null} amount - null cancels charge mode.
 * @returns {object}
 */
export const buildChargeUpdate = (amount) => ({
	v: PROTOCOL_VERSION,
	t: 'charge_update',
	ts: Date.now(),
	amount: isValidAmount(amount) ? amount : null,
})

/**
 * Payer → chargee ack sent right after transferMoney succeeds. NEVER treated
 * as proof of payment by the receiver — it only triggers the "Confirmando…"
 * overlay until a server balance refetch confirms.
 * @param {{ amount: string, txUuid?: string }} params
 * @returns {object}
 */
export const buildPaymentResult = ({ amount, txUuid }) => {
	const msg = { v: PROTOCOL_VERSION, t: 'payment_result', ts: Date.now(), status: 'paid', amount: String(amount) }
	if (txUuid) { msg.txUuid = txUuid }
	return msg
}

/**
 * Phase 3 — UWB discovery token exchange over the already-open channel.
 * @param {string} token - NIDiscoveryToken serialized as base64.
 * @returns {object}
 */
export const buildNiToken = (token) => ({ v: PROTOCOL_VERSION, t: 'ni_token', ts: Date.now(), token })

/**
 * Builds the SAME payme URL the Receive QR encodes, so a tapped peer flows
 * through the existing parseQRData + Scan routing (SEND / SEND_CONFIRM).
 * @param {string} uuid
 * @param {string|null} [amount]
 * @returns {string}
 */
export const buildPaymeUrl = (uuid, amount = null) => amount ? `https://www.qvapay.com/payme/uuid/${uuid}/${amount}` : `https://www.qvapay.com/payme/uuid/${uuid}`

/**
 * Defensive parse + strict validation of a raw incoming message.
 * Forward-compatible: messages with `v` above ours are accepted (unknown
 * fields ignored); unknown `t` or malformed fields return null.
 * @param {string} raw - Raw string received from the transport.
 * @param {number} [now=Date.now()] - Injectable clock for tests.
 * @returns {object|null} Validated message or null when rejected.
 */
export const parseMessage = (raw, now = Date.now()) => {
	
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_BYTES) { return null }

	let msg
	try { msg = JSON.parse(raw) } catch { return null }
	if (!msg || typeof msg !== 'object' || Array.isArray(msg)) { return null }

	const { v, t, ts } = msg
	if (typeof v !== 'number' || v < 1) { return null }
	if (!MESSAGE_TYPES.includes(t)) { return null }
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
				username: msg.username || '',
				name: msg.name || '',
				avatarUrl: msg.avatarUrl || '',
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
			const out = { v, t, ts, status: 'paid', amount: msg.amount }
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
 * @param {object} msg
 * @returns {string|null} null when the message exceeds MAX_MESSAGE_BYTES.
 */
export const serializeMessage = (msg) => {
	const raw = JSON.stringify(msg)
	return raw.length <= MAX_MESSAGE_BYTES ? raw : null
}

/**
 * UTF-8 → hex, the encoding munim-bluetooth expects for message payloads.
 * @param {string} str
 * @returns {string} Lowercase hex string.
 */
export const utf8ToHex = (str) => {
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
 * @param {string} hex
 * @returns {string|null}
 */
export const hexToUtf8 = (hex) => {
	if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) { return null }
	let utf8 = ''
	for (let i = 0; i < hex.length; i += 2) {
		utf8 += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
	}
	try { return decodeURIComponent(escape(utf8)) } catch { return null }
}
