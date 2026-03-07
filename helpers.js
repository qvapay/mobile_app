import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

// Calculate time since data
const timeSince = (date) => {

	const now = new Date()
	const desiredDate = new Date(date)
	const secondsPast = (now - desiredDate) / 1000

	if (secondsPast < 60) {
		const seconds = parseInt(secondsPast)
		return `${seconds} segundo${seconds > 1 ? 's' : ''}`
	}
	if (secondsPast < 3600) {
		const minutes = parseInt(secondsPast / 60)
		return `${minutes} minuto${minutes > 1 ? 's' : ''}`
	}
	if (secondsPast <= 86400) {
		const hours = parseInt(secondsPast / 3600)
		return `${hours} hora${hours > 1 ? 's' : ''}`
	}
	if (secondsPast > 86400) {
		const day = parseInt(secondsPast / 86400)
		return `${day} dia${day > 1 ? 's' : ''}`
	}
	if (secondsPast > 604800) {
		const week = parseInt(secondsPast / 604800)
		return `${week} semana${week > 1 ? 's' : ''}`
	}
}

// String reduce function from P2P_796a9e71-3d67-4a42-9dc2-02a5d069fa23 to P2P_796a9e71
const reduceString = (string, amount = 20) => { return string.substring(0, amount) }

// String reduce function from TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy to TEvQ.....QBRVy
const reduceStringInside = (string, amount = 20) => { return string.substring(0, amount) + '...' + string.substring(string.length - amount) }

// Get a long format date and return a short format date time
const getShortDateTime = (date) => {
	const desiredDate = new Date(date)
	return desiredDate.toLocaleString('es-ES', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })
}

// get a time ago from a date
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

// get a QR data and parse it robustly using RegExp
// Supports (with or without www):
// 1) https://[www.]qvapay.com/payme/username/<name>[/<amount>]
// 2) https://[www.]qvapay.com/payme/uuid/<uuid>[/<amount>]
// 3) https://[www.]qvapay.com/payme/<identifier>[/<amount>] (auto-detects uuid vs username)
const parseQRData = (data) => {

	if (typeof data !== 'string') { return null }

	// Strip query/hash parts to simplify matching
	const raw = data.trim()
	const pathOnly = raw.split('?')[0].split('#')[0]

	// Typed patterns
	const reUsernameTyped = /^https?:\/\/(?:www\.)?qvapay\.com\/payme\/username\/([^\/?#]+)(?:\/([^\/?#]+))?\/?$/i
	const reUuidTyped = /^https?:\/\/(?:www\.)?qvapay\.com\/payme\/uuid\/([0-9a-fA-F-]{8,})(?:\/([^\/?#]+))?\/?$/i

	// Untyped pattern (identifier could be username or uuid)
	const reUntyped = /^https?:\/\/(?:www\.)?qvapay\.com\/payme\/([^\/?#]+)(?:\/([^\/?#]+))?\/?$/i

	let match

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

// Check for a valid QR data
const isValidQRData = (parsedData) => {
	if (parsedData === null) { return false }
	if ('transactionUUID' in parsedData) { return true }
	return 'username' in parsedData && 'amount' in parsedData
}

// Get a list of coins and filter them by IN/OUT/P2P 
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
		const category = coins.find((category) => category.name === categoryName)
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

// Show only initial and latest letters from a wallet
const truncateWalletAddress = (address, amount = 10) => { return address.length > 28 ? address.substring(0, amount) + '...' + address.substring(address.length - amount) : address }

// Adjust a number to a valid format and correct amount of decimals
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

// transform "buy" and "sell" text into "Compra" and "Venta"
const p2pTypeText = (text) => {
	if (text === "buy") { return "Compra" }
	if (text === "sell") { return "Venta" }
	return text
}

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

// Shuffle array function
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

// Copy wallet address to clipboard
const copyTextToClipboard = (text) => {
	Clipboard.setString(text)
	ReactNativeHapticFeedback.trigger('notificationSuccess', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false })
	toast.success('Copiado al portapapeles', { duration: 1500 })
}

// take am uuid and return the fir chunk of it
const getFirstChunk = (uuid) => {
	if (!uuid || typeof uuid !== 'string') {
		return ''
	}
	return uuid.split("-")[0]
}

const getTypeText = type => { return type === 'buy' ? 'COMPRA' : 'VENTA' }
const getTypeColor = (type, theme) => { return type === 'buy' ? theme.colors.success : theme.colors.error }

// Format crypto amounts removing unnecessary trailing zeros
// formatCryptoAmount(0.00145000, 8) → "0.00145"
// formatCryptoAmount(1.50000000, 8) → "1.50"
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
	formatCryptoAmount
}