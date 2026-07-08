/**
 * Render tests for the transaction loading skeleton — node environment with
 * theme and QPSkeleton mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('../theme/ThemeContext', () => {
	const { createTheme } = jest.requireActual('../theme/ThemeContext')
	return { useTheme: () => ({ theme: createTheme(true) }) }
})
jest.mock('../theme/themeUtils', () => ({
	useContainerStyles: () => ({ box: { flexDirection: 'row' } }),
}))
jest.mock('./particles/QPSkeleton', () => 'QPSkeleton')

import React from 'react'
import { act, create } from 'react-test-renderer'
import TransactionSkeleton from './TransactionSkeleton'

const renderRow = (index, totalItems) => {
	let tree
	act(() => { tree = create(<TransactionSkeleton index={index} totalItems={totalItems} />) })
	return tree.toJSON()
}

const cornerStyle = (json) => Object.assign({}, ...[].concat(json.props.style))

test('mirrors the QPTransaction layout with four skeleton blocks', () => {
	let tree
	act(() => { tree = create(<TransactionSkeleton index={0} totalItems={3} />) })
	expect(tree.root.findAllByType('QPSkeleton')).toHaveLength(4)
})

test('only the first row rounds its top corners', () => {
	const first = cornerStyle(renderRow(0, 3))
	expect(first.borderTopLeftRadius).toBe(10)
	expect(first.borderBottomLeftRadius).toBe(0)
	const middle = cornerStyle(renderRow(1, 3))
	expect(middle.borderTopLeftRadius).toBe(0)
	expect(middle.borderBottomLeftRadius).toBe(0)
})

test('only the last row rounds the bottom and carries the group margin', () => {
	const last = cornerStyle(renderRow(2, 3))
	expect(last.borderBottomLeftRadius).toBe(10)
	expect(last.borderBottomRightRadius).toBe(10)
	expect(last.marginBottom).toBe(10)
	expect(last.borderTopLeftRadius).toBe(0)
})

test('a single row rounds all four corners (it is first AND last)', () => {
	const only = cornerStyle(renderRow(0, 1))
	expect(only.borderTopLeftRadius).toBe(10)
	expect(only.borderBottomRightRadius).toBe(10)
})
