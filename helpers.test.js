/**
 * Pure-logic unit tests for the legacy helpers grab-bag — run in the node
 * environment to avoid the React Native jest preset's bundled jest 29
 * packages (which clash with jest 30 in devDeps).
 * @jest-environment node
 */
jest.mock('sonner-native', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }))
jest.mock('react-native-haptic-feedback', () => ({ trigger: jest.fn() }))

import {
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
	formatMoney,
} from './helpers'
import { toast } from 'sonner-native'
import Clipboard from '@react-native-clipboard/clipboard'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

const NOW = new Date('2026-07-07T12:00:00.000Z')
const secondsAgo = (s) => new Date(NOW.getTime() - s * 1000)

beforeAll(() => { jest.useFakeTimers({ now: NOW }) })
afterAll(() => { jest.useRealTimers() })

describe('timeSince', () => {
	test('seconds, singular and plural', () => {
		expect(timeSince(secondsAgo(1))).toBe('1 segundo')
		expect(timeSince(secondsAgo(45))).toBe('45 segundos')
	})

	test('minutes and hours', () => {
		expect(timeSince(secondsAgo(60))).toBe('1 minuto')
		expect(timeSince(secondsAgo(15 * 60))).toBe('15 minutos')
		expect(timeSince(secondsAgo(3600))).toBe('1 hora')
		expect(timeSince(secondsAgo(5 * 3600))).toBe('5 horas')
	})

	test('anything over a day reports in days (week branch is unreachable)', () => {
		expect(timeSince(secondsAgo(2 * 86400))).toBe('2 dias')
		expect(timeSince(secondsAgo(10 * 86400))).toBe('10 dias')
	})
})

describe('timeAgo', () => {
	test('largest unit only, Spanish labels', () => {
		expect(timeAgo(secondsAgo(30))).toBe('30 segundos')
		expect(timeAgo(secondsAgo(90))).toBe('1 minuto')
		expect(timeAgo(secondsAgo(2 * 3600))).toBe('2 horas')
		expect(timeAgo(secondsAgo(3 * 86400))).toBe('3 días')
		expect(timeAgo(secondsAgo(60 * 86400))).toBe('2 meses')
		expect(timeAgo(secondsAgo(2 * 31536000))).toBe('2 años')
	})

	test('singular month and year', () => {
		expect(timeAgo(secondsAgo(35 * 86400))).toBe('1 mes')
		expect(timeAgo(secondsAgo(400 * 86400))).toBe('1 año')
	})
})

describe('getShortDateTime', () => {
	test('formats as a short es-ES date-time', () => {
		const out = getShortDateTime('2026-07-07T10:30:00')
		expect(out).toMatch(/07\/07\/26/)
		expect(out).toMatch(/10:30/)
	})
})

describe('string helpers', () => {
	test('reduceString keeps the first N characters', () => {
		expect(reduceString('P2P_796a9e71-3d67-4a42-9dc2-02a5d069fa23', 12)).toBe('P2P_796a9e71')
		expect(reduceString('short')).toBe('short')
	})

	test('reduceStringInside keeps N characters on each side', () => {
		expect(reduceStringInside('TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy', 4)).toBe('TEvQ...BRVy')
	})

	test('truncateWalletAddress middle-ellipsizes long addresses only', () => {
		const addr = 'TEvQ7WSPCbJCKVC7qLo29L6zGJb2VQBRVy'
		expect(truncateWalletAddress(addr, 4)).toBe('TEvQ...BRVy')
		expect(truncateWalletAddress('shortaddress')).toBe('shortaddress')
		// 28 chars exactly passes through untouched
		expect(truncateWalletAddress('a'.repeat(28))).toBe('a'.repeat(28))
	})

	test('getFirstChunk returns the first uuid segment, empty on invalid input', () => {
		expect(getFirstChunk('796a9e71-3d67-4a42-9dc2-02a5d069fa23')).toBe('796a9e71')
		expect(getFirstChunk('')).toBe('')
		expect(getFirstChunk(null)).toBe('')
		expect(getFirstChunk(42)).toBe('')
	})
})

describe('parseQRData', () => {
	test('rejects non-strings and unrelated payloads', () => {
		expect(parseQRData(null)).toBeNull()
		expect(parseQRData(123)).toBeNull()
		expect(parseQRData('https://example.com/whatever')).toBeNull()
		expect(parseQRData('random text')).toBeNull()
	})

	test('merchant invoice links (https, www, dev hosts, custom scheme)', () => {
		const uuid = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'
		expect(parseQRData(`https://qvapay.com/pay/${uuid}`)).toEqual({ type: 'pay', uuid })
		expect(parseQRData(`https://www.qvapay.com/pay/${uuid}/`)).toEqual({ type: 'pay', uuid })
		expect(parseQRData(`http://192.168.0.10:3000/pay/${uuid}`)).toEqual({ type: 'pay', uuid })
		expect(parseQRData(`http://localhost:3000/pay/${uuid}`)).toEqual({ type: 'pay', uuid })
		expect(parseQRData(`qvapay://pay/${uuid}`)).toEqual({ type: 'pay', uuid })
	})

	test('explicit username payme routes, with and without amount', () => {
		expect(parseQRData('https://qvapay.com/payme/username/erich'))
			.toEqual({ type: 'payme', username: 'erich' })
		expect(parseQRData('https://www.qvapay.com/payme/username/erich/25.50'))
			.toEqual({ type: 'payme', username: 'erich', amount: '25.50' })
	})

	test('explicit uuid payme routes', () => {
		const uuid = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'
		expect(parseQRData(`https://qvapay.com/payme/uuid/${uuid}`))
			.toEqual({ type: 'payme', uuid })
		expect(parseQRData(`https://qvapay.com/payme/uuid/${uuid}/10`))
			.toEqual({ type: 'payme', uuid, amount: '10' })
	})

	test('untyped payme route auto-detects uuid vs username', () => {
		const uuid = '796a9e71-3d67-4a42-9dc2-02a5d069fa23'
		expect(parseQRData(`https://qvapay.com/payme/${uuid}`)).toEqual({ type: 'payme', uuid })
		expect(parseQRData('https://qvapay.com/payme/erich')).toEqual({ type: 'payme', username: 'erich' })
		expect(parseQRData('https://qvapay.com/payme/erich/5'))
			.toEqual({ type: 'payme', username: 'erich', amount: '5' })
	})

	test('strips query string and hash before matching', () => {
		expect(parseQRData('https://qvapay.com/payme/erich?utm_source=qr#top'))
			.toEqual({ type: 'payme', username: 'erich' })
	})
})

describe('isValidQRData', () => {
	test('null is invalid', () => { expect(isValidQRData(null)).toBe(false) })

	test('legacy transactionUUID payloads are valid', () => {
		expect(isValidQRData({ transactionUUID: 'abc' })).toBe(true)
	})

	test('payme intents need BOTH username and amount', () => {
		expect(isValidQRData({ type: 'payme', username: 'erich', amount: '5' })).toBe(true)
		expect(isValidQRData({ type: 'payme', username: 'erich' })).toBe(false)
		expect(isValidQRData({ type: 'payme', uuid: 'x', amount: '5' })).toBe(false)
	})
})

describe('filterCoins', () => {
	const catalog = [
		{
			name: 'Bank',
			coins: [
				{ tick: 'BANK_IN', enabled_in: 1, enabled_out: 0, enabled_p2p: 1, min_in: '10', min_out: '20' },
				{ tick: 'BANK_OUT', enabled_in: 0, enabled_out: 1, enabled_p2p: 0, min_in: '5', min_out: '50' },
			],
		},
		{
			name: 'Criptomonedas',
			coins: [
				{ tick: 'BTC', enabled_in: 1, enabled_out: 1, enabled_p2p: 1, min_in: '100', min_out: '10' },
			],
		},
		// E-Wallet category intentionally missing to exercise the fallback
	]

	test('filters by enabled_in for IN mode and groups by category', () => {
		const { banks, cryptoCurrencies, eWallets } = filterCoins({ coins: catalog, in_out_p2p: 'IN' })
		expect(banks.map(c => c.tick)).toEqual(['BANK_IN'])
		expect(cryptoCurrencies.map(c => c.tick)).toEqual(['BTC'])
		expect(eWallets).toEqual([]) // missing category falls back to []
	})

	test('filters by enabled_out for OUT mode', () => {
		const { banks } = filterCoins({ coins: catalog, in_out_p2p: 'OUT' })
		expect(banks.map(c => c.tick)).toEqual(['BANK_OUT'])
	})

	test('filters by enabled_p2p for P2P mode', () => {
		const { banks } = filterCoins({ coins: catalog, in_out_p2p: 'P2P' })
		expect(banks.map(c => c.tick)).toEqual(['BANK_IN'])
	})

	test('unknown mode yields empty groups', () => {
		const { banks, cryptoCurrencies } = filterCoins({ coins: catalog, in_out_p2p: 'NOPE' })
		expect(banks).toEqual([])
		expect(cryptoCurrencies).toEqual([])
	})

	test('amount > 0 also drops coins whose min_in exceeds it (IN mode)', () => {
		const { banks, cryptoCurrencies } = filterCoins({ coins: catalog, in_out_p2p: 'IN', amount: 50 })
		expect(banks.map(c => c.tick)).toEqual(['BANK_IN']) // min_in 10 <= 50
		expect(cryptoCurrencies).toEqual([]) // BTC min_in 100 > 50
	})

	test('amount > 0 checks min_out in OUT mode', () => {
		const { banks, cryptoCurrencies } = filterCoins({ coins: catalog, in_out_p2p: 'OUT', amount: 30 })
		expect(banks).toEqual([]) // BANK_OUT min_out 50 > 30
		expect(cryptoCurrencies.map(c => c.tick)).toEqual(['BTC']) // min_out 10 <= 30
	})
})

describe('adjustNumber', () => {
	test('two decimals from 0.0001 upward', () => {
		expect(adjustNumber(12)).toBe('12.00')
		expect(adjustNumber(1)).toBe('1.00')
		expect(adjustNumber(0.5)).toBe('0.50')
		expect(adjustNumber('0.0001')).toBe('0.00')
	})

	test('exponential notation below 0.0001', () => {
		expect(adjustNumber(0.000015)).toBe('1.5e-5')
		expect(adjustNumber(0.00005)).toBe('5.0e-5')
	})

	test('null for exactly zero, passthrough for non-numeric', () => {
		expect(adjustNumber(0)).toBeNull()
		expect(adjustNumber('0')).toBeNull()
		expect(adjustNumber('abc')).toBe('abc')
	})
})

describe('P2P label helpers', () => {
	test('p2pTypeText translates buy/sell and passes through the rest', () => {
		expect(p2pTypeText('buy')).toBe('Compra')
		expect(p2pTypeText('sell')).toBe('Venta')
		expect(p2pTypeText('other')).toBe('other')
	})

	test('statusText translates known statuses and passes through the rest', () => {
		expect(statusText('open')).toBe('Abierta')
		expect(statusText('revision')).toBe('Revisión')
		expect(statusText('cancelled')).toBe('Cancelada')
		expect(statusText('closed')).toBe('Cerrada')
		expect(statusText('completed')).toBe('Completada')
		expect(statusText('processing')).toBe('Procesando')
		expect(statusText('pending')).toBe('Pendiente')
		expect(statusText('paid')).toBe('Pagada')
		expect(statusText('received')).toBe('Recibida')
		expect(statusText('weird')).toBe('weird')
	})

	test('getTypeText uppercases: buy → COMPRA, anything else → VENTA', () => {
		expect(getTypeText('buy')).toBe('COMPRA')
		expect(getTypeText('sell')).toBe('VENTA')
		expect(getTypeText(undefined)).toBe('VENTA')
	})

	test('getTypeColor maps buy → success, otherwise error', () => {
		const theme = { colors: { success: '#7BFFB1', error: '#DB253E' } }
		expect(getTypeColor('buy', theme)).toBe('#7BFFB1')
		expect(getTypeColor('sell', theme)).toBe('#DB253E')
	})
})

describe('shuffleArray', () => {
	test('returns the same array reference with the same elements', () => {
		const input = [1, 2, 3, 4, 5]
		const out = shuffleArray(input)
		expect(out).toBe(input)
		expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
	})

	test('handles empty and single-element arrays', () => {
		expect(shuffleArray([])).toEqual([])
		expect(shuffleArray([1])).toEqual([1])
	})
})

describe('copyTextToClipboard', () => {
	test('copies, triggers haptic and shows the Spanish toast', () => {
		copyTextToClipboard('hola')
		expect(Clipboard.setString).toHaveBeenCalledWith('hola')
		expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledWith(
			'notificationSuccess',
			expect.objectContaining({ enableVibrateFallback: true })
		)
		expect(toast.success).toHaveBeenCalledWith('Copiado al portapapeles', { duration: 1500 })
	})
})

describe('formatCryptoAmount', () => {
	test('removes unnecessary trailing zeros keeping at least 2 decimals', () => {
		expect(formatCryptoAmount(0.00145, 8)).toBe('0.00145')
		expect(formatCryptoAmount(1.5, 8)).toBe('1.50')
		expect(formatCryptoAmount(5)).toBe('5.00')
		expect(formatCryptoAmount('0.10000000')).toBe('0.10')
		expect(formatCryptoAmount(0)).toBe('0.00')
	})

	test('returns "0" for non-numeric input', () => {
		expect(formatCryptoAmount('abc')).toBe('0')
		expect(formatCryptoAmount(undefined)).toBe('0')
	})
})

describe('detectCopyableText', () => {
	test('empty / non-string input yields an empty array', () => {
		expect(detectCopyableText('')).toEqual([])
		expect(detectCopyableText(null)).toEqual([])
		expect(detectCopyableText(42)).toEqual([])
		expect(detectCopyableText('sin nada copiable aqui')).toEqual([])
	})

	test('detects emails', () => {
		const out = detectCopyableText('escribe a soporte@qvapay.com por ayuda')
		expect(out).toHaveLength(1)
		expect(out[0]).toMatchObject({ type: 'email', value: 'soporte@qvapay.com' })
	})

	test('detects card numbers with spaces or dashes', () => {
		const out = detectCopyableText('tarjeta 1234 5678 9012 3456 lista')
		expect(out.some(m => m.type === 'card' && m.value === '1234 5678 9012 3456')).toBe(true)
	})

	test('detects phone numbers', () => {
		const out = detectCopyableText('llama al +53 5555 1234')
		expect(out.some(m => m.type === 'phone')).toBe(true)
	})

	test('overlapping matches keep the earlier/longer one (email wins over its digits)', () => {
		const out = detectCopyableText('user123@mail.com')
		expect(out).toHaveLength(1)
		expect(out[0].type).toBe('email')
	})

	test('reports start/end offsets', () => {
		const text = 'a@b.co fin'
		const [m] = detectCopyableText(text)
		expect(text.slice(m.start, m.end)).toBe(m.value)
	})
})

describe('tinyfiNumber', () => {
	test('floors integers below 1000', () => {
		expect(tinyfiNumber(999.9)).toBe('999')
		expect(tinyfiNumber(0)).toBe('0')
	})

	test('1000 exactly stays as-is', () => {
		expect(tinyfiNumber(1000)).toBe('1000')
	})

	test('K notation with 2 decimals below 10K, 1 decimal above', () => {
		expect(tinyfiNumber(1234)).toBe('1.23K')
		expect(tinyfiNumber(12345)).toBe('12.3K')
	})

	test('M notation from a million', () => {
		expect(tinyfiNumber(1234567)).toBe('1.2M')
	})

	test('non-numeric input coerces to 0', () => {
		expect(tinyfiNumber('abc')).toBe('0')
	})
})

describe('formatMoney', () => {
	test('sign goes BEFORE the symbol', () => {
		expect(formatMoney(12.5)).toBe('$12.50')
		expect(formatMoney(-12.5)).toBe('-$12.50')
	})

	test('coerces strings and defaults to $0.00', () => {
		expect(formatMoney('7')).toBe('$7.00')
		expect(formatMoney(undefined)).toBe('$0.00')
		expect(formatMoney('abc')).toBe('$0.00')
	})
})
