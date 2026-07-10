/**
 * @jest-environment node
 */
import { stripEmojis, displayName, displayFullName } from './displayName'

describe('stripEmojis', () => {
	it('removes common pictograph emojis', () => {
		expect(stripEmojis('Osmany 💰🙏')).toBe('Osmany')
	})

	it('removes emojis in the middle, collapsing whitespace', () => {
		expect(stripEmojis('Juan 🔥 Pérez')).toBe('Juan Pérez')
	})

	it('removes ZWJ sequences (family / profession emojis)', () => {
		expect(stripEmojis('Ana 👨‍👩‍👧‍👦')).toBe('Ana')
	})

	it('removes skin-tone modified emojis', () => {
		expect(stripEmojis('Luis 👍🏽')).toBe('Luis')
	})

	it('removes flag emojis (regional indicators)', () => {
		expect(stripEmojis('Pedro 🇨🇺')).toBe('Pedro')
	})

	it('removes keycap sequences entirely (digit does not survive)', () => {
		expect(stripEmojis('Top 1️⃣ vendedor')).toBe('Top vendedor')
	})

	it('removes dingbats and stars', () => {
		expect(stripEmojis('✨ María ⭐✔️')).toBe('María')
	})

	it('keeps accents and ñ intact', () => {
		expect(stripEmojis('Ñico Peñalver Muñoz')).toBe('Ñico Peñalver Muñoz')
	})

	it('handles empty and nullish input', () => {
		expect(stripEmojis('')).toBe('')
		expect(stripEmojis(null)).toBe('')
		expect(stripEmojis(undefined)).toBe('')
	})
})

describe('displayName', () => {
	it('keeps emojis for golden_check users', () => {
		expect(displayName({ name: 'Osmany 💰🙏', golden_check: true })).toBe('Osmany 💰🙏')
	})

	it('strips emojis for regular users', () => {
		expect(displayName({ name: 'Osmany 💰🙏', golden_check: false })).toBe('Osmany')
		expect(displayName({ name: 'Osmany 💰🙏' })).toBe('Osmany')
	})

	it('falls back to username when the name was only emojis', () => {
		expect(displayName({ name: '💰🙏', username: 'osmany' })).toBe('osmany')
	})

	it('returns empty string for missing user', () => {
		expect(displayName(undefined)).toBe('')
		expect(displayName({})).toBe('')
	})
})

describe('displayFullName', () => {
	it('joins name and lastname stripping emojis for non-gold', () => {
		expect(displayFullName({ name: 'Juan 🔥', lastname: 'Pérez 🚀' })).toBe('Juan Pérez')
	})

	it('keeps emojis for gold users', () => {
		expect(displayFullName({ name: 'Juan 🔥', lastname: 'Pérez', golden_check: true })).toBe('Juan 🔥 Pérez')
	})

	it('handles missing lastname', () => {
		expect(displayFullName({ name: 'Juan' })).toBe('Juan')
	})
})
