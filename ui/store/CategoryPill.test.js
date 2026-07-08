/**
 * Render tests for the store category chip — node environment with the theme
 * mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
const mockTheme = { mode: 'dark' }
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(mockTheme.mode === 'dark'), mode: mockTheme.mode } }) }
})

import React from 'react'
import { act, create } from 'react-test-renderer'
import CategoryPill from './CategoryPill'

const renderPill = (props = {}) => {
	let tree
	act(() => { tree = create(<CategoryPill label='Gaming' onPress={jest.fn()} {...props} />) })
	return tree
}

const pillStyle = (tree) => Object.assign({}, ...[].concat(tree.toJSON().props.style))

beforeEach(() => { mockTheme.mode = 'dark' })

test('selected chip uses the primary background with white text', () => {
	const style = pillStyle(renderPill({ active: true }))
	expect(style.backgroundColor).toBe('#6759EF')
})

test('unselected chip in dark mode is a borderless surface (house style)', () => {
	const style = pillStyle(renderPill({ active: false }))
	expect(style.backgroundColor).toBe('#1E2039')
	expect(style.borderWidth).toBeUndefined()
})

test('unselected chip in light mode is transparent with a border', () => {
	mockTheme.mode = 'light'
	const style = pillStyle(renderPill({ active: false }))
	expect(style.backgroundColor).toBe('transparent')
	expect(style.borderWidth).toBe(1)
})

test('renders the optional emoji prefix and count suffix', () => {
	const out = JSON.stringify(renderPill({ emoji: '🎮', count: 12 }).toJSON())
	expect(out).toContain('🎮')
	expect(out).toContain('Gaming')
	expect(out).toContain('12')
	const bare = JSON.stringify(renderPill().toJSON())
	expect(bare).not.toContain('🎮')
})

test('a zero count still renders (only null/undefined hide it)', () => {
	expect(JSON.stringify(renderPill({ count: 0 }).toJSON())).toContain('"0"')
	expect(JSON.stringify(renderPill({ count: undefined }).toJSON())).not.toContain('"0"')
})

test('taps flow through onPress', () => {
	const onPress = jest.fn()
	const tree = renderPill({ onPress })
	act(() => { tree.root.find(n => typeof n.props.onPress === 'function').props.onPress() })
	expect(onPress).toHaveBeenCalled()
})
