/**
 * Render tests for the titled Settings row group — node environment with the
 * theme and SettingsItem mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('./particles/SettingsItem', () => 'SettingsItem')

import React from 'react'
import { act, create } from 'react-test-renderer'
import SettingsSection from './SettingsSection'

const ITEMS = [
	{ title: 'Perfil', icon: 'user', screen: 'Profile' },
	{ title: 'Oculto', icon: 'eye-slash', screen: 'Hidden', enabled: false },
	{ title: 'Seguridad', icon: 'lock', screen: 'Security', showBadge: true },
]

const renderSection = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<SettingsSection
				title='Cuenta'
				items={ITEMS}
				navigation={props.navigation || { navigate: jest.fn() }}
				{...props}
			/>
		)
	})
	return tree
}

test('renders the section heading', () => {
	expect(JSON.stringify(renderSection().toJSON())).toContain('Cuenta')
})

test('filters out disabled items before rendering', () => {
	const rows = renderSection().root.findAllByType('SettingsItem')
	expect(rows.map(r => r.props.title)).toEqual(['Perfil', 'Seguridad'])
})

test('each row gets its index and the enabled total for corner rounding', () => {
	const rows = renderSection().root.findAllByType('SettingsItem')
	expect(rows.map(r => r.props.index)).toEqual([0, 1])
	expect(rows.every(r => r.props.totalItems === 2)).toBe(true)
})

test('forwards navigation, screen, icon and badge flags to each row', () => {
	const navigation = { navigate: jest.fn() }
	const rows = renderSection({ navigation }).root.findAllByType('SettingsItem')
	expect(rows[0].props.navigation).toBe(navigation)
	expect(rows[0].props.screen).toBe('Profile')
	expect(rows[0].props.icon).toBe('user')
	expect(rows[0].props.showBadge).toBeUndefined()
	expect(rows[1].props.showBadge).toBe(true)
})
