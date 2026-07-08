/**
 * Pure-logic unit tests — node environment (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import {
	QVAPAY_STICKERS,
	getStickerMediaUrl,
	parseTransactionDescription,
	buildStickerDescription,
} from './stickers'

describe('QVAPAY_STICKERS catalog', () => {
	test('has 20 unique .webm wire names', () => {
		expect(QVAPAY_STICKERS).toHaveLength(20)
		expect(new Set(QVAPAY_STICKERS).size).toBe(QVAPAY_STICKERS.length)
		for (const name of QVAPAY_STICKERS) { expect(name).toMatch(/^[a-z]+\.webm$/) }
	})
})

describe('getStickerMediaUrl', () => {
	test('swaps .webm for .gif on the qvi CDN path (iOS cannot decode webm)', () => {
		expect(getStickerMediaUrl('joy.webm')).toBe('https://media.qvapay.com/qvi/joy.gif')
	})

	test('non-string input degrades to the bare base path', () => {
		expect(getStickerMediaUrl(undefined)).toBe('https://media.qvapay.com/qvi/')
	})
})

describe('parseTransactionDescription', () => {
	test('empty / non-string input is empty text', () => {
		expect(parseTransactionDescription('')).toEqual({ type: 'text', text: '', sticker: null })
		expect(parseTransactionDescription(undefined)).toEqual({ type: 'text', text: '', sticker: null })
	})

	test('exact :sticker: payload with a catalog name is a sticker', () => {
		expect(parseTransactionDescription(':sticker:joy.webm'))
			.toEqual({ type: 'sticker', text: '', sticker: 'joy.webm' })
	})

	test('unknown sticker names degrade gracefully to plain text', () => {
		expect(parseTransactionDescription(':sticker:notreal.webm'))
			.toEqual({ type: 'text', text: ':sticker:notreal.webm', sticker: null })
	})

	test('regular descriptions are plain text', () => {
		expect(parseTransactionDescription('Pago de prueba'))
			.toEqual({ type: 'text', text: 'Pago de prueba', sticker: null })
	})

	test('round-trips with buildStickerDescription for every catalog sticker', () => {
		for (const name of QVAPAY_STICKERS) {
			expect(parseTransactionDescription(buildStickerDescription(name)))
				.toEqual({ type: 'sticker', text: '', sticker: name })
		}
	})
})

describe('buildStickerDescription', () => {
	test('builds the wire format persisted by the backend', () => {
		expect(buildStickerDescription('love.webm')).toBe(':sticker:love.webm')
	})
})
