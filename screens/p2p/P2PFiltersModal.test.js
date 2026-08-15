/**
 * Render tests del modal de filtros del P2P: el botón "Limpiar" del
 * split-button solo se abre cuando hay al menos un filtro puesto.
 * @jest-environment node
 */
jest.mock('../../ui/particles/QPCoin', () => 'QPCoin')
jest.mock('../../ui/particles/QPInput', () => 'QPInput')
jest.mock('../../ui/particles/QPSwitch', () => 'QPSwitch')
jest.mock('../../ui/particles/QPSplitButton', () => 'QPSplitButton')
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { act, create } from 'react-test-renderer'
import { createTheme } from '../../theme/ThemeContext'
import { createTextStyles } from '../../theme/themeUtils'
import P2PFiltersModal from './P2PFiltersModal'

const theme = createTheme(true)
const textStyles = createTextStyles(theme)

const emptyFilters = {
	typeFilter: null, selectedCoin: null, showMine: false,
	minAmount: '', maxAmount: '', ratioMin: '', ratioMax: '', onlyVip: false,
}

const renderModal = (filters = {}, handlers = {}) => {
	let tree
	act(() => {
		tree = create(
			<P2PFiltersModal
				visible
				filters={{ ...emptyFilters, ...filters }}
				setFilter={jest.fn()}
				onOpenCoinPicker={jest.fn()}
				onClear={jest.fn()}
				onApply={jest.fn()}
				onClose={jest.fn()}
				windowHeight={800}
				theme={theme}
				textStyles={textStyles}
				{...handlers}
			/>
		)
	})
	return tree.root.findByType('QPSplitButton')
}

test('sin filtros el slot de "Limpiar" queda cerrado', () => {
	expect(renderModal().props.showBack).toBe(false)
})

test.each([
	['tipo', { typeFilter: 'buy' }],
	['moneda', { selectedCoin: { tick: 'BTC' } }],
	['mis ofertas', { showMine: true }],
	['monto mínimo', { minAmount: '10' }],
	['solo VIP', { onlyVip: true }],
])('un filtro de %s abre "Limpiar"', (_label, filters) => {
	expect(renderModal(filters).props.showBack).toBe(true)
})

test('reparte el espacio a partes iguales y limpia al pulsar el secundario', () => {
	const onClear = jest.fn()
	const button = renderModal({ onlyVip: true }, { onClear })
	expect(button.props.backRatio).toBe(0.5)
	act(() => { button.props.onBack() })
	expect(onClear).toHaveBeenCalled()
})
