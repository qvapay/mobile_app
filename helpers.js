// Legacy grab-bag of utilities predating the /helpers/ directory:
// Spanish-locale dates and "time ago", QR/deep-link parsing, coin filtering,
// number/money formatters and clipboard helpers.
import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

/**
 * Spanish elapsed-time string since a date, largest unit only ("3 minutos").
 * Note: the week branch is unreachable — anything over a day reports in days.
 * @param {string|number|Date} date
 * @returns {string|undefined}
 */
const timeSince = (date) => {

	const now = new Date()
	const desiredDate = new Date(date)
	const secondsPast = (now - desiredDate) / 1000

	if (secondsPast < 60) {
		const seconds = parseInt(secondsPast, 10)
		return `${seconds} segundo${seconds > 1 ? 's' : ''}`
	}
	if (secondsPast < 3600) {
		const minutes = parseInt(secondsPast / 60, 10)
		return `${minutes} minuto${minutes > 1 ? 's' : ''}`
	}
	if (secondsPast <= 86400) {
		const hours = parseInt(secondsPast / 3600, 10)
		return `${hours} hora${hours > 1 ? 's' : ''}`
	}
	if (secondsPast > 86400) {
		const day = parseInt(secondsPast / 86400, 10)
		return `${day} dia${day > 1 ? 's' : ''}`
	}
	if (secondsPast > 604800) {
		const week = parseInt(secondsPast / 604800, 10)
		return `${week} semana${week > 1 ? 's' : ''}`
	}
}

/**
 * Truncates a string to its first `amount` characters,
 * e.g. "P2P_796a9e71-3d67-4a42-9dc2-02a5d069fa23" → "P2P_796a9e71".
 * @param {string} string
 * @param {number} [amount=20]
 * @returns {string}
 */
const reduceString = (string, amount = 20) => { return string.substring(0, amount) }

/**
 * Shortens a string keeping `amount` characters on each side,
 * e.g. "TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy" → "TEvQ...QBRVy".
 * @param {string} string
 * @param {number} [amount=20] - Characters kept on each side.
 * @returns {string}
 */
const reduceStringInside = (string, amount = 20) => { return string.substring(0, amount) + '...' + string.substring(string.length - amount) }

/**
 * Short es-ES locale date-time ("dd/mm/yy, hh:mm a. m.") from any date input.
 * @param {string|number|Date} date
 * @returns {string}
 */
const getShortDateTime = (date) => {
	const desiredDate = new Date(date)
	return desiredDate.toLocaleString('es-ES', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })
}

/**
 * Spanish "time ago" string, largest unit only ("2 días", "1 mes", "3 años").
 * @param {string|number|Date} date
 * @returns {string}
 */
const timeAgo = (date) => {
	const seconds = Math.floor((new Date() - new Date(date)) / 1000)
	let interval = seconds / 31536000
	if (interval > 1) {
		return Math.floor(interval) + " año" + (Math.floor(interval) > 1 ? "s" : "")
	}
	interval = seconds / 2592000
	if (interval > 1) {
		return Math.floor(interval) + " mes" + (Math.floor(interval) > 1 ? "es" : "")
	}
	interval = seconds / 86400
	if (interval > 1) {
		return Math.floor(interval) + " día" + (Math.floor(interval) > 1 ? "s" : "")
	}
	interval = seconds / 3600
	if (interval > 1) {
		return Math.floor(interval) + " hora" + (Math.floor(interval) > 1 ? "s" : "")
	}
	interval = seconds / 60
	if (interval > 1) {
		return Math.floor(interval) + " minuto" + (Math.floor(interval) > 1 ? "s" : "")
	}
	return Math.floor(seconds) + " segundo" + (Math.floor(seconds) > 1 ? "s" : "")
}

/**
 * Parses scanned QR payloads / deep link URLs into a payment intent using RegExp.
 * Supports (with or without www):
 *   1) https://[www.]qvapay.com/payme/username/<name>[/<amount>]
 *   2) https://[www.]qvapay.com/payme/uuid/<uuid>[/<amount>]
 *   3) https://[www.]qvapay.com/payme/<identifier>[/<amount>] (auto-detects uuid vs username)
 *   4) https://[www.]qvapay.com/pay/<uuid> — merchant invoice deep link
 *   5) qvapay://pay/<uuid> — custom scheme invoice deep link
 * Invoice links also match local dev hosts (localhost / 127.0.0.1 / LAN IPs).
 * Query string and hash are stripped before matching.
 * @param {string} data - Raw QR payload.
 * @returns {{ type: 'pay', uuid: string }
 *   | { type: 'payme', username?: string, uuid?: string, amount?: string }
 *   | null} null when the payload matches none of the patterns.
 */
const parseQRData = (data) => {

	if (typeof data !== 'string') { return null }

	// Strip query/hash parts to simplify matching
	const raw = data.trim()
	const pathOnly = raw.split('?')[0].split('#')[0]

	// Pay (invoice) patterns — https (prod + local dev hosts) and custom scheme
	const rePayHttps = /^https?:\/\/(?:www\.)?qvapay\.com\/pay\/([0-9a-fA-F-]{8,})\/?$/i
	const rePayDev = /^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?\/pay\/([0-9a-fA-F-]{8,})\/?$/i
	const rePayScheme = /^qvapay:\/\/pay\/([0-9a-fA-F-]{8,})\/?$/i

	// Payme patterns
	const reUsernameTyped = /^https?:\/\/(?:www\.)?qvapay\.com\/payme\/username\/([^/?#]+)(?:\/([^/?#]+))?\/?$/i
	const reUuidTyped = /^https?:\/\/(?:www\.)?qvapay\.com\/payme\/uuid\/([0-9a-fA-F-]{8,})(?:\/([^/?#]+))?\/?$/i
	const reUntyped = /^https?:\/\/(?:www\.)?qvapay\.com\/payme\/([^/?#]+)(?:\/([^/?#]+))?\/?$/i

	let match

	// 0) Pay invoice (merchant QR)
	match = pathOnly.match(rePayHttps) || pathOnly.match(rePayDev) || pathOnly.match(rePayScheme)
	if (match) { return { type: 'pay', uuid: match[1] } }

	// 1) Explicit username route
	match = pathOnly.match(reUsernameTyped)
	if (match) {
		const username = match[1]
		const amount = match[2]
		return amount ? { type: 'payme', username, amount } : { type: 'payme', username }
	}

	// 2) Explicit uuid route
	match = pathOnly.match(reUuidTyped)
	if (match) {
		const uuid = match[1]
		const amount = match[2]
		return amount ? { type: 'payme', uuid, amount } : { type: 'payme', uuid }
	}

	// 3) Untyped route
	match = pathOnly.match(reUntyped)
	if (match) {
		const identifier = match[1]
		const amount = match[2]
		// Detect UUID format (lenient: 8-4-4-4-12 hex)
		const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(identifier)
		if (isUuid) { return amount ? { type: 'payme', uuid: identifier, amount } : { type: 'payme', uuid: identifier } }
		return amount ? { type: 'payme', username: identifier, amount } : { type: 'payme', username: identifier }
	}

	return null
}

/**
 * Checks a parseQRData result is directly actionable: either a legacy
 * `transactionUUID` payload, or a payme intent carrying BOTH username and amount.
 * @param {object|null} parsedData - Result of parseQRData.
 * @returns {boolean}
 */
const isValidQRData = (parsedData) => {
	if (parsedData === null) { return false }
	if ('transactionUUID' in parsedData) { return true }
	return 'username' in parsedData && 'amount' in parsedData
}

/**
 * Filters the /coins/v2 catalog by direction, splitting it into the three
 * category groups the coin pickers render ('Bank', 'Criptomonedas', 'E-Wallet').
 * @param {object} params
 * @param {Array<object>} params.coins - Category array as returned by the coins API.
 * @param {'IN'|'OUT'|'P2P'} [params.in_out_p2p="IN"] - Which enabled_* flag to filter by.
 * @param {number} [params.amount=0] - When > 0, also drops coins whose
 *   min_in / min_out exceeds it (IN and OUT modes only).
 * @returns {{ banks: Array, cryptoCurrencies: Array, eWallets: Array }}
 */
const filterCoins = ({ coins, in_out_p2p = "IN", amount = 0 }) => {

	const filterByInOut = (option) => {
		if (in_out_p2p === 'IN') {
			return option.enabled_in
		} else if (in_out_p2p === 'OUT') {
			return option.enabled_out
		} else if (in_out_p2p === 'P2P') {
			return option.enabled_p2p
		} else {
			return false
		}
	}

	const filterCategoryCoins = (categoryName) => {
		const category = coins.find((cat) => cat.name === categoryName)
		if (category) {
			const filteredCoins = category.coins.filter(filterByInOut)
			if (amount > 0) {
				if (in_out_p2p === 'IN') {
					return filteredCoins.filter((coin) => parseFloat(coin.min_in) <= amount)
				}
				if (in_out_p2p === 'OUT') {
					return filteredCoins.filter((coin) => parseFloat(coin.min_out) <= amount)
				}
			}
			return filteredCoins
		}
		return []
	}

	const filteredBanks = filterCategoryCoins('Bank')
	const filteredCryptoCurrencies = filterCategoryCoins('Criptomonedas')
	const filteredEWallets = filterCategoryCoins('E-Wallet')

	return {
		banks: filteredBanks,
		cryptoCurrencies: filteredCryptoCurrencies,
		eWallets: filteredEWallets,
	}
}

/**
 * Middle-ellipsizes a wallet address, keeping `amount` characters on each side.
 * Addresses of 28 characters or fewer are returned untouched.
 * @param {string} address
 * @param {number} [amount=10]
 * @returns {string}
 */
const truncateWalletAddress = (address, amount = 10) => { return address.length > 28 ? address.substring(0, amount) + '...' + address.substring(address.length - amount) : address }

/**
 * Formats a rate/amount for display: two decimals from 0.0001 upward,
 * exponential notation below 0.0001 ("1.5e-5"), null for exactly 0 (so the UI
 * can hide it), and the stringified input when it isn't numeric.
 * @param {number|string} value
 * @returns {string|null}
 */
const adjustNumber = (value) => {
	const numValue = parseFloat(value)
	// Si no es un número válido, retornar el valor original
	if (isNaN(numValue)) { return value.toString() }
	// Si el valor es 0, retornar null
	if (numValue === 0) { return null }
	// Si el valor es superior a 1, retornar con dos decimales
	if (numValue >= 1) { return numValue.toFixed(2) }
	// Si el valor es menor a 0.0001, convertir a notación exponencial
	if (numValue > 0 && numValue < 0.0001) {
		let exponentValue = numValue.toExponential()
		let [mantissa, exponent] = exponentValue.split('e')
		mantissa = parseFloat(mantissa).toFixed(1)
		return `${mantissa}e${exponent}`
	}
	// Si no se cumplen las condiciones anteriores, retornar el valor como está
	return numValue.toFixed(2)
}

/**
 * Spanish label for a P2P offer type: "buy" → "Compra", "sell" → "Venta".
 * Anything else passes through unchanged.
 * @param {string} text
 * @returns {string}
 */
const p2pTypeText = (text) => {
	if (text === "buy") { return "Compra" }
	if (text === "sell") { return "Venta" }
	return text
}

/**
 * Spanish label for a P2P offer / transaction status ("open" → "Abierta",
 * "paid" → "Pagada", …). Unknown statuses pass through unchanged.
 * @param {string} text
 * @returns {string}
 */
const statusText = (text) => {
	if (text === "open") { return "Abierta" }
	if (text === "revision") { return "Revisión" }
	if (text === "cancelled") { return "Cancelada" }
	if (text === "closed") { return "Cerrada" }
	if (text === "completed") { return "Completada" }
	if (text === "processing") { return "Procesando" }
	if (text === "pending") { return "Pendiente" }
	if (text === "paid") { return "Pagada" }
	if (text === "received") { return "Recibida" }
	return text
}

/**
 * Fisher–Yates shuffle. Mutates the array in place and returns it.
 * @param {Array} array
 * @returns {Array} The same (shuffled) array.
 */
const shuffleArray = (array) => {
	let currentIndex = array.length, randomIndex
	while (currentIndex !== 0) {
		randomIndex = Math.floor(Math.random() * currentIndex)
		currentIndex--
		[array[currentIndex], array[randomIndex]] = [
			array[randomIndex], array[currentIndex]]
	}

	return array
}

/**
 * Copies text to the clipboard with a success haptic and a Spanish toast.
 * @param {string} text
 */
const copyTextToClipboard = (text) => {
	Clipboard.setString(text)
	ReactNativeHapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
	toast.success('Copiado al portapapeles', { duration: 1500 })
}

/**
 * First dash-separated chunk of a UUID ("796a9e71-3d67-…" → "796a9e71"),
 * used as a short human-readable reference.
 * @param {string} uuid
 * @returns {string} Empty string for invalid input.
 */
const getFirstChunk = (uuid) => {
	if (!uuid || typeof uuid !== 'string') {
		return ''
	}
	return uuid.split("-")[0]
}

/** Uppercase Spanish P2P type label: 'buy' → 'COMPRA', anything else → 'VENTA'. */
const getTypeText = type => { return type === 'buy' ? 'COMPRA' : 'VENTA' }
/** Theme color for a P2P type: success (green) for 'buy', error (red) otherwise. */
const getTypeColor = (type, theme) => { return type === 'buy' ? theme.colors.success : theme.colors.error }

/**
 * Formats a crypto amount removing unnecessary trailing zeros while always
 * keeping at least 2 decimals:
 *   formatCryptoAmount(0.00145000, 8) → "0.00145"
 *   formatCryptoAmount(1.50000000, 8) → "1.50"
 * @param {number|string} value
 * @param {number} [maxDecimals=8]
 * @returns {string} "0" for non-numeric input.
 */
const formatCryptoAmount = (value, maxDecimals = 8) => {
	const num = Number(value)
	if (isNaN(num)) return '0'
	const fixed = num.toFixed(maxDecimals)
	// Remove trailing zeros but keep at least 2 decimal places
	const trimmed = fixed.replace(/\.?0+$/, '')
	const parts = trimmed.split('.')
	if (parts.length === 1) return parts[0] + '.00'
	if (parts[1].length < 2) return parts[0] + '.' + parts[1].padEnd(2, '0')
	return trimmed
}

// Copyable patterns recognized inside free text, in priority order
const COPYABLE_PATTERNS = [
	{ type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
	{ type: 'card', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
	{ type: 'phone', regex: /(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{2,4}/g },
]

/**
 * Detects copyable patterns (emails, card numbers, phone numbers) in free
 * text so chat/detail views can offer tap-to-copy. Overlapping matches are
 * resolved keeping the earlier (then longer) one.
 * @param {string} text
 * @returns {Array<{ type: 'email'|'card'|'phone', value: string, start: number, end: number }>}
 *   Empty array when nothing matches.
 */
const detectCopyableText = (text) => {
	if (!text || typeof text !== 'string') return []
	const all = []
	for (const { type, regex } of COPYABLE_PATTERNS) {
		const re = new RegExp(regex.source, regex.flags)
		let match
		while ((match = re.exec(text)) !== null) {
			all.push({ type, value: match[0], start: match.index, end: match.index + match[0].length })
		}
	}
	// Sort by start, then prefer longer matches
	all.sort((a, b) => a.start - b.start || b.end - a.end)
	// Remove overlapping matches — keep the longer/earlier one
	const filtered = []
	let lastEnd = 0
	for (const m of all) {
		if (m.start >= lastEnd) {
			filtered.push(m)
			lastEnd = m.end
		}
	}
	return filtered
}

/**
 * Compact number formatter (mirrors the web sidebar's tinyfiNumber):
 * over 1000 → "1.23K" (below 10K) or "12.3K" (10K+), "1.2M" from a million,
 * and floored integers with no decimals under 1000.
 * @param {number|string} number
 * @returns {string}
 */
const tinyfiNumber = (number) => {
	const n = Number(number) || 0
	if (n >= 1000000) { return `${(n / 1000000).toFixed(1)}M` }
	if (n > 1000) {
		if (n < 10000) { return `${(n / 1000).toFixed(2)}K` }
		return `${(n / 1000).toFixed(1)}K`
	}
	if (n < 1000) { return Math.floor(n).toString() }
	return n.toString()
}

/**
 * Money formatter with the sign BEFORE the symbol: "$12.50" / "-$12.50".
 * Savings balances can be negative (admin-managed debts); painting them red
 * is each screen's call via `Number(value) < 0`.
 * @param {number|string} value
 * @returns {string}
 */
const formatMoney = (value) => {
	const n = Number(value) || 0
	return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
}

// export helpers
export {
	timeSince,
	reduceString,
	getShortDateTime,
	parseQRData,
	isValidQRData,
	filterCoins,
	truncateWalletAddress,
	adjustNumber,
	timeAgo,
	p2pTypeText,
	shuffleArray,
	statusText,
	copyTextToClipboard,
	getFirstChunk,
	getTypeText,
	getTypeColor,
	reduceStringInside,
	formatCryptoAmount,
	detectCopyableText,
	tinyfiNumber,
	formatMoney
}