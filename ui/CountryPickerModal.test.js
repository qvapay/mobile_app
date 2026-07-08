/**
 * Render tests for the searchable country picker — node environment with the
 * particles mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('./particles/QPPressable', () => 'QPPressable')
jest.mock('./particles/QPInput', () => 'QPInput')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../theme/ThemeContext'
import { createTextStyles } from '../theme/themeUtils'
import { countries } from '../labels/countries'
import CountryPickerModal from './CountryPickerModal'

const theme = createTheme(true)
const textStyles = createTextStyles(theme)

const renderPicker = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<CountryPickerModal
				visible
				country='CU'
				countrySearch=''
				onChangeSearch={jest.fn()}
				onSelect={jest.fn()}
				onClose={jest.fn()}
				theme={theme}
				textStyles={textStyles}
				{...props}
			/>
		)
	})
	return tree
}

// Country rows are the QPPressables styled as list items (the close button has no style prop)
const rowsOf = (tree) => tree.root.findAllByType('QPPressable').filter(p => p.props.variant === 'opacity')

test('with no search it lists the full catalog', () => {
	const tree = renderPicker()
	expect(rowsOf(tree)).toHaveLength(countries.length)
})

test('filters by name or ISO code, case-insensitive', () => {
	const byName = renderPicker({ countrySearch: 'cuba' })
	expect(rowsOf(byName).length).toBeGreaterThanOrEqual(1)
	expect(JSON.stringify(byName.toJSON())).toContain('Cuba')

	const byCode = renderPicker({ countrySearch: 'MX' })
	expect(JSON.stringify(byCode.toJSON())).toContain('xico') // México
})

test('a nonsense query yields an empty list', () => {
	expect(rowsOf(renderPicker({ countrySearch: 'zzzzz' }))).toHaveLength(0)
})

test('the selected country row is highlighted in primary', () => {
	const tree = renderPicker({ countrySearch: 'cuba' })
	const selected = rowsOf(tree).find(r => JSON.stringify(r.props.style).includes('#6759EF'))
	expect(selected).toBeDefined()
})

test('tapping a row reports its ISO code', () => {
	const onSelect = jest.fn()
	const tree = renderPicker({ countrySearch: 'cuba', onSelect })
	act(() => { rowsOf(tree)[0].props.onPress() })
	expect(onSelect).toHaveBeenCalledWith('CU')
})

test('typing in the search box flows through onChangeSearch', () => {
	const onChangeSearch = jest.fn()
	const tree = renderPicker({ onChangeSearch })
	act(() => { tree.root.findByType('QPInput').props.onChangeText('arg') })
	expect(onChangeSearch).toHaveBeenCalledWith('arg')
})

test('the back button closes through onRequestClose', () => {
	const onClose = jest.fn()
	const tree = renderPicker({ onClose })
	act(() => { tree.root.findByProps({ transparent: true }).props.onRequestClose() })
	expect(onClose).toHaveBeenCalled()
})
