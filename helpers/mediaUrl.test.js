/**
 * Pure-logic unit tests — node environment (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import { mediaUrl } from './mediaUrl'

describe('mediaUrl', () => {
	test('null for empty input', () => {
		expect(mediaUrl(null)).toBeNull()
		expect(mediaUrl(undefined)).toBeNull()
		expect(mediaUrl('')).toBeNull()
	})

	test('absolute http(s) URLs pass through untouched', () => {
		expect(mediaUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png')
		expect(mediaUrl('http://cdn.example.com/x.png')).toBe('http://cdn.example.com/x.png')
	})

	test('prefixes CDN-relative paths with the media base', () => {
		expect(mediaUrl('operators/claro-com.png')).toBe('https://media.qvapay.com/operators/claro-com.png')
	})

	test('normalizes leading slashes (S3 403s on double slash)', () => {
		expect(mediaUrl('/operators/claro-com.png')).toBe('https://media.qvapay.com/operators/claro-com.png')
		expect(mediaUrl('//operators/claro-com.png')).toBe('https://media.qvapay.com/operators/claro-com.png')
	})
})
