// Legacy grab-bag of utilities predating the /helpers/ directory:
// localized dates and "time ago", QR/deep-link parsing, coin filtering,
// number/money formatters and clipboard helpers.
import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import i18n, { getDateLocale } from './i18n'
import type { Coin } from './types/domain'

/** Intent de pago Lightning parseado de un QR. */
export type LightningIntent = { type: 'lightning', invoice: string, amountSats: number | null }

/** Intent de pago parseado por `parseQRData`. */
export type QRIntent =
	| { type: 'pay', uuid: string }
	| { type: 'payme', username?: string, uuid?: string, amount?: string }
	| LightningIntent

/** Categoría del catálogo `/coins/v2` ('Bank' | 'Criptomonedas' | 'E-Wallet'). */
type CoinCategory = { name: string, coins: Coin[] }

/** Patrón copiable detectado dentro de texto libre. */
export type CopyableMatch = { type: 'email' | 'card' | 'phone', value: string, start: number, end: number }

/**
 * Localized elapsed-time string since a date, largest unit only
 * ("3 minutos" / "3 minutes"). Days cap the scale — anything over a day
 * reports in days.
 */
const timeSince = (date: string | number | Date): string => {

	const now = new Date()
	const desiredDate = new Date(date)
	const secondsPast = ((now as unknown as number) - (desiredDate as unknown as number)) / 1000

	if (secondsPast < 60) { return i18n.t('common.time.second', { count: parseInt(secondsPast as unknown as string, 10) }) }
	if (secondsPast < 3600) { return i18n.t('common.time.minute', { count: parseInt((secondsPast / 60) as unknown as string, 10) }) }
	if (secondsPast <= 86400) { return i18n.t('common.time.hour', { count: parseInt((secondsPast / 3600) as unknown as string, 10) }) }
	return i18n.t('common.time.day', { count: parseInt((secondsPast / 86400) as unknown as string, 10) })
}

/**
 * Truncates a string to its first `amount` characters,
 * e.g. "P2P_796a9e71-3d67-4a42-9dc2-02a5d069fa23" → "P2P_796a9e71".
 */
const reduceString = (string: string, amount: number = 20): string => { return string.substring(0, amount) }

/**
 * Shortens a string keeping `amount` characters on each side,
 * e.g. "TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy" → "TEvQ...QBRVy".
 * @param string - Input string.
 * @param amount - Characters kept on each side (default 20).
 */
const reduceStringInside = (string: string, amount: number = 20): string => { return string.substring(0, amount) + '...' + string.substring(string.length - amount) }

/**
 * Short locale date-time ("dd/mm/yy, hh:mm a. m.") in the active language.
 */
const getShortDateTime = (date: string | number | Date): string => {
	const desiredDate = new Date(date)
	return desiredDate.toLocaleString(getDateLocale(), { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })
}

/**
 * Localized "time ago" string, largest unit only ("2 días", "1 mes", "3 years").
 */
const timeAgo = (date: string | number | Date): string => {
	const seconds = Math.floor(((new Date() as unknown as number) - (new Date(date) as unknown as number)) / 1000)
	let interval = seconds / 31536000
	if (interval > 1) { return i18n.t('common.time.year', { count: Math.floor(interval) }) }
	interval = seconds / 2592000
	if (interval > 1) { return i18n.t('common.time.month', { count: Math.floor(interval) }) }
	interval = seconds / 86400
	if (interval > 1) { return i18n.t('common.time.day', { count: Math.floor(interval) }) }
	interval = seconds / 3600
	if (interval > 1) { return i18n.t('common.time.hour', { count: Math.floor(interval) }) }
	interval = seconds / 60
	if (interval > 1) { return i18n.t('common.time.minute', { count: Math.floor(interval) }) }
	return i18n.t('common.time.second', { count: Math.floor(seconds) })
}

/**
 * Extracts the amount (in satoshis) encoded in a BOLT11 invoice's human-readable
 * part: `lnbc<value><multiplier>1...` where the multiplier is m (milli), u (micro),
 * n (nano) or p (pico) BTC. Zero-amount invoices carry no digits and return null.
 * Client-side hint only — the backend re-decodes the invoice authoritatively.
 * @param invoice - BOLT11 mainnet invoice (lnbc...).
 * @returns Amount in sats, or null for zero-amount invoices.
 */
const bolt11AmountSats = (invoice: string): number | null => {
	const match = invoice.toLowerCase().match(/^lnbc(\d+)?([munp])?1/)
	if (!match || !match[1]) { return null }
	const multiplier = ({ m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 } as Record<string, number>)[match[2]] ?? 1
	const sats = Math.round(Number(match[1]) * multiplier * 1e8)
	return sats > 0 ? sats : null
}

/**
 * Parses Lightning Network payment targets out of a raw QR payload. Recognizes:
 *   1) Bare BOLT11 mainnet invoices (lnbc..., case-insensitive)
 *   2) lightning:/lnurl:/lnurlp: prefixed payloads (Phoenix, Muun, etc.)
 *   3) BIP-21 bitcoin: URIs carrying a `lightning=` query param (BlueWallet, etc.)
 *   4) LNURL-pay bech32 strings (lnurl1...)
 *   5) Lightning Addresses (user@domain) — only when explicitly prefixed with
 *      lightning:, so plain emails in arbitrary QRs never misfire as payments
 * @param raw - Raw QR payload.
 */
const parseLightningQR = (raw: unknown): LightningIntent | null => {

	if (typeof raw !== 'string') { return null }
	let target = raw.trim()
	if (!target) { return null }

	// BIP-21 bitcoin: URI — el pago LN viaja en el query param `lightning`
	let hadLightningPrefix = false
	if (/^bitcoin:/i.test(target)) {
		const queryIndex = target.indexOf('?')
		if (queryIndex === -1) { return null }
		const lightningParam = target.slice(queryIndex + 1).split('&').find((param) => /^lightning=/i.test(param))
		if (!lightningParam) { return null }
		target = decodeURIComponent(lightningParam.slice('lightning='.length)).trim()
		hadLightningPrefix = true
	}

	// Prefijos de wallets: lightning:, lnurl:, lnurlp: (con o sin //)
	const withoutPrefix = target.replace(/^(lightning|lnurlp|lnurl):(\/\/)?/i, '')
	if (withoutPrefix !== target) { hadLightningPrefix = true }
	target = withoutPrefix.trim()

	// BOLT11 mainnet (bech32: HRP + separador '1' + data)
	if (/^lnbc[0-9a-z]*1[0-9a-z]+$/i.test(target)) {
		return { type: 'lightning', invoice: target, amountSats: bolt11AmountSats(target) }
	}

	// LNURL-pay bech32
	if (/^lnurl1[ac-hj-np-z02-9]+$/i.test(target)) {
		return { type: 'lightning', invoice: target, amountSats: null }
	}

	// Lightning Address — solo con prefijo explícito (un email pelado no es un pago)
	if (hadLightningPrefix && /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(target)) {
		return { type: 'lightning', invoice: target, amountSats: null }
	}

	return null
}

/**
 * Parses scanned QR payloads / deep link URLs into a payment intent using RegExp.
 * Supports (with or without www):
 *   1) https://[www.]qvapay.com/payme/username/<name>[/<amount>]
 *   2) https://[www.]qvapay.com/payme/uuid/<uuid>[/<amount>]
 *   3) https://[www.]qvapay.com/payme/<identifier>[/<amount>] (auto-detects uuid vs username)
 *   4) https://[www.]qvapay.com/pay/<uuid> — merchant invoice deep link
 *   5) qvapay://pay/<uuid> — custom scheme invoice deep link
 *   6) Lightning Network targets (BOLT11 / LNURL / bitcoin:?lightning=) via parseLightningQR
 * Invoice links also match local dev hosts (localhost / 127.0.0.1 / LAN IPs).
 * Query string and hash are stripped before matching.
 * @param data - Raw QR payload.
 * @returns null when the payload matches none of the patterns.
 */
const parseQRData = (data: unknown): QRIntent | null => {

	if (typeof data !== 'string') { return null }

	const raw = data.trim()

	// Lightning primero y sobre el payload crudo: el split de query de abajo
	// destruiría un URI bitcoin:...?lightning=<invoice>
	const lightning = parseLightningQR(raw)
	if (lightning) { return lightning }

	// Strip query/hash parts to simplify matching
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
 * @param parsedData - Result of parseQRData.
 */
const isValidQRData = (parsedData: object | null): boolean => {
	if (parsedData === null) { return false }
	if ('transactionUUID' in parsedData) { return true }
	return 'username' in parsedData && 'amount' in parsedData
}

/**
 * Filters the /coins/v2 catalog by direction, splitting it into the three
 * category groups the coin pickers render ('Bank', 'Criptomonedas', 'E-Wallet').
 * @param params - `coins`: category array as returned by the coins API;
 *   `in_out_p2p`: which enabled_* flag to filter by (default "IN");
 *   `amount`: when > 0, also drops coins whose min_in / min_out exceeds it
 *   (IN and OUT modes only).
 */
const filterCoins = ({ coins, in_out_p2p = "IN", amount = 0 }: { coins: CoinCategory[], in_out_p2p?: 'IN' | 'OUT' | 'P2P', amount?: number }): { banks: Coin[], cryptoCurrencies: Coin[], eWallets: Coin[] } => {

	const filterByInOut = (option: Coin): boolean | undefined => {
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

	const filterCategoryCoins = (categoryName: string): Coin[] => {
		const category = coins.find((cat) => cat.name === categoryName)
		if (category) {
			const filteredCoins = category.coins.filter(filterByInOut)
			if (amount > 0) {
				if (in_out_p2p === 'IN') {
					return filteredCoins.filter((coin) => parseFloat(coin.min_in as string) <= amount)
				}
				if (in_out_p2p === 'OUT') {
					return filteredCoins.filter((coin) => parseFloat(coin.min_out as string) <= amount)
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
 */
const truncateWalletAddress = (address: string, amount: number = 10): string => { return address.length > 28 ? address.substring(0, amount) + '...' + address.substring(address.length - amount) : address }

/**
 * Formats a rate/amount for display: two decimals from 0.0001 upward,
 * exponential notation below 0.0001 ("1.5e-5"), null for exactly 0 (so the UI
 * can hide it), and the stringified input when it isn't numeric.
 */
const adjustNumber = (value: number | string): string | null => {
	const numValue = parseFloat(value as string)
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
 * Localized label for a P2P offer type: "buy" → "Compra"/"Buy",
 * "sell" → "Venta"/"Sell". Anything else passes through unchanged.
 */
const p2pTypeText = (text: string): string => {
	if (text === "buy") { return i18n.t('common.p2pType.buy') }
	if (text === "sell") { return i18n.t('common.p2pType.sell') }
	return text
}

// Backend statuses with a localized label in common.status.*
const STATUS_LABEL_KEYS = ['open', 'revision', 'cancelled', 'closed', 'completed', 'processing', 'pending', 'paid', 'received']

/**
 * Localized label for a P2P offer / transaction status ("open" → "Abierta",
 * "paid" → "Pagada", …). Unknown statuses pass through unchanged.
 */
const statusText = (text: string): string => {
	return STATUS_LABEL_KEYS.includes(text) ? i18n.t(`common.status.${text}`) : text
}

/**
 * Fisher–Yates shuffle. Mutates the array in place and returns it.
 * @param array - Array to shuffle.
 * @returns The same (shuffled) array.
 */
const shuffleArray = <T>(array: T[]): T[] => {
	let currentIndex = array.length, randomIndex: number
	while (currentIndex !== 0) {
		randomIndex = Math.floor(Math.random() * currentIndex)
		currentIndex--
		[array[currentIndex], array[randomIndex]] = [
			array[randomIndex], array[currentIndex]]
	}

	return array
}

/**
 * Copies text to the clipboard with a success haptic and a localized toast.
 */
const copyTextToClipboard = (text: string): void => {
	Clipboard.setString(text)
	ReactNativeHapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
	toast.success(i18n.t('common.toasts.copied'), { duration: 1500 })
}

/**
 * First dash-separated chunk of a UUID ("796a9e71-3d67-…" → "796a9e71"),
 * used as a short human-readable reference.
 * @param uuid - UUID string.
 * @returns Empty string for invalid input.
 */
const getFirstChunk = (uuid: string | null | undefined): string => {
	if (!uuid || typeof uuid !== 'string') {
		return ''
	}
	return uuid.split("-")[0]
}

/** Uppercase localized P2P type label: 'buy' → 'COMPRA'/'BUY', anything else → 'VENTA'/'SELL'. */
const getTypeText = (type?: string): string => { return type === 'buy' ? i18n.t('common.p2pType.buyUpper') : i18n.t('common.p2pType.sellUpper') }
/** Theme color for a P2P type: success (green) for 'buy', error (red) otherwise. */
const getTypeColor = (type: string | null | undefined, theme: { colors: { success: string, error: string } }): string => { return type === 'buy' ? theme.colors.success : theme.colors.error }

/**
 * Formats a crypto amount removing unnecessary trailing zeros while always
 * keeping at least 2 decimals:
 *   formatCryptoAmount(0.00145000, 8) → "0.00145"
 *   formatCryptoAmount(1.50000000, 8) → "1.50"
 * @param value - Amount to format.
 * @param maxDecimals - Maximum decimals kept (default 8).
 * @returns "0" for non-numeric input.
 */
const formatCryptoAmount = (value: number | string | null | undefined, maxDecimals: number = 8): string => {
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
const COPYABLE_PATTERNS: { type: CopyableMatch['type'], regex: RegExp }[] = [
	{ type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
	{ type: 'card', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
	{ type: 'phone', regex: /(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{2,4}/g },
]

/**
 * Detects copyable patterns (emails, card numbers, phone numbers) in free
 * text so chat/detail views can offer tap-to-copy. Overlapping matches are
 * resolved keeping the earlier (then longer) one.
 * @param text - Free text to scan.
 * @returns Empty array when nothing matches.
 */
const detectCopyableText = (text: string | null | undefined): CopyableMatch[] => {
	if (!text || typeof text !== 'string') return []
	const all: CopyableMatch[] = []
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
	const filtered: CopyableMatch[] = []
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
 */
const tinyfiNumber = (number: number | string | null | undefined): string => {
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
 */
const formatMoney = (value: number | string | null | undefined): string => {
	const n = Number(value) || 0
	return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
}

// export helpers
export {
	timeSince,
	reduceString,
	getShortDateTime,
	parseQRData,
	parseLightningQR,
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
