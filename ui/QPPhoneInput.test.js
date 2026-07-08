/**
 * Render tests for the country-chip + phone input row (selectable vs locked
 * modes, internal CountryPickerModal state) — node environment with theme,
 * icons and child components mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
let mockIsDark = true
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: { ...createTheme(mockIsDark), mode: mockIsDark ? 'dark' : 'light' } }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPInput', () => 'QPInput')
jest.mock('./particles/QPPressable', () => 'QPPressable')
jest.mock('./CountryPickerModal', () => 'CountryPickerModal')

import React from 'react'
import { act, create } from 'react-test-renderer'
import QPPhoneInput from './QPPhoneInput'

const renderInput = (props = {}) => {
	let tree
	act(() => { tree = create(<QPPhoneInput {...props} />) })
	return tree
}

beforeEach(() => { mockIsDark = true })

test('selectable mode shows the dial code for the given ISO country', () => {
	const out = JSON.stringify(renderInput({ country: 'US' }).toJSON())
	expect(out).toContain('+1')
	// unknown country falls back to +53
	const fallback = JSON.stringify(renderInput({ country: 'ZZ' }).toJSON())
	expect(fallback).toContain('+53')
})

test('the chip opens the picker and selecting a country closes it again', () => {
	const onChangeCountry = jest.fn()
	const tree = renderInput({ country: 'CU', onChangeCountry })
	const modal = tree.root.findByType('CountryPickerModal')
	expect(modal.props.visible).toBe(false)

	act(() => { tree.root.findByType('QPPressable').props.onPress() })
	expect(modal.props.visible).toBe(true)

	act(() => { modal.props.onChangeSearch('esta') })
	expect(modal.props.countrySearch).toBe('esta')

	act(() => { modal.props.onSelect('US') })
	expect(onChangeCountry).toHaveBeenCalledWith('US')
	expect(modal.props.visible).toBe(false)
	expect(modal.props.countrySearch).toBe('') // search resets on select
})

test('closing the picker resets the search without changing the country', () => {
	const onChangeCountry = jest.fn()
	const tree = renderInput({ country: 'CU', onChangeCountry })
	const modal = tree.root.findByType('CountryPickerModal')
	act(() => { tree.root.findByType('QPPressable').props.onPress() })
	act(() => { modal.props.onChangeSearch('cana') })
	act(() => { modal.props.onClose() })
	expect(onChangeCountry).not.toHaveBeenCalled()
	expect(modal.props.visible).toBe(false)
	expect(modal.props.countrySearch).toBe('')
})

test('locked mode shows a static chip with flag and dial and no picker', () => {
	const tree = renderInput({ lockedCountry: { dial: '+53', flag: '🇨🇺' } })
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('+53')
	expect(out).toContain('🇨🇺')
	expect(tree.root.findAllByType('QPPressable')).toHaveLength(0)
	expect(tree.root.findAllByType('CountryPickerModal')).toHaveLength(0)
})

test('forwards the remaining props to the QPInput and shows the valid badge', () => {
	const onChangeText = jest.fn()
	const tree = renderInput({ country: 'CU', value: '55555555', onChangeText, valid: true })
	const input = tree.root.findByType('QPInput')
	expect(input.props.value).toBe('55555555')
	expect(input.props.onChangeText).toBe(onChangeText)
	expect(input.props.placeholder).toBe('Número de teléfono')
	expect(input.props.keyboardType).toBe('phone-pad')
	expect(tree.root.findAllByType('FontAwesome6').some(i => i.props.name === 'circle-check')).toBe(true)
})
