/**
 * Render tests for the app-wide error boundary — node environment with the
 * icon pack mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('@react-native-vector-icons/fontawesome6', () => 'FontAwesome6')

import React from 'react'
import { Text } from 'react-native'
import { act, create } from 'react-test-renderer'
import ErrorBoundary from './ErrorBoundary'

const Bomb = ({ armed }) => {
	if (armed) { throw new Error('boom') }
	return <Text>contenido sano</Text>
}

// React logs boundary-caught errors via console.error — keep the output clean
let consoleSpy
beforeEach(() => { consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { consoleSpy.mockRestore() })

test('renders its children while nothing throws', () => {
	let tree
	act(() => {
		tree = create(
			<ErrorBoundary>
				<Bomb armed={false} />
			</ErrorBoundary>
		)
	})
	expect(JSON.stringify(tree.toJSON())).toContain('contenido sano')
})

test('a throwing descendant swaps in the Spanish fallback screen', () => {
	let tree
	act(() => {
		tree = create(
			<ErrorBoundary>
				<Bomb armed />
			</ErrorBoundary>
		)
	})
	const out = JSON.stringify(tree.toJSON())
	expect(out).toContain('Algo salió mal')
	expect(out).toContain('Ha ocurrido un error inesperado')
	expect(out).toContain('Reintentar')
	expect(out).not.toContain('contenido sano')
})

test('Reintentar clears the error, calls onReset and re-renders the children', () => {
	const onReset = jest.fn()
	let armed = true
	const Flaky = () => <Bomb armed={armed} />
	let tree
	act(() => {
		tree = create(
			<ErrorBoundary onReset={onReset}>
				<Flaky />
			</ErrorBoundary>
		)
	})
	expect(JSON.stringify(tree.toJSON())).toContain('Reintentar')

	armed = false // the underlying failure is gone; retry should succeed
	const retry = tree.root.find(node => typeof node.props.onPress === 'function')
	act(() => { retry.props.onPress() })
	expect(onReset).toHaveBeenCalled()
	expect(JSON.stringify(tree.toJSON())).toContain('contenido sano')
})

test('works without an onReset prop', () => {
	let tree
	act(() => {
		tree = create(
			<ErrorBoundary>
				<Bomb armed />
			</ErrorBoundary>
		)
	})
	const retry = tree.root.find(node => typeof node.props.onPress === 'function')
	expect(() => act(() => { retry.props.onPress() })).not.toThrow()
})
