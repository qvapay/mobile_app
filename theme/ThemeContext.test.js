/**
 * ThemeProvider — the theme is DERIVED from settings (no copy into state), so a
 * settings change reaches consumers in the same render that carries it.
 * @jest-environment node
 */
const mockScheme = { current: 'dark' }
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
	__esModule: true,
	default: () => mockScheme.current,
}))

import { act, create } from 'react-test-renderer'
import { ThemeProvider, useTheme } from './ThemeContext'
import { createTheme, fontScaleMap } from './themeTokens'

const appearance = (overrides = {}) => ({ appearance: { theme: 'dark', fontSize: 'medium', accentColor: 'default', ...overrides } })

// Records the context value seen on EVERY render of a consumer
const renderProvider = async (props) => {
	const seen = []
	const Probe = () => { seen.push(useTheme()); return null }
	let tree
	await act(async () => { tree = create(<ThemeProvider {...props}><Probe /></ThemeProvider>) })
	const update = async (next) => { await act(async () => { tree.update(<ThemeProvider {...next}><Probe /></ThemeProvider>) }) }
	return { seen, last: () => seen[seen.length - 1], update, tree }
}

describe('ThemeProvider', () => {

	afterEach(() => { mockScheme.current = 'dark' })

	test('the first render already uses the stored appearance', async () => {
		const { seen } = await renderProvider({ settings: appearance({ theme: 'light', fontSize: 'large', accentColor: 'ocean' }) })
		expect(seen[0].isDark).toBe(false)
		expect(seen[0].theme.colors.primary).toBe(createTheme(false, 1, 'ocean').colors.primary)
		expect(seen[0].theme.typography.fontSize.md).toBe(createTheme(false, fontScaleMap.large).typography.fontSize.md)
	})

	test('a settings change (e.g. hydration from disk) is visible in the very next render, not after an effect', async () => {
		const { seen, update } = await renderProvider({ settings: appearance() })
		const before = seen.length
		await update({ settings: appearance({ theme: 'light' }) })
		// Every render after the change carries the new theme: no stale frame in between
		expect(seen.slice(before).every(v => v.isDark === false)).toBe(true)
	})

	test("'auto' follows the system scheme", async () => {
		mockScheme.current = 'light'
		const { last } = await renderProvider({ settings: appearance({ theme: 'auto' }) })
		expect(last().isDark).toBe(false)
		expect(last().themeMode).toBe('auto')
	})

	test('without the GOLD entitlement the brand accent is used, keeping the stored choice', async () => {
		const { last } = await renderProvider({ settings: appearance({ accentColor: 'ocean' }), accentAllowed: false })
		expect(last().theme.colors.primary).toBe(createTheme(true).colors.primary)
		expect(last().accentKey).toBe('ocean')
	})

	test('with settings, setters write through updateSettings', async () => {
		const updateSettings = jest.fn(async () => {})
		const { last } = await renderProvider({ settings: appearance(), updateSettings })
		await act(async () => { await last().setFontSize('large') })
		await act(async () => { await last().setThemeMode('light') })
		await act(async () => { await last().setAccentColor('ocean') })
		expect(updateSettings.mock.calls).toEqual([
			['appearance', { fontSize: 'large' }],
			['appearance', { theme: 'light' }],
			['appearance', { accentColor: 'ocean' }],
		])
	})

	test('without settings, setters drive local state', async () => {
		const { last } = await renderProvider({})
		expect(last().isDark).toBe(true)
		await act(async () => { last().toggleTheme() })
		expect(last().isDark).toBe(false)
		await act(async () => { await last().setFontSize('small') })
		expect(last().fontSizeKey).toBe('small')
		await act(async () => { await last().setAccentColor('emerald') })
		expect(last().theme.colors.primary).toBe(createTheme(false, fontScaleMap.small, 'emerald').colors.primary)
	})
})
