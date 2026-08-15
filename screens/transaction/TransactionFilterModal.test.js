/**
 * Render tests del modal de filtros de transacciones: el botón "Limpiar" del
 * split-button solo se abre cuando hay filtros activos — y al deseleccionar,
 * el draft guarda `undefined`, así que contar claves no basta.
 * @jest-environment node
 */
jest.mock('../../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../../theme/ThemeContext')
	return { createTheme, useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPSplitButton', () => 'QPSplitButton')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import TransactionFilterModal from './TransactionFilterModal'

const theme = createTheme(true)
const textStyles = createTextStyles(theme)

const renderModal = (props = {}) => {
	let tree
	act(() => {
		tree = create(
			<TransactionFilterModal
				visible
				draftFilters={{}}
				draftPeriod={null}
				onUpdateDraft={jest.fn()}
				onSetPeriod={jest.fn()}
				onClearPeriod={jest.fn()}
				onClear={jest.fn()}
				onApply={jest.fn()}
				onClose={jest.fn()}
				theme={theme}
				textStyles={textStyles}
				windowHeight={800}
				{...props}
			/>
		)
	})
	return tree.root.findByType('QPSplitButton')
}

test('sin filtros el slot de "Limpiar" queda cerrado', () => {
	expect(renderModal().props.showBack).toBe(false)
})

test('un filtro de estado abre "Limpiar"', () => {
	expect(renderModal({ draftFilters: { status: 'paid' } }).props.showBack).toBe(true)
})

test('un período seleccionado abre "Limpiar" aunque no haya otros filtros', () => {
	expect(renderModal({ draftPeriod: 2 }).props.showBack).toBe(true)
})

test('una clave deseleccionada (undefined) NO cuenta como filtro activo', () => {
	// onUpdateDraft escribe undefined al deseleccionar: la clave existe pero
	// el filtro no está puesto
	expect(renderModal({ draftFilters: { status: undefined, search: '' } }).props.showBack).toBe(false)
})

test('el primario aplica y el secundario limpia', () => {
	const onApply = jest.fn()
	const onClear = jest.fn()
	const button = renderModal({ draftFilters: { search: 'abc' }, onApply, onClear })
	expect(button.props.title).toBe('Aplicar')
	expect(button.props.backLabel).toBe('Limpiar')
	act(() => { button.props.onPress() })
	act(() => { button.props.onBack() })
	expect(onApply).toHaveBeenCalled()
	expect(onClear).toHaveBeenCalled()
})
