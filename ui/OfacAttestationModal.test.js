/**
 * Behavior tests for the OFAC certification modal — the four boxes gate the
 * button, the purpose picker (hidden for W-1), the es/en legal text and the
 * `compliance` payload handed to onConfirm. Node environment with theme, icons
 * and the pressable/input particles mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/themeTokens')
	const { createTextStyles, createContainerStyles } = jest.requireActual('../theme/themeUtils')
	const theme = createTheme(true)
	return { useTheme: () => ({ theme, styles: { text: createTextStyles(theme), container: createContainerStyles(theme) } }) }
})
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')
jest.mock('./particles/QPButton', () => 'QPButton')
jest.mock('./particles/QPInput', () => 'QPInput')
jest.mock('./particles/QPPressable', () => 'QPPressable')

import React from 'react'
import { act, create } from 'react-test-renderer'
import OfacAttestationModal from './OfacAttestationModal'

const KEYS = ['notProhibitedOfficial', 'notProhibitedPartyMember', 'notRestrictedList', 'lawfulPurpose']

const renderModal = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<OfacAttestationModal
				visible
				scope="cuba_value"
				context="withdraw"
				tick="BANK_CUP"
				onConfirm={jest.fn()}
				onClose={jest.fn()}
				{...props}
			/>
		)
	})
	return tree
}

const confirmButton = (tree) => tree.root.findAllByType('QPButton').find(b => b.props.testID === 'ofac-attestation-confirm')
const box = (tree, key) => tree.root.findAllByType('QPPressable').find(p => p.props.testID === `ofac-attestation-${key}`)
const purposeOptions = (tree) => tree.root.findAllByType('QPPressable').filter(p => p.props.accessibilityRole === 'radio')
const checkAll = (tree) => KEYS.forEach(k => act(() => { box(tree, k).props.onPress() }))
const text = (tree) => JSON.stringify(tree.toJSON())

test('the confirm button stays disabled until all four boxes are checked', () => {
	const tree = renderModal()
	expect(confirmButton(tree).props.disabled).toBe(true)
	KEYS.slice(0, 3).forEach(k => act(() => { box(tree, k).props.onPress() }))
	expect(confirmButton(tree).props.disabled).toBe(true)
	act(() => { box(tree, 'lawfulPurpose').props.onPress() })
	expect(confirmButton(tree).props.disabled).toBe(false)
	// Desmarcar una vuelve a bloquear
	act(() => { box(tree, 'notRestrictedList').props.onPress() })
	expect(confirmButton(tree).props.disabled).toBe(true)
})

test('confirming hands over the backend payload with the chosen purpose', () => {
	const onConfirm = jest.fn()
	const tree = renderModal({ onConfirm })
	expect(purposeOptions(tree).map(p => p.props.accessibilityState.selected)).toEqual([true, false, false, false])
	act(() => { purposeOptions(tree)[2].props.onPress() })
	act(() => { tree.root.findByType('QPInput').props.onChangeText('Ayuda a mi tía') })
	checkAll(tree)
	act(() => { confirmButton(tree).props.onPress() })
	expect(onConfirm).toHaveBeenCalledWith({
		purposeCode: 'P-3',
		attestations: { notProhibitedOfficial: true, notProhibitedPartyMember: true, notRestrictedList: true, lawfulPurpose: true },
		purposeNote: 'Ayuda a mi tía',
		language: 'es',
	})
})

test('ETECSA preselects the telecom purpose (P-4)', () => {
	const tree = renderModal({ tick: 'ETECSA' })
	expect(purposeOptions(tree)[3].props.accessibilityState.selected).toBe(true)
})

test('W-1 (crypto) shows the own-wallet copy and no purpose picker', () => {
	const onConfirm = jest.fn()
	const tree = renderModal({ scope: 'crypto_out', context: 'crypto', tick: 'USDT', onConfirm })
	expect(purposeOptions(tree)).toHaveLength(0)
	expect(text(tree)).toContain('Atestación de billetera propia')
	expect(text(tree)).toContain('La billetera de destino es mía')
	checkAll(tree)
	act(() => { confirmButton(tree).props.onPress() })
	expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ purposeCode: 'W-1' }))
})

test('the legal text switches to English and the language travels in the payload', () => {
	const onConfirm = jest.fn()
	const tree = renderModal({ context: 'transfer', onConfirm })
	expect(text(tree)).toContain('El destinatario de esta transferencia es un nacional cubano.')
	// Selector ES | EN de la cabecera (radios que no son QPPressable de propósito)
	const en = tree.root.findAll(n => n.props.accessibilityRole === 'radio' && n.type !== 'QPPressable' && typeof n.props.onPress === 'function')[1]
	act(() => { en.props.onPress() })
	expect(text(tree)).toContain('The recipient of this transfer is a Cuban national.')
	checkAll(tree)
	act(() => { confirmButton(tree).props.onPress() })
	expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }))
})

test('funding copy for a U.S. person deposit', () => {
	const tree = renderModal({ scope: 'funding', context: 'topup', tick: 'USDT' })
	expect(text(tree)).toContain('Eres una persona sujeta a la jurisdicción de EE. UU.')
	expect(text(tree)).toContain('debes declarar el uso previsto de estos fondos')
})

test('reopening resets every box (the attestation is never presumed)', () => {
	const tree = renderModal()
	checkAll(tree)
	expect(confirmButton(tree).props.disabled).toBe(false)
	act(() => { tree.update(<OfacAttestationModal visible={false} scope="cuba_value" context="withdraw" tick="BANK_CUP" onConfirm={jest.fn()} onClose={jest.fn()} />) })
	act(() => { tree.update(<OfacAttestationModal visible scope="cuba_value" context="withdraw" tick="BANK_CUP" onConfirm={jest.fn()} onClose={jest.fn()} />) })
	expect(confirmButton(tree).props.disabled).toBe(true)
})
